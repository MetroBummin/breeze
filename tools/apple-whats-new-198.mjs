// Update only the Korean What's New for the approved 1.9.8 build 345.
// Prints no keys, JWTs, or raw Apple bodies.
import {existsSync, readFileSync} from 'node:fs';
import {ReleaseError, tokenFactory} from './apple-release.mjs';

const APP_ID = '6804570182';
const VERSION = '1.9.8';
const BUILD_ID = 'e062bd4d-9c09-49df-875e-4d2fd54935cc';
const BUILD_NUMBER = '345';
const REQUEST = 'releases/apple/live/whats-new-198.json';
const CONFIRM = 'whats-new:breeze-198';
const ORIGIN = 'https://api.appstoreconnect.apple.com';
const WHATS_NEW = [
  '새로 들어온 책',
  '• 셜록 홈즈 장편 3권이 고전 서재에 추가됐어요.',
  '• 홈즈 단편에 원작 삽화가 함께 나와요.',
  '• 모든 고전의 소개글을 새로 썼어요. 어떤 이야기인지 한눈에 궁금해지도록요.',
  '',
  '더 편해진 읽기',
  '• 텍스트 모드에서 읽다가 원본(EPUB·PDF)으로 넘어가도 읽던 곳 그대로 이어져요.',
  '• 책 첫 페이지가 더 깔끔하게 정돈돼서 보여요.',
  '• 읽다가 화면이 실수로 확대되지 않아요.',
  '• 단어를 탭하고 뜻을 기다리는 동안 문장이 흔들리지 않아요.',
  '',
  '새 기능',
  '• 공유 버튼으로 AO3 공개 작품을 바로 열어 읽을 수 있어요.',
  '',
  '기타',
  '• 로그인하지 않아도 단어 뜻을 제한 없이 찾을 수 있어요.',
  '• 앱을 처음 열 때 홈 화면이 더 안정적으로 떠요.',
  '• 자잘한 버그를 고쳤어요.',
].join('\n');

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
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
function payload(type, id, attributes, relationships) {
  return {data: {type, ...(id ? {id} : {}), ...(attributes ? {attributes} : {}), ...(relationships ? {relationships} : {})}};
}
function link(type, id) { return {data: {type, id}}; }

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
  if (buildId) {
    const build = (await get(token, `/v1/builds/${buildId}`)).data;
    buildNumber = build?.attributes?.version ?? null;
  }
  const submissions = await list(token, `/v1/apps/${APP_ID}/reviewSubmissions?filter[platform]=IOS&limit=20`);
  const related = [];
  for (const submission of submissions) {
    const items = await list(token, `/v1/reviewSubmissions/${submission.id}/items?include=appStoreVersion&limit=20`);
    const matches = items.filter(item => item.relationships?.appStoreVersion?.data?.id === version.id);
    if (!matches.length) {
      if (submission.attributes?.state !== 'COMPLETE') throw new ReleaseError(`Unrelated review submission ${submission.id} is ${submission.attributes?.state}`);
      continue;
    }
    if (matches.length !== 1 || items.length !== 1) throw new ReleaseError('Review submission does not contain exactly this version');
    related.push({id: submission.id, state: submission.attributes?.state ?? null,
      submittedDate: submission.attributes?.submittedDate ?? null, itemState: matches[0].attributes?.state ?? null});
  }
  const notes = new Map(localizations.map(item => [item.attributes?.locale, item.attributes?.whatsNew ?? null]));
  return {version, localizations, buildId, buildNumber, related, notes};
}

function assertSameBuild(found) {
  if (found.buildId !== BUILD_ID || found.buildNumber !== BUILD_NUMBER) {
    throw new ReleaseError(`Build changed (${found.buildNumber ?? 'none'} ${found.buildId ?? 'none'})`);
  }
}
function othersUnchanged(before, after) {
  for (const [locale, text] of before) {
    if (locale === 'ko') continue;
    if (after.get(locale) !== text) throw new ReleaseError(`Localization ${locale} changed`);
  }
  for (const locale of after.keys()) {
    if (locale !== 'ko' && !before.has(locale)) throw new ReleaseError(`Unexpected localization ${locale}`);
  }
}

async function patchNote(token, localizationId) {
  return asc(token, 'PATCH', `/v1/appStoreVersionLocalizations/${localizationId}`,
    payload('appStoreVersionLocalizations', localizationId, {whatsNew: WHATS_NEW}));
}

