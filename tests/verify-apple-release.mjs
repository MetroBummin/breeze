import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync, verify} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createClient, manifestDigest, release, tokenFactory, validateInvocation, validateManifest} from '../tools/apple-release.mjs';

const now = Date.parse('2026-10-05T22:00:00Z');
const sha = 'a'.repeat(40);
const base = {
  schemaVersion: 1, releaseId: 'candidate', appId: '1234567890', bundleId: 'kr.io.breeze.app',
  version: '1.8', buildId: 'build-1', buildNumber: '237', ciBuildRunId: 'run-1', expectedCommit: sha,
  releaseType: 'MANUAL', whatsNew: {ko: '검토한 업데이트입니다.', 'en-US': 'Reviewed update.'},
  authorization: {operation: 'none', expiresAt: '2026-10-05T23:00:00Z'},
};
function manifest(operation = 'none') { return {...structuredClone(base), authorization: {...base.authorization, operation}}; }
function invocation(m = base, mode = 'status', extra = {}) {
  const raw = JSON.stringify(m), digest = manifestDigest(raw);
  return {event: 'workflow_dispatch', ref: 'refs/heads/main', eventSha: sha, mainSha: sha,
    push: {created: true, deleted: false, forced: false, after: sha},
    raw, appId: m.appId, now, inputs: {mode, release_id: m.releaseId, manifest_sha256: digest,
      confirmation: `${mode}:${m.releaseId}:${digest}`}, ...extra};
}
const res = (type, id, attributes = {}, relationships = {}) => ({type, id, attributes, relationships});
const rel = (type, id) => ({data: {type, id}});

