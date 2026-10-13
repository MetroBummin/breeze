import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createClient, release, validateManifest} from '../tools/apple-release.mjs';
import {loadScreenshotBundle, validateScreenshotConfig, validateUploadOperations, transferScreenshot,
  screenshotInventory, uploadScreenshots, assertScreenshotsComplete} from '../tools/apple-screenshots.mjs';

const raw = readFileSync(new URL('../releases/apple/assets/breeze-193-build272.json', import.meta.url), 'utf8');
const approved = JSON.parse(raw);
const hash = (b, algorithm = 'sha256') => createHash(algorithm).update(b).digest('hex');
const config = {planSha256: hash(raw), locales: ['ko'], targets: {iPhone: 'APP_IPHONE_67', iPad: 'APP_IPAD_PRO_3GEN_129'}};
const now = Date.parse('2026-10-13T04:00:00Z');
const manifest = {schemaVersion: 1, releaseId: 'build272', appId: approved.appId, bundleId: 'kr.io.breeze.app',
  version: approved.version, buildNumber: approved.buildNumber, buildId: approved.buildId,
  expectedCommit: approved.sourceCommit, ciBuildRunId: 'c5877215-c804-44e0-881d-25e3d6cf92b5',
  releaseType: 'MANUAL', whatsNew: {ko: 'Synthetic reviewed notes'}, screenshots: config,
  authorization: {operation: 'prepare', expiresAt: '2026-10-13T05:00:00Z'}};
const res = (type, id, attributes = {}) => ({type, id, attributes});
const contents = {locales: new Map([['ko', res('appStoreVersionLocalizations', 'ko-1', {locale: 'ko'})]])};
const operation = (size, extra = {}) => ({method: 'PUT', url: 'https://store-030.blobstore.apple.com/synthetic?signature=mock',
  offset: 0, length: size, requestHeaders: [{name: 'Content-Type', value: 'image/png'}], ...extra});

