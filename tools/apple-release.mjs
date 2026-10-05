// App Store Connect orchestration only. Xcode Cloud owns building and signing.
import {createHash, createPrivateKey, sign} from 'node:crypto';
import {readFileSync, appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const ORIGIN = 'https://api.appstoreconnect.apple.com';
const ID = /^[A-Za-z0-9-]{1,100}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const MODES = ['smoke', 'status', 'dry-run', 'prepare', 'submit'];
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'];
export class ReleaseError extends Error {}
function requireThat(ok, message) { if (!ok) throw new ReleaseError(message); }
function exactKeys(value, keys, name) {
  requireThat(value && typeof value === 'object' && !Array.isArray(value), `${name} must be an object`);
  requireThat(Object.keys(value).sort().join() === [...keys].sort().join(), `Invalid ${name} fields`);
}
function resource(value, type, id) {
  requireThat(value?.type === type && typeof value.id === 'string' && ID.test(value.id) && (!id || value.id === id), `Invalid ${type} resource`);
  return value;
}
function relationship(value, name, type) {
  const data = value?.relationships?.[name]?.data;
  resource(data, type);
  return data.id;
}
export function manifestDigest(raw) { return createHash('sha256').update(raw).digest('hex'); }

export function validateManifest(m, {appId, releaseId, mode = 'status', now = Date.now()} = {}) {
  exactKeys(m, ['schemaVersion', 'releaseId', 'appId', 'bundleId', 'version', 'buildId', 'buildNumber',
    'ciBuildRunId', 'expectedCommit', 'releaseType', 'whatsNew', 'authorization'], 'manifest');
  requireThat(m.schemaVersion === 1 && typeof m.releaseId === 'string' && SLUG.test(m.releaseId) && m.releaseId === releaseId, 'Invalid release ID or schema');
  requireThat(typeof m.appId === 'string' && /^[1-9]\d{0,19}$/.test(m.appId) && m.appId === appId && m.bundleId === 'kr.io.breeze.app', 'App identity mismatch');
  requireThat(typeof m.version === 'string' && /^\d{1,3}\.\d{1,3}(?:\.\d{1,3})?$/.test(m.version), 'Invalid exact marketing version');
  requireThat(typeof m.buildNumber === 'string' && /^[1-9]\d{0,17}$/.test(m.buildNumber), 'Invalid exact build number');
  requireThat(typeof m.buildId === 'string' && typeof m.ciBuildRunId === 'string' && typeof m.expectedCommit === 'string' &&
    ID.test(m.buildId) && ID.test(m.ciBuildRunId) && SHA.test(m.expectedCommit), 'Invalid build or commit identity');
  requireThat(['MANUAL', 'AFTER_APPROVAL'].includes(m.releaseType), 'Explicit release type required');
  requireThat(m.whatsNew && typeof m.whatsNew === 'object' && !Array.isArray(m.whatsNew), 'Invalid localization map');
  const notes = Object.entries(m.whatsNew);
  requireThat(notes.length > 0 && notes.length <= 40, 'Provide bounded What\'s New localizations');
  for (const [locale, note] of notes) {
    requireThat(/^[a-z]{2}(?:-[A-Za-z0-9]{2,8}){0,2}$/.test(locale) &&
      typeof note === 'string' && note.trim().length > 0 && [...note].length <= 4000 &&
      !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(note), 'Invalid locale or What\'s New text');
  }
  exactKeys(m.authorization, ['operation', 'expiresAt'], 'authorization');
  requireThat(['none', 'prepare', 'submit'].includes(m.authorization.operation), 'Invalid authorized operation');
  requireThat(typeof m.authorization.expiresAt === 'string' &&
    /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(m.authorization.expiresAt) &&
    Number.isFinite(Date.parse(m.authorization.expiresAt)) &&
    new Date(m.authorization.expiresAt).toISOString() === m.authorization.expiresAt.replace('Z', '.000Z'), 'Invalid authorization expiry');
  if (['prepare', 'submit'].includes(mode)) {
    const expires = Date.parse(m.authorization.expiresAt);
    requireThat(m.authorization.operation === mode && expires > now && expires <= now + 86400000,
      'Write authorization must match the operation and expire within 24 hours');
  }
  return m;
}

// This gate runs before Apple secrets are attached. Only exact current-main events
// can proceed. A release tag binds the operation, release ID, and raw manifest hash.
export function validateInvocation({event, ref, eventSha, mainSha, inputs = {}, push, raw, appId, now}) {
  requireThat(SHA.test(mainSha) && eventSha === mainSha, 'Request must point to exact current main');
  if (event === 'push') requireThat(push?.created === true && push.deleted === false && push.forced === false &&
    push.after === eventSha, 'Only new lightweight release tags are accepted');
  let mode, releaseId, digest;
  if (event === 'workflow_dispatch') {
    requireThat(ref === 'refs/heads/main', 'Manual runs must use main');
    mode = inputs.mode ?? 'smoke'; releaseId = inputs.release_id; digest = inputs.manifest_sha256;
  } else if (event === 'push' && ref === 'refs/tags/apple-release/smoke') {
    return {mode: 'smoke'};
  } else if (event === 'push') {
    const match = /^refs\/tags\/apple-release\/(status|dry-run|prepare|submit)\/([a-z0-9][a-z0-9-]{0,63})\/([a-f0-9]{64})$/.exec(ref);
    requireThat(match, 'Invalid bounded release tag');
    [, mode, releaseId, digest] = match;
  } else throw new ReleaseError('Unsupported event');
  requireThat(MODES.includes(mode), 'Invalid operation');
  if (mode === 'smoke') return {mode};
  requireThat(SLUG.test(releaseId) && DIGEST.test(digest) && digest === manifestDigest(raw), 'Manifest identity or digest mismatch');
  let m;
  try { m = JSON.parse(raw); } catch { throw new ReleaseError('Invalid manifest JSON'); }
  validateManifest(m, {mode, releaseId, appId, now});
  if (event === 'workflow_dispatch' && ['prepare', 'submit'].includes(mode)) {
    requireThat(inputs.confirmation === `${mode}:${releaseId}:${digest}`, 'Explicit write confirmation required');
  }
  return {mode, releaseId, digest, manifest: m};
}

export function tokenFactory(env, clock = Date.now) {
  requireThat(['individual', 'team'].includes(env.ASC_KEY_TYPE), 'Set ASC_KEY_TYPE to individual or team');
  requireThat(/^[A-Z0-9]{10}$/.test(env.ASC_KEY_ID ?? ''), 'Invalid or missing ASC_KEY_ID');
  if (env.ASC_KEY_TYPE === 'team') requireThat(/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(env.ASC_ISSUER_ID ?? ''), 'Team issuer ID required');
  else requireThat(!env.ASC_ISSUER_ID, 'Individual keys must omit issuer ID');
  let key;
  try { key = createPrivateKey(env.ASC_PRIVATE_KEY); } catch { throw new ReleaseError('Missing or invalid ASC private key'); }
  requireThat(key.asymmetricKeyType === 'ec' && key.asymmetricKeyDetails?.namedCurve === 'prime256v1', 'ASC requires a P-256 private key');
  const b64 = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return () => {
    const iat = Math.floor(clock() / 1000);
    const claims = {iat, exp: iat + 300, aud: 'appstoreconnect-v1',
      ...(env.ASC_KEY_TYPE === 'team' ? {iss: env.ASC_ISSUER_ID} : {sub: 'user'})};
    const unsigned = `${b64({alg: 'ES256', kid: env.ASC_KEY_ID, typ: 'JWT'})}.${b64(claims)}`;
    return `${unsigned}.${sign('sha256', Buffer.from(unsigned), {key, dsaEncoding: 'ieee-p1363'}).toString('base64url')}`;
  };
}

export function createClient({token, fetchImpl = fetch, allowWrites = false}) {
  const allowedWrite = /^(?:\/v1\/(?:appStoreVersions|appStoreVersionLocalizations|reviewSubmissions|reviewSubmissionItems)|\/v1\/(?:appStoreVersions\/[A-Za-z0-9-]+(?:\/relationships\/build)?|appStoreVersionLocalizations\/[A-Za-z0-9-]+|reviewSubmissions\/[A-Za-z0-9-]+))$/;
  async function request(method, path, body) {
    const url = new URL(path, ORIGIN);
    requireThat(url.origin === ORIGIN && !url.username && !url.password && !url.hash &&
      /^\/v1\/[A-Za-z0-9/-]+$/.test(url.pathname), 'Invalid ASC URL');
    requireThat(method === 'GET' || (allowWrites && ['POST', 'PATCH'].includes(method) &&
      allowedWrite.test(url.pathname) && !url.search), 'Apple writes disabled or endpoint forbidden');
    let response;
    try {
      response = await fetchImpl(url.href, {method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: {Authorization: `Bearer ${token()}`, 'Content-Type': 'application/json'},
        ...(body ? {body: JSON.stringify(body)} : {})});
    } catch { throw new ReleaseError('ASC transport failure; inspect status before retrying (writes are never retried)'); }
    requireThat(response.ok, `ASC HTTP ${response.status}; inspect permissions, agreements, metadata, or current state`);
    if (response.status === 204) return {};
    try { return await response.json(); } catch { throw new ReleaseError('Invalid ASC JSON response'); }
  }
  return {
    request,
    async list(path) {
      const values = [], seen = new Set();
      for (let page = 0; path && page < 20; page++) {
        requireThat(!seen.has(path), 'Repeated ASC pagination link'); seen.add(path);
        const result = await request('GET', path);
        requireThat(Array.isArray(result.data), 'Invalid ASC list response');
        values.push(...result.data); path = result.links?.next;
      }
      requireThat(!path, 'ASC pagination bound exceeded');
      return values;
    },
  };
}
const query = values => new URLSearchParams(values).toString();
const link = (type, id) => ({data: {type, id}});
const payload = (type, attributes, relationships, id) => ({data: {type,
  ...(id ? {id} : {}), ...(attributes ? {attributes} : {}), ...(relationships ? {relationships} : {})}});
const state = version => version.attributes?.appVersionState ?? version.attributes?.appStoreState;

async function inspect(client, m) {
  const get = async (path, type, id) => resource((await client.request('GET', path)).data, type, id);
  const app = await get(`/v1/apps/${m.appId}`, 'apps', m.appId);
  requireThat(app.attributes?.bundleId === m.bundleId, 'ASC app bundle mismatch');
  const run = await get(`/v1/ciBuildRuns/${m.ciBuildRunId}`, 'ciBuildRuns', m.ciBuildRunId);
  requireThat(run.attributes?.sourceCommit?.commitSha === m.expectedCommit && run.attributes?.isPullRequestBuild === false &&
    run.attributes?.executionProgress === 'COMPLETE' && run.attributes?.completionStatus === 'SUCCEEDED', 'Cloud run commit or completion mismatch');
  const runBuilds = await client.list(`/v1/ciBuildRuns/${m.ciBuildRunId}/builds?limit=200`);
  requireThat(runBuilds.filter(b => b.type === 'builds' && b.id === m.buildId).length === 1, 'Build is not uniquely linked to expected Cloud run');
  const build = await get(`/v1/builds/${m.buildId}`, 'builds', m.buildId);
  requireThat(relationship(build, 'app', 'apps') === m.appId && build.attributes?.version === m.buildNumber &&
    build.attributes?.processingState === 'VALID' && build.attributes?.expired === false, 'Build app, number, or readiness mismatch');
  const preId = relationship(build, 'preReleaseVersion', 'preReleaseVersions');
  const pre = await get(`/v1/preReleaseVersions/${preId}`, 'preReleaseVersions', preId);
  requireThat(pre.attributes?.version === m.version && pre.attributes?.platform === 'IOS', 'Build marketing version or platform mismatch');
  const versions = await client.list(`/v1/apps/${m.appId}/appStoreVersions?${query({'filter[versionString]': m.version, 'filter[platform]': 'IOS', limit: '200'})}`);
  requireThat(versions.length <= 1, 'Ambiguous App Store version');
  const version = versions[0];
  if (version) {
    resource(version, 'appStoreVersions');
    requireThat(version.attributes?.versionString === m.version && version.attributes?.platform === 'IOS', 'App Store version mismatch');
  }
  return {version};
}

async function versionContents(client, version) {
  const notes = await client.list(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=200`);
  const locales = new Map();
  for (const note of notes) {
    resource(note, 'appStoreVersionLocalizations');
    requireThat(typeof note.attributes?.locale === 'string' && !locales.has(note.attributes.locale), 'Duplicate or missing ASC locale');
    locales.set(note.attributes.locale, note);
  }
  const build = (await client.request('GET', `/v1/appStoreVersions/${version.id}/relationships/build`)).data;
  if (build !== null) resource(build, 'builds');
  return {locales, selectedBuild: build?.id};
}
function contentsMatch(version, contents, m) {
  return version.attributes?.releaseType === m.releaseType && contents.selectedBuild === m.buildId &&
    Object.entries(m.whatsNew).every(([locale, text]) => contents.locales.get(locale)?.attributes?.whatsNew === text);
}

async function reviewState(client, appId, versionId) {
  const submissions = await client.list(`/v1/apps/${appId}/reviewSubmissions?${query({'filter[platform]': 'IOS', limit: '200'})}`);
  let matching;
  for (const submission of submissions) {
    resource(submission, 'reviewSubmissions');
    requireThat(submission.attributes?.platform === 'IOS' && typeof submission.attributes.state === 'string', 'Invalid review platform/state');
    const items = await client.list(`/v1/reviewSubmissions/${submission.id}/items?limit=200`);
    const matches = items.filter(item => item.relationships?.appStoreVersion?.data?.id === versionId && versionId);
    if (matches.length) {
      requireThat(items.length === 1 && matches.length === 1 && !matching, 'Submission must contain exactly this version, once');
      resource(matches[0], 'reviewSubmissionItems');
      requireThat(relationship(matches[0], 'appStoreVersion', 'appStoreVersions') === versionId, 'Review item version mismatch');
      matching = submission;
    } else requireThat(submission.attributes.state === 'COMPLETE', 'Unrelated or empty active submission; reconcile in ASC first');
  }
  return matching;
}

export async function release(client, m, mode = 'status', clock = Date.now) {
  validateManifest(m, {appId: m.appId, releaseId: m.releaseId, mode, now: clock()});
  requireThat(['status', 'dry-run', 'prepare', 'submit'].includes(mode), 'Invalid release mode');
  const write = ['prepare', 'submit'].includes(mode);
  const change = async (...args) => {
    validateManifest(m, {appId: m.appId, releaseId: m.releaseId, mode, now: clock()});
    return client.request(...args);
  };
  let {version} = await inspect(client, m);
  let contents = version ? await versionContents(client, version) : null;
  let review = await reviewState(client, m.appId, version?.id);
  if (review?.attributes?.submittedDate) {
    requireThat(contentsMatch(version, contents, m), 'Submitted version does not match authorized manifest');
    return {result: 'already-submitted', versionId: version.id, submissionId: review.id};
  }
  if (version) requireThat(EDITABLE.includes(state(version)) ||
    (state(version) === 'READY_FOR_REVIEW' && review && contentsMatch(version, contents, m)), 'Version is not safely editable');
  if (review) requireThat(review.attributes.state === 'READY_FOR_REVIEW' && contentsMatch(version, contents, m), 'Review draft needs reconciliation');
  const plan = {result: write ? 'prepared' : mode, versionId: version?.id ?? null,
    createVersion: !version, selectBuild: contents?.selectedBuild !== m.buildId,
    updateLocales: Object.entries(m.whatsNew).filter(([locale, text]) => contents?.locales.get(locale)?.attributes?.whatsNew !== text).map(([locale]) => locale),
    releaseType: m.releaseType, submit: mode === 'submit'};
  if (!write) return plan;
  // No destructive changes, build starts/uploads, beta invitations, or retries.
  if (!version) {
    version = resource((await change('POST', '/v1/appStoreVersions', payload('appStoreVersions',
      {versionString: m.version, platform: 'IOS', releaseType: m.releaseType}, {app: link('apps', m.appId)}))).data, 'appStoreVersions');
    contents = await versionContents(client, version);
  } else if (version.attributes.releaseType !== m.releaseType) {
    await change('PATCH', `/v1/appStoreVersions/${version.id}`, payload('appStoreVersions', {releaseType: m.releaseType}, null, version.id));
  }
  for (const [locale, whatsNew] of Object.entries(m.whatsNew)) {
    const existing = contents.locales.get(locale);
    if (existing?.attributes?.whatsNew === whatsNew) continue;
    if (existing) await change('PATCH', `/v1/appStoreVersionLocalizations/${existing.id}`,
      payload('appStoreVersionLocalizations', {whatsNew}, null, existing.id));
    else await change('POST', '/v1/appStoreVersionLocalizations', payload('appStoreVersionLocalizations',
      {locale, whatsNew}, {appStoreVersion: link('appStoreVersions', version.id)}));
  }
  if (contents.selectedBuild !== m.buildId) await change('PATCH', `/v1/appStoreVersions/${version.id}/relationships/build`, link('builds', m.buildId));
  version = resource((await client.request('GET', `/v1/appStoreVersions/${version.id}`)).data, 'appStoreVersions', version.id);
  requireThat(version.attributes?.versionString === m.version && version.attributes?.platform === 'IOS' &&
    contentsMatch(version, await versionContents(client, version), m), 'Release metadata read-back mismatch');
  if (mode === 'prepare') return {...plan, versionId: version.id};
  validateManifest(m, {appId: m.appId, releaseId: m.releaseId, mode, now: clock()});
  // Recheck all provenance and active submissions immediately before submitting.
  await inspect(client, m);
  review = await reviewState(client, m.appId, version.id);
  if (review?.attributes?.submittedDate) return {result: 'already-submitted', versionId: version.id, submissionId: review.id};
  if (!review) {
    review = resource((await change('POST', '/v1/reviewSubmissions', payload('reviewSubmissions',
      {platform: 'IOS'}, {app: link('apps', m.appId)}))).data, 'reviewSubmissions');
    await change('POST', '/v1/reviewSubmissionItems', payload('reviewSubmissionItems', null,
      {reviewSubmission: link('reviewSubmissions', review.id), appStoreVersion: link('appStoreVersions', version.id)}));
  }
  const ready = await reviewState(client, m.appId, version.id);
  requireThat(ready?.id === review.id && ready.attributes.state === 'READY_FOR_REVIEW' && !ready.attributes.submittedDate,
    'Review submission changed before submit');
  const finalVersion = resource((await client.request('GET', `/v1/appStoreVersions/${version.id}`)).data, 'appStoreVersions', version.id);
  requireThat(finalVersion.attributes?.versionString === m.version && finalVersion.attributes?.platform === 'IOS' &&
    contentsMatch(finalVersion, await versionContents(client, finalVersion), m), 'Release contents changed before submit');
  validateManifest(m, {appId: m.appId, releaseId: m.releaseId, mode, now: clock()});
  await change('PATCH', `/v1/reviewSubmissions/${review.id}`, payload('reviewSubmissions', {submitted: true}, null, review.id));
  const submitted = resource((await client.request('GET', `/v1/reviewSubmissions/${review.id}`)).data, 'reviewSubmissions', review.id);
  requireThat(submitted.attributes?.submittedDate && submitted.attributes.state !== 'READY_FOR_REVIEW', 'Submission not yet confirmed; inspect status before retrying');
  return {result: 'submitted', versionId: version.id, submissionId: review.id};
}

function git(...args) { return execFileSync('git', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim(); }
async function main(env) {
  requireThat(!env.ACTIONS_STEP_DEBUG || env.ACTIONS_STEP_DEBUG !== 'true', 'Disable Actions step debug for Apple operations');
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, 'utf8'));
  const inputs = event.inputs ?? {};
  const tagMatch = /^refs\/tags\/apple-release\/[^/]+\/([^/]+)\//.exec(env.GITHUB_REF ?? '');
  const releaseId = tagMatch?.[1] ?? inputs.release_id;
  const mode = env.GITHUB_REF === 'refs/tags/apple-release/smoke' ? 'smoke' :
    tagMatch ? env.GITHUB_REF.split('/')[3] : inputs.mode ?? 'smoke';
  requireThat(mode === 'smoke' || SLUG.test(releaseId), 'Invalid release ID');
  const raw = mode === 'smoke' ? '' : readFileSync(`releases/apple/${releaseId}.json`, 'utf8');
  const invocation = validateInvocation({event: env.GITHUB_EVENT_NAME, ref: env.GITHUB_REF,
    eventSha: env.GITHUB_SHA, mainSha: git('rev-parse', 'HEAD'), inputs, push: event, raw, appId: env.ASC_APP_ID});
  if (invocation.manifest) git('merge-base', '--is-ancestor', invocation.manifest.expectedCommit, 'HEAD');
  if (process.argv.includes('--gate')) {
    requireThat(env.GITHUB_OUTPUT, 'GitHub output file required');
    appendFileSync(env.GITHUB_OUTPUT, `mode=${invocation.mode}\nrelease_id=${invocation.releaseId ?? ''}\nmain_sha=${git('rev-parse', 'HEAD')}\n`);
    console.log('Validated trusted-main request; no credentials used.'); return;
  }
  if (invocation.mode === 'smoke') { console.log('Secret-free setup smoke passed; Apple access remains unverified.'); return; }
  requireThat(env.ASC_RELEASE_ENABLED === 'true', 'Secure Apple environment setup is not enabled');
  const allowWrites = ['prepare', 'submit'].includes(invocation.mode);
  if (allowWrites) requireThat(env.ASC_WRITES_ENABLED === 'true', 'Apple writes require separate schema verification and secure setup');
  const client = createClient({token: tokenFactory(env), allowWrites});
  const result = await release(client, invocation.manifest, invocation.mode);
  console.log(JSON.stringify(result));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.env).catch(error => {
    // Never print a stack, request headers, raw server response, key, or JWT.
    console.error(error instanceof ReleaseError ? error.message : 'Release validation failed; check trusted inputs and repository state.');
    process.exitCode = 1;
  });
}
