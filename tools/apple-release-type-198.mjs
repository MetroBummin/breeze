// Set only the 1.9.8 release type to AFTER_APPROVAL. Never cancels review.
import {existsSync, readFileSync} from 'node:fs';
import {ReleaseError, tokenFactory} from './apple-release.mjs';

const APP_ID = '6804570182';
const VERSION = '1.9.8';
const BUILD_ID = 'e062bd4d-9c09-49df-875e-4d2fd54935cc';
const BUILD_NUMBER = '345';
const REQUEST = 'releases/apple/live/release-type-198.json';
const CONFIRM = 'release-type:breeze-198';
const ORIGIN = 'https://api.appstoreconnect.apple.com';

function explain(result) {
  const errors = result.json?.errors;
  if (!Array.isArray(errors) || !errors.length) return `ASC HTTP ${result.status}`;
  return errors.slice(0, 3).map(error => ['ASC HTTP', error.status || result.status, error.code, error.title, error.detail]
    .filter(Boolean).join(' ')).join(' | ').slice(0, 800);
}
async function asc(token, method, path, body) {
  const url = new URL(path, ORIGIN);
  if (url.origin !== ORIGIN || !url.pathname.startsWith('/v1/')) throw new ReleaseError('Invalid ASC URL');
  let response;
  try {
    response = await fetch(url, {method, redirect: 'error', signal: AbortSignal.timeout(30000),
      headers: {Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json'},
      ...(body ? {body: JSON.stringify(body)} : {})});
  } catch { throw new ReleaseError('ASC transport failure'); }
  const text = await response.text();
  let json = {};
  if (text) {
    try { json = JSON.parse(text); } catch { throw new ReleaseError(`ASC HTTP ${response.status} returned non-JSON`); }
  }
  return {ok: response.ok, status: response.status, json};
}
async function get(token, path) {
  const result = await asc(token, 'GET', path);
  if (!result.ok) throw new ReleaseError(explain(result));
  return result.json;
}
async function list(token, path) {
  const values = [];
  const seen = new Set();
  for (let page = 0; path && page < 20; page++) {
    if (seen.has(path)) throw new ReleaseError('Repeated ASC pagination link');
    seen.add(path);
    const result = await get(token, path);
    if (!Array.isArray(result.data)) throw new ReleaseError('Invalid ASC list response');
    values.push(...result.data);
    path = result.links?.next || '';
  }
  if (path) throw new ReleaseError('ASC pagination bound exceeded');
  return values;
}
function versionState(version) {
  return version?.attributes?.appVersionState ?? version?.attributes?.appStoreState ?? null;
}
async function snapshot(token) {
  const versions = await list(token, `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${VERSION}&filter[platform]=IOS&limit=10`);
  if (versions.length !== 1 || versions[0]?.attributes?.versionString !== VERSION || versions[0]?.attributes?.platform !== 'IOS') {
    throw new ReleaseError(`Expected one iOS ${VERSION} version`);
  }
  const version = (await get(token, `/v1/appStoreVersions/${versions[0].id}`)).data;
  const localizations = await list(token, `/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=50`);
  const buildLink = await get(token, `/v1/appStoreVersions/${version.id}/relationships/build`);
  const buildId = buildLink.data?.id ?? null;
  let buildNumber = null;
  if (buildId) buildNumber = (await get(token, `/v1/builds/${buildId}`)).data?.attributes?.version ?? null;
  const submissions = await list(token, `/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=20`);
  const related = [];
  for (const submission of submissions) {
    const items = await list(token, `/v1/reviewSubmissions/${submission.id}/items?limit=20`);
    const matches = items.filter(item => item.relationships?.appStoreVersion?.data?.id === version.id);
    if (!matches.length) continue;
    if (matches.length !== 1 || items.length !== 1) throw new ReleaseError('Review submission does not contain exactly this version');
    related.push({id: submission.id, state: submission.attributes?.state ?? null, itemState: matches[0].attributes?.state ?? null});
  }
  const notes = Object.fromEntries(localizations.map(item => [item.attributes?.locale, item.attributes?.whatsNew ?? null]));
  return {version, buildId, buildNumber, related, notes};
}
function report(found, patch) {
  const review = found.related.find(item => item.state !== 'COMPLETE') ?? found.related[0] ?? null;
  console.log(JSON.stringify({
    releaseType: found.version.attributes?.releaseType ?? null,
    versionState: versionState(found.version),
    reviewState: review?.state ?? null,
    itemState: review?.itemState ?? null,
    buildNumber: found.buildNumber,
    buildId: found.buildId,
    patch: patch ?? null,
  }));
}

async function main() {
  if (!existsSync(REQUEST)) {
    console.log(JSON.stringify({run: false, reason: 'no-request'}));
    return;
  }
  const request = JSON.parse(readFileSync(REQUEST, 'utf8'));
  if (request?.confirmation !== CONFIRM) {
    console.log(JSON.stringify({run: false, reason: 'unconfirmed'}));
    return;
  }
  const token = tokenFactory(process.env);
  const before = await snapshot(token);
  if (before.buildId !== BUILD_ID || before.buildNumber !== BUILD_NUMBER) {
    throw new ReleaseError(`Refusing to change a different build (${before.buildNumber ?? 'none'})`);
  }
  if (before.version.attributes?.releaseType === 'AFTER_APPROVAL') {
    report(before, 'already-set');
    return;
  }
  const patched = await asc(token, 'PATCH', `/v1/appStoreVersions/${before.version.id}`, {data: {
    type: 'appStoreVersions', id: before.version.id, attributes: {releaseType: 'AFTER_APPROVAL'},
  }});
  const after = await snapshot(token);
  if (JSON.stringify(after.notes) !== JSON.stringify(before.notes) || after.buildId !== before.buildId) {
    throw new ReleaseError('Notes or build changed');
  }
  if (!patched.ok) {
    report(after, explain(patched));
    if ([409, 422, 403].includes(patched.status)) return;
    throw new ReleaseError(explain(patched));
  }
  report(after, 'updated');
  if (after.version.attributes?.releaseType !== 'AFTER_APPROVAL') throw new ReleaseError('Release type read-back was not AFTER_APPROVAL');
}

main().catch(error => {
  console.error(error instanceof ReleaseError ? error.message : 'Release type update failed');
  process.exitCode = 1;
});