// Small synthetic byte buffers exercise transport/checksums. They are not
// approved image bytes; the separate file-preflight suite covers PNG/disk checks.
function fixture({pending = false, afterWrite, afterGet} = {}) {
  const bytes = new Map();
  const groups = approved.groups.map(g => ({device: g.device, images: g.orderedAssets.map((asset, i) => {
    const b = Buffer.from(`Synthetic ${g.device} screenshot ${i}`), sha256 = hash(b); bytes.set(sha256, b);
    return {...asset, sha256, bytes: b.length, md5: hash(b, 'md5')};
  })}));
  const bundle = {plan: approved, planSha256: config.planSha256, receipt: {groups}, readBytes: a => bytes.get(a.sha256)};
  const sets = new Map(), shots = new Map(), calls = [], uploads = [];
  let serial = 0;
  const addSet = device => {
    const set = res('appScreenshotSets', `set-${device}`, {screenshotDisplayType: config.targets[device]});
    set.ids = []; sets.set(set.id, set); return set;
  };
  const addShot = (device, index, state = 'COMPLETE') => {
    const set = sets.get(`set-${device}`) ?? addSet(device), image = groups.find(g => g.device === device).images[index];
    const shot = res('appScreenshots', `shot-${++serial}`, {fileName: `breeze-272-${image.sha256}.png`, fileSize: image.bytes,
      sourceFileChecksum: state === 'AWAITING_UPLOAD' ? null : image.md5,
      assetDeliveryState: {state}, imageAsset: {width: image.pixels[0], height: image.pixels[1]}, uploadOperations: [operation(image.bytes)]});
    shots.set(shot.id, shot); set.ids.push(shot.id); return shot;
  };
  const client = {
    async list(path) {
      calls.push({method: 'GET', path});
      if (path.startsWith('/v1/appStoreVersionLocalizations/ko-1/appScreenshotSets?')) return structuredClone([...sets.values()]);
      const match = /^\/v1\/appScreenshotSets\/([^/]+)\/(relationships\/)?appScreenshots\?limit=200$/.exec(path);
      assert.ok(match, path);
      return structuredClone(sets.get(match[1]).ids.map(id => match[2] ? {type: 'appScreenshots', id} : shots.get(id)));
    },
    async request(method, path, body) {
      calls.push({method, path, body});
      if (method === 'GET') {
        const shot = shots.get(path.split('/').at(-1)); assert.ok(shot, path);
        afterGet?.(shot); return {data: structuredClone(shot)};
      }
      let result = {};
      if (method === 'POST' && path === '/v1/appScreenshotSets') {
        assert.deepEqual(body.data.relationships, {appStoreVersionLocalization: {data: {type: 'appStoreVersionLocalizations', id: 'ko-1'}}});
        result.data = addSet(Object.keys(config.targets).find(d => config.targets[d] === body.data.attributes.screenshotDisplayType));
      } else if (method === 'POST' && path === '/v1/appScreenshots') {
        const set = sets.get(body.data.relationships.appScreenshotSet.data.id); assert.ok(set);
        assert.equal(body.data.relationships.appScreenshotSet.data.type, 'appScreenshotSets');
        const device = Object.keys(config.targets).find(d => config.targets[d] === set.attributes.screenshotDisplayType);
        const index = groups.find(g => g.device === device).images.findIndex(a => body.data.attributes.fileName === `breeze-272-${a.sha256}.png`);
        assert.notEqual(index, -1); result.data = addShot(device, index, 'AWAITING_UPLOAD');
        assert.equal(result.data.attributes.fileSize, body.data.attributes.fileSize);
      } else if (method === 'PATCH' && path.includes('/relationships/')) {
        const set = sets.get(path.split('/')[3]);
        assert.deepEqual(new Set(body.data.map(d => d.id)), new Set(set.ids), 'reordering may not remove/add IDs');
        set.ids = body.data.map(d => d.id);
      } else if (method === 'PATCH' && path.startsWith('/v1/appScreenshots/')) {
        const shot = shots.get(path.split('/').at(-1));
        assert.equal(body.data.id, shot.id); assert.equal(body.data.type, 'appScreenshots');
        assert.equal(body.data.attributes.uploaded, true);
        shot.attributes.sourceFileChecksum = body.data.attributes.sourceFileChecksum;
        shot.attributes.assetDeliveryState.state = pending ? 'UPLOAD_COMPLETE' : 'COMPLETE'; result.data = shot;
      } else assert.fail(`Unexpected write ${method} ${path}`);
      afterWrite?.({method, path, body, result, sets, shots}); return structuredClone(result);
    },
  };
  const fetchImpl = async (url, options) => {
    assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert.equal(options.method, 'PUT');
    assert.equal(Object.keys(options.headers).some(k => /authorization|cookie/i.test(k)), false);
    uploads.push({url, options}); return {ok: true};
  };
  const run = (options = {}) => uploadScreenshots(client, contents, config, bundle, {beforeWrite: () => validateManifest(manifest,
    {mode: 'prepare', releaseId: manifest.releaseId, appId: manifest.appId, now}), fetchImpl, ...options});
  return {bundle, client, sets, shots, calls, uploads, addSet, addShot, run};
}
const writes = f => f.calls.filter(c => c.method !== 'GET');