async function ensureSameRelease(token, versionId, releaseType) {
  let current = await snapshot(token);
  if (!current.buildId) {
    const attached = await asc(token, 'PATCH', `/v1/appStoreVersions/${versionId}/relationships/build`, link('builds', BUILD_ID));
    if (!attached.ok) throw new ReleaseError(explain(attached));
    current = await snapshot(token);
  }
  assertSameBuild(current);
  if (current.version.attributes?.releaseType !== releaseType) {
    const restored = await asc(token, 'PATCH', `/v1/appStoreVersions/${versionId}`,
      payload('appStoreVersions', versionId, {releaseType}));
    if (!restored.ok) throw new ReleaseError(explain(restored));
    current = await snapshot(token);
    if (current.version.attributes?.releaseType !== releaseType) throw new ReleaseError('Release type could not be restored');
  }
  return current;
}

async function cancelAndResubmit(token, found) {
  const active = found.related.filter(item => item.state !== 'COMPLETE');
  if (active.length !== 1) throw new ReleaseError(`Expected one active review submission, found ${active.length}`);
  const submission = active[0];
  const releaseType = found.version.attributes?.releaseType;
  if (!['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(submission.state)) {
    throw new ReleaseError(`Review state ${submission.state} was not canceled`);
  }
  const canceled = await asc(token, 'PATCH', `/v1/reviewSubmissions/${submission.id}`,
    payload('reviewSubmissions', submission.id, {canceled: true}));
  if (!canceled.ok) throw new ReleaseError(explain(canceled));
  let current = found;
  for (let attempt = 1; attempt <= 12; attempt++) {
    await sleep(10_000);
    current = await snapshot(token);
    const canceledState = current.related.find(item => item.id === submission.id)?.state ?? 'COMPLETE';
    const editable = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'READY_FOR_REVIEW'].includes(versionState(current.version));
    console.log(JSON.stringify({attempt, versionState: versionState(current.version), review: current.related, editable, canceledState}));
    if (canceledState === 'COMPLETE' && editable) break;
    if (attempt === 12) throw new ReleaseError('Review cancellation did not unlock the version');
  }
  current = await ensureSameRelease(token, current.version.id, releaseType);
  const ko = current.localizations.find(item => item.attributes?.locale === 'ko');
  if (!ko) throw new ReleaseError('Korean localization is missing');
  const patched = await patchNote(token, ko.id);
  if (!patched.ok) throw new ReleaseError(explain(patched));
  current = await ensureSameRelease(token, current.version.id, releaseType);
  othersUnchanged(found.notes, current.notes);
  if (current.notes.get('ko') !== WHATS_NEW) throw new ReleaseError('What\'s New read-back did not match');
  const open = current.related.filter(item => !['COMPLETE', 'CANCELING'].includes(item.state));
  if (open.length > 1) throw new ReleaseError('More than one open review submission');
  let review = open[0];
  if (review && review.state !== 'READY_FOR_REVIEW') throw new ReleaseError(`Open review is ${review.state}`);
  if (!review) {
    const created = await asc(token, 'POST', '/v1/reviewSubmissions',
      payload('reviewSubmissions', null, {platform: 'IOS'}, {app: link('apps', APP_ID)}));
    if (!created.ok) throw new ReleaseError(explain(created));
    const item = await asc(token, 'POST', '/v1/reviewSubmissionItems', payload('reviewSubmissionItems', null, null,
      {reviewSubmission: link('reviewSubmissions', created.json.data.id), appStoreVersion: link('appStoreVersions', current.version.id)}));
    if (!item.ok) throw new ReleaseError(explain(item));
    review = {id: created.json.data.id};
  }
  const submitted = await asc(token, 'PATCH', `/v1/reviewSubmissions/${review.id}`,
    payload('reviewSubmissions', review.id, {submitted: true}));
  if (!submitted.ok) throw new ReleaseError(explain(submitted));
  let confirmed = await snapshot(token);
  for (let attempt = 1; attempt <= 6; attempt++) {
    const active = confirmed.related.find(item => item.id === review.id);
    console.log(JSON.stringify({submitAttempt: attempt, state: active?.state ?? null, itemState: active?.itemState ?? null}));
    if (active && ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(active.state)) return confirmed;
    if (attempt === 6) break;
    await sleep(5_000);
    confirmed = await snapshot(token);
  }
  throw new ReleaseError('Resubmission was not confirmed');
}