// Stateful fake ASC: actual JSON:API routes and request bodies, zero networking.
function fake({versionExists = true, selected = null, submission = null, unrelated = false, drift = null, afterItem = null, afterSubmit = null} = {}) {
  const calls = [];
  const app = res('apps', base.appId, {bundleId: base.bundleId});
  const run = res('ciBuildRuns', 'run-1', {sourceCommit: {commitSha: sha}, isPullRequestBuild: false,
    executionProgress: 'COMPLETE', completionStatus: 'SUCCEEDED'});
  const build = res('builds', 'build-1', {version: '237', processingState: 'VALID', expired: false, buildAudienceType: 'APP_STORE_ELIGIBLE'},
    {app: rel('apps', base.appId), preReleaseVersion: rel('preReleaseVersions', 'pre-1')});
  const pre = res('preReleaseVersions', 'pre-1', {version: '1.8', platform: 'IOS'});
  let version = versionExists ? res('appStoreVersions', 'version-1', {versionString: '1.8', platform: 'IOS',
    appStoreState: 'PREPARE_FOR_SUBMISSION', releaseType: 'MANUAL'}) : null;
  let notes = [res('appStoreVersionLocalizations', 'ko-1', {locale: 'ko', whatsNew: ''})];
  let reviews = submission ? [res('reviewSubmissions', 'review-1', {platform: 'IOS', state: submission === 'draft' ?
    'READY_FOR_REVIEW' : 'WAITING_FOR_REVIEW', submittedDate: submission === 'draft' ? null : '2026-10-05T21:00:00Z'})] : [];
  let items = submission ? [res('reviewSubmissionItems', 'item-1', {state: submission === 'draft' ? 'READY_FOR_REVIEW' : 'IN_REVIEW'},
    {appStoreVersion: rel('appStoreVersions', 'version-1')})] : [];
  if (unrelated) reviews.push(res('reviewSubmissions', 'other-review', {platform: 'IOS', state: 'READY_FOR_REVIEW'}));
  drift?.({app, run, build, pre, version, notes, reviews, items});
  const client = {
    async list(path) {
      calls.push({method: 'GET', path});
      if (path.startsWith('/v1/ciBuildRuns/run-1/builds?')) return [{type: 'builds', id: build.id}];
      if (path.startsWith(`/v1/apps/${base.appId}/appStoreVersions?`)) return version ? [version] : [];
      if (path.startsWith('/v1/appStoreVersions/version-1/appStoreVersionLocalizations?')) return notes;
      if (path.startsWith(`/v1/apps/${base.appId}/reviewSubmissions?`)) return reviews;
      if (path.startsWith('/v1/reviewSubmissions/')) {
        // Default relationship responses may be sparse; explicit include hydrates linkage.
        if (new URL(path, 'https://mock.invalid').searchParams.get('include') === 'appStoreVersion') return structuredClone(items);
        return items.map(item => ({...structuredClone(item), relationships: {appStoreVersion: {links: {related: 'mock-related-version'}}}}));
      }
      assert.fail(`Unexpected list route: ${path}`);
    },
    async request(method, path, body) {
      calls.push({method, path, body});
      if (method === 'GET') {
        const data = new Map([
          [`/v1/apps/${base.appId}`, app], ['/v1/ciBuildRuns/run-1', run],
          ['/v1/builds/build-1', {...build, relationships: {
            app: {links: {related: '/v1/builds/build-1/app'}},
            preReleaseVersion: {links: {related: '/v1/builds/build-1/preReleaseVersion'}},
          }}],
          ['/v1/builds/build-1?include=app,preReleaseVersion', build],
          ['/v1/preReleaseVersions/pre-1', pre], ['/v1/appStoreVersions/version-1', version],
          ['/v1/appStoreVersions/version-1/relationships/build', selected ? {type: 'builds', id: selected} : null],
          ['/v1/reviewSubmissions/review-1', reviews[0]],
        ]);
        assert.ok(data.has(path), `Unexpected GET: ${path}`); return {data: structuredClone(data.get(path))};
      }
      if (path === '/v1/appStoreVersions') {
        assert.deepEqual(body.data.relationships, {app: rel('apps', base.appId)});
        version = res('appStoreVersions', 'version-1', {...body.data.attributes, appStoreState: 'PREPARE_FOR_SUBMISSION'});
        return {data: structuredClone(version)};
      }
      if (path === '/v1/appStoreVersions/version-1') Object.assign(version.attributes, body.data.attributes);
      else if (path === '/v1/appStoreVersionLocalizations/ko-1') Object.assign(notes[0].attributes, body.data.attributes);
      else if (path === '/v1/appStoreVersionLocalizations') {
        assert.deepEqual(body.data.relationships, {appStoreVersion: rel('appStoreVersions', 'version-1')});
        notes.push(res('appStoreVersionLocalizations', 'en-1', body.data.attributes));
      } else if (path === '/v1/appStoreVersions/version-1/relationships/build') {
        assert.deepEqual(body, rel('builds', 'build-1')); selected = body.data.id;
      } else if (path === '/v1/reviewSubmissions') {
        assert.deepEqual(body, {data: {type: 'reviewSubmissions', attributes: {platform: 'IOS'}, relationships: {app: rel('apps', base.appId)}}});
        reviews = [res('reviewSubmissions', 'review-1', {platform: 'IOS', state: 'READY_FOR_REVIEW', submittedDate: null})];
        return {data: structuredClone(reviews[0])};
      } else if (path === '/v1/reviewSubmissionItems') {
        assert.deepEqual(body.data.relationships, {reviewSubmission: rel('reviewSubmissions', 'review-1'), appStoreVersion: rel('appStoreVersions', 'version-1')});
        items = [res('reviewSubmissionItems', 'item-1', {state: 'READY_FOR_REVIEW'}, body.data.relationships)];
        afterItem?.({reviews, items, version});
      } else if (path === '/v1/reviewSubmissions/review-1') {
        assert.deepEqual(body, {data: {type: 'reviewSubmissions', id: 'review-1', attributes: {submitted: true}}});
        Object.assign(reviews[0].attributes, {state: 'WAITING_FOR_REVIEW', submittedDate: '2026-10-05T22:01:00Z'});
        items[0].attributes.state = 'READY_FOR_REVIEW';
        afterSubmit?.({reviews, items, version});
      } else assert.fail(`Unexpected write: ${method} ${path}`);
      return {};
    },
  };
  return {client, calls, match() { selected = 'build-1'; notes = Object.entries(base.whatsNew).map(([locale, whatsNew], i) =>
    res('appStoreVersionLocalizations', `note-${i}`, {locale, whatsNew})); }};
}
const writes = f => f.calls.filter(c => c.method !== 'GET');