// Compose the upload fake with the existing release's real provenance, version,
// localization, review-item and submission routes. No release function is mocked.
function releaseFixture(options) {
  const f = fixture(options), assetList = f.client.list, assetRequest = f.client.request;
  let submitted = false, review = false, item = false;
  const relationship = (type, id) => ({data: {type, id}});
  const version = res('appStoreVersions', 'version-272', {versionString: '1.9.3', platform: 'IOS',
    appStoreState: 'PREPARE_FOR_SUBMISSION', releaseType: 'MANUAL'});
  const note = res('appStoreVersionLocalizations', 'ko-1', {locale: 'ko', whatsNew: manifest.whatsNew.ko});
  f.client.list = async path => {
    if (path.includes('/appScreenshotSets?') || /^\/v1\/appScreenshotSets\//.test(path)) return assetList(path);
    f.calls.push({method: 'GET', path});
    if (path.includes('/ciBuildRuns/')) return [{type: 'builds', id: manifest.buildId}];
    if (path.includes('/appStoreVersions?')) return [structuredClone(version)];
    if (path.includes('/appStoreVersionLocalizations?')) return [structuredClone(note)];
    if (path.includes('/reviewSubmissions?')) return review ? [res('reviewSubmissions', 'review-272',
      {platform: 'IOS', state: submitted ? 'WAITING_FOR_REVIEW' : 'READY_FOR_REVIEW', submittedDate: submitted ? '2026-10-13T04:01:00Z' : null})] : [];
    if (path.includes('/reviewSubmissions/review-272/items?')) return item ? [{...res('reviewSubmissionItems', 'item-272',
      {state: 'READY_FOR_REVIEW'}), relationships: {appStoreVersion: relationship('appStoreVersions', version.id)}}] : [];
    assert.fail(`Unexpected release list ${path}`);
  };
  f.client.request = async (method, path, body) => {
    if (/^\/v1\/appScreenshot/.test(path)) return assetRequest(method, path, body);
    f.calls.push({method, path, body});
    if (method === 'GET') {
      let value;
      if (path === `/v1/apps/${manifest.appId}`) value = res('apps', manifest.appId, {bundleId: manifest.bundleId});
      else if (path === `/v1/ciBuildRuns/${manifest.ciBuildRunId}`) value = res('ciBuildRuns', manifest.ciBuildRunId,
        {sourceCommit: {commitSha: manifest.expectedCommit}, isPullRequestBuild: false, executionProgress: 'COMPLETE', completionStatus: 'SUCCEEDED'});
      else if (path === `/v1/builds/${manifest.buildId}?include=app,preReleaseVersion`) value = {...res('builds', manifest.buildId,
        {version: '272', processingState: 'VALID', expired: false, buildAudienceType: 'APP_STORE_ELIGIBLE'}),
      relationships: {app: relationship('apps', manifest.appId), preReleaseVersion: relationship('preReleaseVersions', 'pre-272')}};
      else if (path === '/v1/preReleaseVersions/pre-272') value = res('preReleaseVersions', 'pre-272', {version: '1.9.3', platform: 'IOS'});
      else if (path === '/v1/appStoreVersions/version-272') value = version;
      else if (path === '/v1/appStoreVersions/version-272/relationships/build') value = {type: 'builds', id: manifest.buildId};
      else assert.fail(`Unexpected release GET ${path}`);
      return {data: structuredClone(value)};
    }
    if (method === 'POST' && path === '/v1/reviewSubmissions') { review = true; return {data: res('reviewSubmissions', 'review-272')}; }
    if (method === 'POST' && path === '/v1/reviewSubmissionItems') { item = true; return {}; }
    if (method === 'PATCH' && path === '/v1/reviewSubmissions/review-272') {
      assert.equal(body.data.attributes.submitted, true); submitted = true; return {};
    }
    assert.fail(`Unexpected release write ${method} ${path}`);
  };
  f.release = async (mode = 'prepare') => release(f.client, {...manifest, authorization: {...manifest.authorization, operation: mode}},
    mode, () => now, {screenshots: f.bundle, fetchImpl: async (_url, opts) => { f.uploads.push(opts); return {ok: true}; }});
  return f;
}

test('real release prepare executes upload after272 provenance and returns processed ordered receipts', async () => {
  const f = releaseFixture(); const result = await f.release();
  assert.equal(result.result, 'prepared'); assert.equal(result.screenshots.length, 2); assert.equal(f.uploads.length, 13);
  assert.ok(f.calls.findIndex(c => c.path.includes('/builds/') && c.method === 'GET') < f.calls.findIndex(c => c.method === 'POST'));
});
test('real release submit requires13 completed images and confirms the review result', async () => {
  const f = releaseFixture(); const result = await f.release('submit');
  assert.equal(result.result, 'submitted'); assert.equal(result.submissionId, 'review-272');
  assert.equal(f.uploads.length, 13);
  const before = writes(f).length; assert.equal((await f.release('submit')).result, 'already-submitted');
  assert.equal(writes(f).length, before);
});
test('real release cannot submit while screenshot processing is pending', async () => {
  const f = releaseFixture({pending: true}); const result = await f.release('submit');
  assert.equal(result.result, 'action-required'); assert.equal(result.reason, 'screenshots-processing');
  assert.equal(writes(f).some(c => c.path.includes('/review')), false);
});
test('real release checks all existing screenshots before any metadata or review mutation', async () => {
  const f = releaseFixture(); f.addShot('iPad', 0).attributes.sourceFileChecksum = '0'.repeat(32);
  await assert.rejects(f.release('submit'), /reconciliation/); assert.equal(writes(f).length, 0);
});
test('final review submit is blocked if screenshots change after draft creation', async () => {
  const f = releaseFixture(), request = f.client.request;
  f.client.request = async (method, path, body) => {
    const result = await request(method, path, body);
    if (path === '/v1/reviewSubmissionItems' && method === 'POST') {
      [...f.shots.values()][0].attributes.sourceFileChecksum = '0'.repeat(32);
    }
    return result;
  };
  await assert.rejects(f.release('submit'), /reconciliation/);
  assert.equal(writes(f).some(c => c.path === '/v1/reviewSubmissions/review-272' && c.body?.data?.attributes?.submitted), false);
});
test('old screenshots in other display slots are visible in status and block writes without deletion', async () => {
  const f = fixture(); const set = f.addSet('iPhone'); f.addShot('iPhone', 0);
  set.attributes.screenshotDisplayType = 'APP_IPHONE_65';
  const inventory = await screenshotInventory(f.client, contents, config, loadScreenshotBundle(raw, config));
  assert.ok(inventory.some(g => g.displayType === 'APP_IPHONE_65' && g.shots.length === 1));
  await assert.rejects(f.run(), /other display slots/); assert.equal(writes(f).length, 0);
});

test('approved plan binds exact272, explicit locales, supported API slots and exact bytes digest', () => {
  validateScreenshotConfig(config, manifest); validateManifest(manifest, {mode: 'prepare', releaseId: manifest.releaseId, appId: manifest.appId, now});
  assert.equal(loadScreenshotBundle(raw, config).receipt, null);
  assert.throws(() => loadScreenshotBundle(raw + ' ', config), /digest/);
  for (const m of [{...manifest, buildNumber: '273'}, {...manifest, ciBuildRunId: 'other'}]) assert.throws(() => validateScreenshotConfig(config, m), /provenance/);
  for (const c of [{...config, locales: []}, {...config, locales: ['en-US']}, {...config, locales: ['ko', 'ko']},
    {...config, targets: {...config.targets, iPhone: 'APP_IPHONE_69'}}, {...config, path: '/tmp/arbitrary'}]) assert.throws(() => validateScreenshotConfig(c, manifest));
});
test('exact272 cannot use old submit/prepare path without approved screenshots', async () => {
  const m = {...manifest}; delete m.screenshots;
  assert.throws(() => validateManifest(m, {mode: 'prepare', releaseId: m.releaseId, appId: m.appId, now}), /approved screenshot/);
  const f = fixture();
  await assert.rejects(release(f.client, manifest, 'prepare', () => now), /verified original bytes/);
  assert.equal(f.calls.length, 0);
});
test('read-only inventory without local originals performs only GETs', async () => {
  const f = fixture(); f.addShot('iPhone', 0);
  const result = await screenshotInventory(f.client, contents, config, loadScreenshotBundle(raw, config));
  assert.equal(result.length, 2); assert.equal(writes(f).length, 0);
  await assert.rejects(uploadScreenshots(f.client, contents, config, loadScreenshotBundle(raw, config)), /verified original bytes/);
});
test('uploads13 originals, commits MD5, reads processed dimensions/state/order, then reruns without writes', async () => {
  const f = fixture(); assert.equal((await f.run()).result, 'screenshots-complete');
  assert.equal(f.uploads.length, 13);
  assert.equal(writes(f).filter(c => c.method === 'POST' && c.path === '/v1/appScreenshots').length, 13);
  for (const upload of f.uploads) assert.ok(f.bundle.receipt.groups.flatMap(g => g.images).some(a => a.md5 === hash(upload.options.body, 'md5')));
  const before = writes(f).length; await f.run(); assert.equal(writes(f).length, before); assert.equal(f.uploads.length, 13);
  await assertScreenshotsComplete(f.client, contents, config, f.bundle);
});
test('matching existing completed images remain, missing images append, exact permutation restores approved order', async () => {
  const f = fixture(); const keep = f.addShot('iPhone', 5); f.addShot('iPhone', 0);
  assert.equal((await f.run()).result, 'screenshots-complete'); assert.equal(f.uploads.length, 11);
  assert.equal(f.sets.get('set-iPhone').ids.at(-1), keep.id);
  assert.ok(writes(f).some(c => c.path.endsWith('/relationships/appScreenshots')));
  assert.equal(writes(f).some(c => c.method === 'DELETE'), false);
});
for (const problem of ['extra', 'checksum', 'duplicate', 'failed', 'unknown', 'dimensions']) test(`preflight preserves all existing photos on ${problem}`, async () => {
  const f = fixture(); f.addSet('iPhone'); const shot = f.addShot('iPad', 0);
  if (problem === 'extra' || problem === 'checksum') shot.attributes.sourceFileChecksum = '0'.repeat(32);
  if (problem === 'duplicate') f.addShot('iPad', 0);
  if (problem === 'failed') shot.attributes.assetDeliveryState.state = 'FAILED';
  if (problem === 'unknown') shot.attributes.assetDeliveryState.state = 'PROCESSING';
  if (problem === 'dimensions') shot.attributes.imageAsset.width = 1;
  await assert.rejects(f.run()); assert.equal(writes(f).length, 0); assert.equal(f.uploads.length, 0);
});
test('processing returns pending; later authorized invocation reuses committed images and completes without reupload', async () => {
  const f = fixture({pending: true}); assert.equal((await f.run()).result, 'screenshots-processing');
  await assert.rejects(assertScreenshotsComplete(f.client, contents, config, f.bundle), /not COMPLETE/);
  const before = writes(f).length;
  for (const shot of f.shots.values()) shot.attributes.assetDeliveryState.state = 'COMPLETE';
  assert.equal((await f.run()).result, 'screenshots-complete'); assert.equal(writes(f).length, before); assert.equal(f.uploads.length, 13);
});
test('lost reservation response resumes that reservation without duplicate POST', async () => {
  let fail = true;
  const f = fixture({afterWrite: ({path}) => { if (fail && path === '/v1/appScreenshots') { fail = false; throw new Error('ambiguous reservation'); } }});
  await assert.rejects(f.run(), /ambiguous/); assert.equal(f.shots.size, 1);
  await f.run(); assert.equal(f.shots.size, 13);
  assert.equal(writes(f).filter(c => c.path === '/v1/appScreenshots').length, 13);
});
test('interrupted PUT is not retried automatically; fresh invocation resends uncommitted bytes only', async () => {
  const f = fixture(); let attempts = 0;
  await assert.rejects(f.run({fetchImpl: async () => { attempts++; throw new Error('secret URL must not escape'); }}), /upload transport failure/);
  assert.equal(attempts, 1); assert.equal(f.shots.size, 1);
  assert.equal(writes(f).filter(c => c.method === 'PATCH').length, 0);
  await f.run(); assert.equal(f.shots.size, 13); assert.equal(f.uploads.length, 13);
});
test('lost commit response is reconciled by GET; completed asset is neither resent nor recommitted', async () => {
  let fail = true;
  const f = fixture({afterWrite: ({method, path}) => { if (fail && method === 'PATCH' && path.startsWith('/v1/appScreenshots/')) { fail = false; throw new Error('ambiguous commit'); } }});
  await assert.rejects(f.run(), /ambiguous/); await f.run();
  assert.equal(f.uploads.length, 13); assert.equal(writes(f).filter(c => c.path.startsWith('/v1/appScreenshots/') && c.method === 'PATCH').length, 13);
});
test('authorization expiry during upload stops before commit', async () => {
  const f = fixture(); let gates = 0;
  await assert.rejects(f.run({beforeWrite: () => { if (++gates === 4) throw new Error('expired'); }}), /expired/);
  assert.equal(f.uploads.length, 1); assert.equal([...f.shots.values()][0].attributes.assetDeliveryState.state, 'AWAITING_UPLOAD');
});
test('changed bytes and missing localization stop before any mutation', async () => {
  const f = fixture(); f.bundle.readBytes = () => Buffer.from('changed');
  await assert.rejects(f.run(), /bytes changed/); assert.equal(writes(f).length, 0);
  await assert.rejects(screenshotInventory(f.client, {locales: new Map()}, config, f.bundle), /localization/);
});
test('unexpected concurrent image stops without deleting or reordering it', async () => {
  let once = true;
  const f = fixture({afterWrite: ({path, result, shots}) => {
    if (once && path === '/v1/appScreenshots') { once = false; const shot = structuredClone(result.data); shot.id = 'concurrent'; shot.attributes.fileName = 'unapproved.png';
      shots.set(shot.id, shot); f.sets.get('set-iPhone').ids.push(shot.id); }
  }});
  await assert.rejects(f.run(), /reconciliation/); assert.ok(f.shots.has('concurrent'));
  assert.equal(writes(f).some(c => c.path.includes('/relationships/') || c.method === 'DELETE'), false);
});
test('multipart transfer covers original bytes exactly without token or redirect', async () => {
  const bytes = Buffer.from('0123456789'), sent = [];
  await transferScreenshot([operation(6, {offset: 4}), operation(4)], bytes,
    {beforeWrite() {}, fetchImpl: async (_url, opts) => { sent.push(opts.body); return {ok: true}; }});
  assert.deepEqual(Buffer.concat(sent), bytes);
});
for (const [reason, mutate] of [
  ['gap', o => o.offset = 1], ['overrun', o => o.length = 11], ['incomplete', o => o.length = 9],
  ['wrong method', o => o.method = 'POST'], ['external host', o => o.url = 'https://example.com/'],
  ['local host', o => o.url = 'https://127.0.0.1/'], ['deceptive suffix', o => o.url = 'https://store.blobstore.apple.com.evil.invalid/'],
  ['userinfo', o => o.url = 'https://user@store-030.blobstore.apple.com/'], ['http', o => o.url = 'http://store-030.blobstore.apple.com/'],
  ['token header', o => o.requestHeaders.push({name: 'Authorization', value: 'secret'})],
  ['cookie', o => o.requestHeaders.push({name: 'Cookie', value: 'secret'})],
  ['header injection', o => o.requestHeaders[0].value = 'image/png\r\nSecret: value'],
]) test(`rejects ${reason} before PUT`, async () => {
  const op = operation(10); mutate(op); let calls = 0;
  await assert.rejects(transferScreenshot([op], Buffer.alloc(10), {beforeWrite() {}, fetchImpl: () => { calls++; }})); assert.equal(calls, 0);
});
test('overlapping ranges are rejected', () => assert.throws(() => validateUploadOperations([operation(6), operation(5, {offset: 5})], 10)));
test('client exposes only exact screenshot POST/PATCH routes; DELETE and other mutations remain forbidden', async () => {
  const called = [];
  const client = createClient({token: () => 'mock-token', allowWrites: true, fetchImpl: async (url, opts) => {
    called.push({url, opts}); return {ok: true, status: 204};
  }});
  for (const [method, path] of [['POST', '/v1/appScreenshots'], ['POST', '/v1/appScreenshotSets'],
    ['PATCH', '/v1/appScreenshots/shot-1'], ['PATCH', '/v1/appScreenshotSets/set-1/relationships/appScreenshots']]) await client.request(method, path, {});
  assert.equal(called.length, 4);
  for (const [method, path] of [['DELETE', '/v1/appScreenshots/shot-1'], ['PATCH', '/v1/appScreenshotSets/set-1'],
    ['POST', '/v1/appScreenshots/shot-1'], ['POST', '/v1/builds']]) await assert.rejects(client.request(method, path, {}), /forbidden/);
  const readOnly = createClient({token: () => 'mock', fetchImpl: () => assert.fail('no writes')});
  await assert.rejects(readOnly.request('POST', '/v1/appScreenshots', {}), /disabled/);
});