function report(found, pulled) {
  console.log(JSON.stringify({
    pulled,
    resubmitted: pulled,
    locales: [...found.notes.keys()],
    koWhatsNew: found.notes.get('ko') ?? null,
    match: found.notes.get('ko') === WHATS_NEW,
    reviewState: (found.related.find(item => item.state !== 'COMPLETE') ?? found.related[0])?.state ?? null,
    itemState: (found.related.find(item => item.state !== 'COMPLETE') ?? found.related[0])?.itemState ?? null,
    versionState: versionState(found.version),
    releaseType: found.version.attributes?.releaseType ?? null,
    buildNumber: found.buildNumber,
    buildId: found.buildId,
  }));
}

async function main() {
  if (process.argv.includes('--print-note')) {
    process.stdout.write(WHATS_NEW);
    return;
  }
  if (!existsSync(REQUEST)) {
    console.log(JSON.stringify({run: false, reason: 'no-request'}));
    return;
  }
  const request = JSON.parse(readFileSync(REQUEST, 'utf8'));
  if (request?.confirmation !== CONFIRM) {
    console.log(JSON.stringify({run: false, reason: 'unconfirmed'}));
    return;
  }
  if (![...WHATS_NEW].length || [...WHATS_NEW].length > 4000) throw new ReleaseError('What\'s New length is invalid');
  const token = tokenFactory(process.env);
  const before = await snapshot(token);
  assertSameBuild(before);
  console.log(JSON.stringify({
    locales: [...before.notes.keys()],
    versionState: versionState(before.version),
    releaseType: before.version.attributes?.releaseType ?? null,
    review: before.related,
    buildNumber: before.buildNumber,
  }));
  const ko = before.localizations.find(item => item.attributes?.locale === 'ko');
  if (!ko) throw new ReleaseError('Korean localization is missing');
  const waiting = before.related.some(item => ['WAITING_FOR_REVIEW', 'IN_REVIEW'].includes(item.state));
  if (before.notes.get('ko') === WHATS_NEW && waiting) {
    report(before, false);
    return;
  }
  if (before.notes.get('ko') === WHATS_NEW) {
    const releaseType = before.version.attributes?.releaseType;
    let current = await ensureSameRelease(token, before.version.id, releaseType);
    othersUnchanged(before.notes, current.notes);
    const open = current.related.filter(item => !['COMPLETE', 'CANCELING'].includes(item.state));
    if (open.length > 1) throw new ReleaseError('More than one open review submission');
    let review = open[0];
    if (review && review.state !== 'READY_FOR_REVIEW') throw new ReleaseError(`Open review is ${review.state}`);
    if (!review) {
      const created = await asc(token, 'POST', '/v1/reviewSubmissions',
        payload('reviewSubmissions', null, {platform: 'IOS'}, {app: link('apps', APP_ID)}));
      if (!created.ok) throw new ReleaseError(explain(created));
      const item = await asc(token, 'POST', '/v1/reviewSubmissionItems', payload('reviewSubmissionItems', null, null,
        {reviewSubmission: link('reviewSubmissions', created.json.data.id), appStoreVersion: link('appStoreVersions', current.version.id)}));
      if (!item.ok) throw new ReleaseError(explain(item));
      review = {id: created.json.data.id};
    }
    const submitted = await asc(token, 'PATCH', `/v1/reviewSubmissions/${review.id}`,
      payload('reviewSubmissions', review.id, {submitted: true}));
    if (!submitted.ok) throw new ReleaseError(explain(submitted));
    current = await snapshot(token);
    report(current, true);
    return;
  }
  const patched = await patchNote(token, ko.id);
  if (patched.ok) {
    const after = await snapshot(token);
    othersUnchanged(before.notes, after.notes);
    assertSameBuild(after);
    if (after.version.attributes?.releaseType !== before.version.attributes?.releaseType) {
      throw new ReleaseError('Release type changed');
    }
    report(after, false);
    if (after.notes.get('ko') !== WHATS_NEW) throw new ReleaseError('What\'s New read-back did not match');
    return;
  }
  console.log(JSON.stringify({directPatch: explain(patched)}));
  if (![409, 422].includes(patched.status)) throw new ReleaseError(explain(patched));
  const after = await cancelAndResubmit(token, before);
  report(after, true);
  if (after.notes.get('ko') !== WHATS_NEW) throw new ReleaseError('What\'s New read-back did not match');
  const active = after.related.find(item => ['WAITING_FOR_REVIEW', 'IN_REVIEW', 'READY_FOR_REVIEW'].includes(item.state));
  if (!active) throw new ReleaseError('Resubmission was not confirmed');
}

main().catch(error => {
  console.error(error instanceof ReleaseError ? error.message : 'What\'s New update failed');
  process.exitCode = 1;
});