test('manual smoke and exact smoke tag need no manifest or app configuration', () => {
  assert.equal(validateInvocation(invocation(base, 'smoke', {raw: '', appId: ''})).mode, 'smoke');
  assert.equal(validateInvocation(invocation(base, 'smoke', {event: 'push', ref: 'refs/tags/apple-release/smoke'})).mode, 'smoke');
});
for (const mode of ['status', 'dry-run', 'prepare', 'submit']) {
  test(`exact manifest and tag bind ${mode}`, () => {
    const input = invocation(manifest(['prepare', 'submit'].includes(mode) ? mode : 'none'), mode);
    assert.equal(validateInvocation(input).mode, mode);
    assert.equal(validateInvocation({...input, event: 'push', ref: `refs/tags/apple-release/${mode}/candidate/${manifestDigest(input.raw)}`}).mode, mode);
  });
}
for (const [name, update] of [
  ['PR', {event: 'pull_request'}], ['development push', {event: 'push', ref: 'refs/heads/main'}],
  ['manual branch', {ref: 'refs/heads/develop'}], ['other commit', {eventSha: 'b'.repeat(40)}],
  ['unknown operation', {inputs: {mode: 'upload'}}], ['missing hash', {inputs: {mode: 'submit', release_id: 'candidate'}}],
  ['malformed JSON', {raw: '{'}], ['manifest path traversal', {inputs: {mode: 'status', release_id: '../candidate'}}],
]) test(`gate rejects ${name}`, () => assert.throws(() => validateInvocation(invocation(manifest('submit'), 'submit', update))));
test('manual writes require exact confirmation and tags reject extra segments', () => {
  const input = invocation(manifest('submit'), 'submit');
  assert.throws(() => validateInvocation({...input, inputs: {...input.inputs, confirmation: ''}}));
  assert.throws(() => validateInvocation({...input, event: 'push', ref: `refs/tags/apple-release/submit/candidate/${manifestDigest(input.raw)}/extra`}));
});
for (const [name, push] of [
  ['update', {created: false, deleted: false, forced: false, after: sha}],
  ['deletion', {created: false, deleted: true, forced: false, after: '0'.repeat(40)}],
  ['forced update', {created: true, deleted: false, forced: true, after: sha}],
  ['annotated tag object', {created: true, deleted: false, forced: false, after: 'b'.repeat(40)}],
]) test(`gate rejects tag ${name}`, () => {
  assert.throws(() => validateInvocation(invocation(base, 'status', {event: 'push', ref: 'refs/tags/apple-release/smoke', push})));
});
for (const [name, mutate] of [
  ['missing input', m => delete m.expectedCommit], ['unknown input', m => m.extra = true],
  ['wrong app', m => m.appId = '999'], ['wrong bundle', m => m.bundleId = 'other.app'],
  ['invalid version', m => m.version = 'latest'], ['invalid number', m => m.buildNumber = '0237'],
  ['unbounded notes', m => m.whatsNew.ko = 'a'.repeat(4001)], ['empty notes', m => m.whatsNew = {}],
  ['missing authorization', m => m.authorization.operation = 'none'],
  ['expired authorization', m => m.authorization.expiresAt = '2026-10-05T21:00:00Z'],
  ['unbounded expiry', m => m.authorization.expiresAt = '2027-01-01T00:00:00Z'],
]) test(`manifest rejects ${name}`, () => {
  const m = manifest('submit'); mutate(m);
  assert.throws(() => validateManifest(m, {appId: base.appId, releaseId: base.releaseId, mode: 'submit', now}));
});
for (const mode of ['status', 'dry-run']) test(`${mode} performs GETs only by default`, async () => {
  const f = fake({versionExists: false});
  const result = await release(f.client, manifest(), mode, () => now);
  assert.equal(result.createVersion, true); assert.equal(writes(f).length, 0);
});
test('default release mode stays read-only', async () => {
  const f = fake(); await release(f.client, manifest()); assert.equal(writes(f).length, 0);
});
test('default build/review-item responses are sparse; orchestration explicitly requests linkage', async () => {
  const f = fake({submission: 'draft'}); f.match();
  const sparse = (await f.client.request('GET', '/v1/builds/build-1')).data;
  assert.equal(sparse.relationships.app.data, undefined);
  assert.equal(sparse.relationships.preReleaseVersion.data, undefined);
  const sparseItems = await f.client.list('/v1/reviewSubmissions/review-1/items?limit=200');
  assert.equal(sparseItems[0].relationships.appStoreVersion.data, undefined);
  f.calls.length = 0;
  await release(f.client, manifest('submit'), 'submit', () => now);
  assert.ok(f.calls.some(c => c.path === '/v1/builds/build-1?include=app,preReleaseVersion'));
  assert.ok(f.calls.filter(c => c.path.startsWith('/v1/reviewSubmissions/') && c.path.includes('/items?'))
    .every(c => new URL(c.path, 'https://mock.invalid').searchParams.get('include') === 'appStoreVersion'));
  assert.ok(!f.calls.some(c => c.path === '/v1/builds/build-1'));
});
for (const [name, drift] of [
  ['bundle', ({app}) => app.attributes.bundleId = 'other.app'],
  ['commit', ({run}) => run.attributes.sourceCommit.commitSha = 'b'.repeat(40)],
  ['PR build', ({run}) => run.attributes.isPullRequestBuild = true],
  ['failed run', ({run}) => run.attributes.completionStatus = 'FAILED'],
  ['unfinished run', ({run}) => run.attributes.executionProgress = 'RUNNING'],
  ['app', ({build}) => build.relationships.app.data.id = '999'],
  ['build number', ({build}) => build.attributes.version = '238'],
  ['processing', ({build}) => build.attributes.processingState = 'PROCESSING'],
  ['expired build', ({build}) => build.attributes.expired = true],
  ['internal-only audience', ({build}) => build.attributes.buildAudienceType = 'INTERNAL_ONLY'],
  ['missing audience', ({build}) => delete build.attributes.buildAudienceType],
  ['unknown audience', ({build}) => build.attributes.buildAudienceType = 'OTHER_AUDIENCE'],
  ['sparse included app', ({build}) => delete build.relationships.app.data],
  ['sparse included pre-release version', ({build}) => delete build.relationships.preReleaseVersion.data],
  ['marketing version', ({pre}) => pre.attributes.version = '1.9'],
  ['platform', ({pre}) => pre.attributes.platform = 'MAC_OS'],
  ['App Store version', ({version}) => version.attributes.versionString = '1.9'],
  ['locale ambiguity', ({notes}) => notes.push(structuredClone(notes[0]))],
]) test(`provenance ${name} mismatch fails before any write`, async () => {
  const f = fake({drift}); await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now));
  assert.equal(writes(f).length, 0);
});
test('prepare creates exact version, locales and selection without review writes; repeated prepare is idempotent', async () => {
  const f = fake({versionExists: false}), m = manifest('prepare');
  assert.equal((await release(f.client, m, 'prepare', () => now)).result, 'prepared');
  assert.equal(writes(f).length, 4);
  assert.ok(writes(f).every(c => !c.path.includes('review')));
  f.calls.length = 0; await release(f.client, m, 'prepare', () => now); assert.equal(writes(f).length, 0);
});
test('submit uses modern submission/items then submitted=true; repeated submit makes no writes', async () => {
  const f = fake(), m = manifest('submit');
  assert.equal((await release(f.client, m, 'submit', () => now)).result, 'submitted');
  assert.deepEqual(writes(f).slice(-3).map(c => [c.method, c.path]), [
    ['POST', '/v1/reviewSubmissions'], ['POST', '/v1/reviewSubmissionItems'], ['PATCH', '/v1/reviewSubmissions/review-1']]);
  f.calls.length = 0; assert.equal((await release(f.client, m, 'submit', () => now)).result, 'already-submitted');
  assert.equal(writes(f).length, 0);
});
test('matching single-item draft resumes without duplicate submission creation', async () => {
  const f = fake({submission: 'draft'}); f.match();
  await release(f.client, manifest('submit'), 'submit', () => now);
  assert.deepEqual(writes(f).map(c => c.path), ['/v1/reviewSubmissions/review-1']);
});
for (const [reviewState, itemState, expected] of [
  ['WAITING_FOR_REVIEW', 'READY_FOR_REVIEW', 'already-submitted'],
  ['IN_REVIEW', 'IN_REVIEW', 'already-submitted'],
  ['COMPLETING', 'ACCEPTED', 'already-submitted'],
  ['COMPLETE', 'ACCEPTED', 'review-complete'],
]) test(`confirmed ${reviewState}/${itemState} returns explicit state without writes`, async () => {
  const f = fake({submission: 'submitted', drift: ({reviews, items}) => {
    reviews[0].attributes.state = reviewState; items[0].attributes.state = itemState;
  }}); f.match();
  const result = await release(f.client, manifest('submit'), 'submit', () => now);
  assert.equal(result.result, expected); assert.equal(result.reviewState, reviewState); assert.equal(result.itemState, itemState);
  assert.equal(writes(f).length, 0);
});
for (const [reviewState, itemState] of [
  ['UNRESOLVED_ISSUES', 'REJECTED'], ['UNRESOLVED_ISSUES', 'ACCEPTED'],
  ['WAITING_FOR_REVIEW', 'REJECTED'], ['COMPLETE', 'REJECTED'], ['COMPLETE', 'REMOVED'],
  ['CANCELING', 'IN_REVIEW'], ['READY_FOR_REVIEW', 'READY_FOR_REVIEW'],
]) test(`timestamp with ${reviewState}/${itemState} requires action and never resubmits`, async () => {
  const f = fake({submission: 'submitted', drift: ({reviews, items}) => {
    reviews[0].attributes.state = reviewState; items[0].attributes.state = itemState;
  }}); f.match();
  const status = await release(f.client, manifest(), 'status', () => now);
  assert.equal(status.result, 'action-required'); assert.equal(status.reviewState, reviewState); assert.equal(status.itemState, itemState);
  for (const mode of ['prepare', 'submit']) await assert.rejects(release(f.client, manifest(mode), mode, () => now), /manual action/);
  assert.equal(writes(f).length, 0);
});
for (const [name, drift] of [
  ['unknown submission state', ({reviews}) => reviews[0].attributes.state = 'UNKNOWN'],
  ['unknown item state', ({items}) => items[0].attributes.state = 'UNKNOWN'],
  ['missing item state', ({items}) => delete items[0].attributes.state],
]) test(`${name} fails closed before writes`, async () => {
  const f = fake({submission: 'submitted', drift}); f.match();
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now), /Unknown review/);
  assert.equal(writes(f).length, 0);
});
test('rejected App Store version exposes action-required and cannot be automatically resubmitted', async () => {
  const f = fake({drift: ({version}) => version.attributes.appStoreState = 'REJECTED'});
  assert.equal((await release(f.client, manifest(), 'status', () => now)).result, 'action-required');
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now), /manual action/);
  assert.equal(writes(f).length, 0);
});
test('in-progress review without a submission timestamp remains unconfirmed and cannot write', async () => {
  const f = fake({submission: 'submitted', drift: ({reviews}) => delete reviews[0].attributes.submittedDate}); f.match();
  assert.equal((await release(f.client, manifest(), 'status', () => now)).reason, 'unconfirmed-review-state');
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now), /manual action/);
  assert.equal(writes(f).length, 0);
});
test('post-submit read-back rejection reports manual action and never retries the submit', async () => {
  const f = fake({afterSubmit: ({reviews, items}) => {
    reviews[0].attributes.state = 'UNRESOLVED_ISSUES'; items[0].attributes.state = 'REJECTED';
  }});
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now), /manual action.*UNRESOLVED_ISSUES.*REJECTED/);
  assert.equal(writes(f).filter(c => c.method === 'PATCH' && c.path === '/v1/reviewSubmissions/review-1').length, 1);
  const status = await release(f.client, manifest(), 'status', () => now);
  assert.equal(status.result, 'action-required');
});
test('version rejection after item creation blocks the final submission PATCH', async () => {
  const f = fake({afterItem: ({version}) => version.attributes.appStoreState = 'REJECTED'});
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now), /manual action.*version-rejected/);
  assert.equal(writes(f).filter(c => c.method === 'PATCH' && c.path === '/v1/reviewSubmissions/review-1').length, 0);
});
test('unrelated, empty, or extra-item review submissions fail before writing', async () => {
  for (const config of [{unrelated: true}, {submission: 'draft', drift: ({items}) => items.length = 0},
    {submission: 'draft', drift: ({items}) => items.push(res('reviewSubmissionItems', 'other-item'))}]) {
    const f = fake(config); f.match();
    await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now)); assert.equal(writes(f).length, 0);
  }
});
test('wrong selected build or notes on an already submitted version fail closed', async () => {
  const f = fake({submission: 'submitted'});
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now)); assert.equal(writes(f).length, 0);
});
test('expired authorization during API reads prevents final submission', async () => {
  const f = fake(); let ticks = 0;
  await assert.rejects(release(f.client, manifest('submit'), 'submit', () => now + (ticks++ ? 7200000 : 0)));
  assert.ok(writes(f).every(c => !c.path.includes('review')));
});

test('ES256 tokens verify, renew with five-minute expiry, and distinguish individual/team claims', () => {
  const {privateKey, publicKey} = generateKeyPairSync('ec', {namedCurve: 'prime256v1'});
  let time = now;
  for (const type of ['individual', 'team']) {
    const env = {ASC_KEY_TYPE: type, ASC_KEY_ID: 'TESTKEY123', ASC_PRIVATE_KEY: privateKey.export({type: 'pkcs8', format: 'pem'}),
      ...(type === 'team' ? {ASC_ISSUER_ID: '12345678-abcd-abcd-abcd-123456789abc'} : {})};
    const token = tokenFactory(env, () => time);
    const [header, payload, signature] = token().split('.');
    assert.ok(verify('sha256', Buffer.from(`${header}.${payload}`), {key: publicKey, dsaEncoding: 'ieee-p1363'}, Buffer.from(signature, 'base64url')));
    const claims = JSON.parse(Buffer.from(payload, 'base64url'));
    assert.equal(claims.exp - claims.iat, 300); assert.equal(claims.aud, 'appstoreconnect-v1');
    assert.equal(claims.sub, type === 'individual' ? 'user' : undefined); assert.equal(claims.iss, env.ASC_ISSUER_ID);
    time += 600000; assert.ok(JSON.parse(Buffer.from(token().split('.')[1], 'base64url')).iat > claims.iat);
    assert.throws(() => tokenFactory({...env, ASC_PRIVATE_KEY: 'invalid-do-not-print'}), /invalid ASC private key/);
    assert.throws(() => tokenFactory({...env, ASC_KEY_TYPE: 'individual', ASC_ISSUER_ID: 'unexpected'}));
  }
});
test('transport rejects writes by default, build starts/uploads, off-origin pagination and redirects', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => { calls++; assert.equal(options.redirect, 'error');
    return {ok: true, status: 200, json: async () => ({data: [], links: {next: 'https://attacker.invalid/v1/builds'}})}; };
  const client = createClient({token: () => 'synthetic-token', fetchImpl});
  await assert.rejects(client.request('POST', '/v1/reviewSubmissions', {})); assert.equal(calls, 0);
  await assert.rejects(client.list('/v1/builds')); assert.equal(calls, 1);
  const writeClient = createClient({token: () => 'synthetic-token', fetchImpl, allowWrites: true});
  for (const path of ['/v1/ciBuildRuns', '/v1/buildUploads', '/v1/betaGroups/group-1/relationships/builds']) {
    await assert.rejects(writeClient.request('POST', path, {}));
  }
  assert.equal(calls, 1);
});
test('HTTP and transport failures redact response/token and never retry', async () => {
  for (const fail of ['http', 'transport']) {
    let calls = 0;
    const client = createClient({token: () => 'do-not-print-token', allowWrites: true, fetchImpl: async () => {
      calls++; if (fail === 'transport') throw Error('do-not-print-token');
      return {ok: false, status: 409, json: async () => ({errors: [{detail: 'do-not-print-token'}]})};
    }});
    await assert.rejects(client.request('POST', '/v1/reviewSubmissions', {}), e => !e.message.includes('do-not-print'));
    assert.equal(calls, 1);
  }
});
test('pagination follows same-origin links and fails on cycles/bounds', async () => {
  let calls = 0;
  const client = createClient({token: () => 'mock', fetchImpl: async () => ({ok: true, status: 200, json: async () => {
    calls++; return {data: [res('builds', `b-${calls}`)], links: {next: calls === 1 ? 'https://api.appstoreconnect.apple.com/v1/builds?cursor=2' : null}};
  }})});
  assert.equal((await client.list('/v1/builds')).length, 2);
  const cyclic = createClient({token: () => 'mock', fetchImpl: async () => ({ok: true, status: 200,
    json: async () => ({data: [], links: {next: '/v1/builds'}})})});
  await assert.rejects(cyclic.list('/v1/builds'), /Repeated/);
});
test('CLI missing inputs fails without printing secret values', () => {
  const result = spawnSync(process.execPath, ['tools/apple-release.mjs'], {cwd: new URL('..', import.meta.url),
    encoding: 'utf8', env: {PATH: process.env.PATH, ASC_PRIVATE_KEY: 'do-not-print-secret'}});
  assert.equal(result.status, 1); assert.doesNotMatch(result.stdout + result.stderr, /do-not-print|Error:|at main/);
});
test('workflow exposes no PR/dev trigger, has read-only token, pinned actions and serialized gated secrets', () => {
  const workflow = readFileSync(new URL('../.github/workflows/apple-release.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(workflow, /pull_request|branches:|contents: write|id-token: write|npm (?:ci|install)|xcodebuild/);
  assert.match(workflow, /contents: read/); assert.match(workflow, /cancel-in-progress: false/);
  assert.match(workflow, /needs: gate/); assert.match(workflow, /environment: apple-release/);
  assert.match(workflow, /ref: refs\/heads\/main/); assert.match(workflow, /persist-credentials: false/);
  for (const action of workflow.matchAll(/uses: (\S+)/g)) assert.match(action[1], /@[a-f0-9]{40}$/);
  assert.ok(workflow.indexOf('ASC_PRIVATE_KEY:') > workflow.indexOf('  apple:'));
});
