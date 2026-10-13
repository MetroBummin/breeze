// Exact272 assets only. Invoked by apple-release after its existing provenance,
// actor/main/manifest/expiry/write gates; this module has no credentials or CLI.
import {createHash} from 'node:crypto';
import {validateScreenshotPlan, verifyScreenshotAssets, readScreenshotBytes} from './verify-apple-screenshot-assets.mjs';

export const SCREENSHOT_PLAN_PATH = 'releases/apple/assets/breeze-193-build272.json';
const ID = /^[A-Za-z0-9-]{1,100}$/;
export class ScreenshotError extends Error {}
const check = (ok, message) => { if (!ok) throw new ScreenshotError(`Screenshots: ${message}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const resource = (r, type, id) => {
  check(r?.type === type && typeof r.id === 'string' && ID.test(r.id) && (!id || r.id === id), 'invalid resource'); return r;
};
const link = (type, id) => ({data: {type, id}});
const data = (type, attributes, relationships, id) => ({data: {type, ...(id ? {id} : {}),
  ...(attributes ? {attributes} : {}), ...(relationships ? {relationships} : {})}});
const state = r => r.attributes?.assetDeliveryState?.state;
const name = a => `breeze-272-${a.sha256}.png`;

export function validateScreenshotConfig(config, manifest) {
  check(config && Object.keys(config).sort().join() === 'locales,planSha256,targets', 'invalid configuration fields');
  check(/^[a-f0-9]{64}$/.test(config.planSha256), 'plan digest required');
  check(manifest.appId === '6804570182' && manifest.version === '1.9.3' && manifest.buildNumber === '272' &&
    manifest.buildId === '10a92796-4109-4dbb-a519-45eda33768ea' &&
    manifest.expectedCommit === '37de13779b99bdfed7f0b20809577619f163f705' &&
    manifest.ciBuildRunId === 'c5877215-c804-44e0-881d-25e3d6cf92b5', 'exact272 provenance required');
  check(Array.isArray(config.locales) && config.locales.length > 0 && config.locales.length <= 40 &&
    new Set(config.locales).size === config.locales.length && config.locales.every(locale =>
      typeof locale === 'string' && Object.hasOwn(manifest.whatsNew, locale)), 'explicit reviewed locales required');
  // These are API enums, not marketing screen-size labels. Live inventory must
  // confirm these intended slots before an operator commits a write manifest.
  check(config.targets && Object.keys(config.targets).sort().join() === 'iPad,iPhone' &&
    config.targets.iPhone === 'APP_IPHONE_67' && config.targets.iPad === 'APP_IPAD_PRO_3GEN_129', 'unsupported display targets');
}

export function loadScreenshotBundle(raw, config, directory) {
  check(digest(raw) === config.planSha256, 'committed plan digest mismatch');
  const plan = validateScreenshotPlan(JSON.parse(raw));
  const receipt = directory ? verifyScreenshotAssets(directory, plan) : null;
  return {plan, receipt, planSha256: config.planSha256, readBytes: asset => readScreenshotBytes(directory, asset)};
}

// Apple supplies unauthenticated, expiring PUT URLs. No ASC JWT, redirects,
// cookies or arbitrary hosts are permitted. Unknown storage hosts fail closed.
export function validateUploadOperations(operations, size) {
  check(Array.isArray(operations) && operations.length > 0 && operations.length <= 100, 'invalid upload operations');
  const sorted = [...operations].sort((a, b) => a.offset - b.offset);
  let offset = 0;
  return sorted.map(op => {
    check(op.method === 'PUT' && Number.isSafeInteger(op.offset) && op.offset === offset &&
      Number.isSafeInteger(op.length) && op.length > 0 && op.length <= size - offset, 'invalid upload byte ranges');
    offset += op.length;
    if (op === sorted.at(-1)) check(offset === size, 'incomplete upload byte ranges');
    let url; try { url = new URL(op.url); } catch { check(false, 'invalid upload URL'); }
    check(url.protocol === 'https:' && !url.username && !url.password && !url.hash && !url.port &&
      /^[a-z0-9-]+\.blobstore\.apple\.com$/.test(url.hostname), 'unapproved upload host');
    check(Array.isArray(op.requestHeaders) && op.requestHeaders.length <= 20, 'invalid upload headers');
    const headers = {};
    for (const h of op.requestHeaders) {
      check(typeof h.name === 'string' && /^[A-Za-z0-9-]+$/.test(h.name) &&
        typeof h.value === 'string' && h.value.length <= 8192 && !/[\r\n]/.test(h.value), 'invalid upload header');
      const key = h.name.toLowerCase();
      check(!Object.hasOwn(headers, key) && !['authorization', 'proxy-authorization', 'cookie', 'host',
        'connection', 'transfer-encoding', 'content-length'].includes(key), 'forbidden upload header');
      headers[key] = h.value;
    }
    return {url: url.href, offset: op.offset, length: op.length, headers};
  });
}

export async function transferScreenshot(operations, bytes, {fetchImpl = fetch, beforeWrite} = {}) {
  check(typeof beforeWrite === 'function', 'write guard required');
  const parts = validateUploadOperations(operations, bytes.length); // all parts before the first PUT
  for (const part of parts) {
    await beforeWrite();
    let response;
    try {
      response = await fetchImpl(part.url, {method: 'PUT', redirect: 'error', credentials: 'omit',
        signal: AbortSignal.timeout(30000), headers: part.headers,
        body: bytes.subarray(part.offset, part.offset + part.length)});
    } catch { throw new ScreenshotError('Screenshots: upload transport failure; inspect reservation before a fresh authorized request'); }
    check(response.ok, `upload HTTP ${response.status}; inspect reservation before retrying`);
    await response.body?.cancel();
  }
}

async function readGroup(client, localizationId, displayType) {
  const sets = await client.list(`/v1/appStoreVersionLocalizations/${localizationId}/appScreenshotSets?limit=200`);
  for (const set of sets) resource(set, 'appScreenshotSets');
  const matches = sets.filter(set => set.attributes?.screenshotDisplayType === displayType);
  check(matches.length <= 1, 'duplicate display sets; preserve existing images');
  const set = matches[0];
  if (!set) return {set: null, shots: []};
  const shots = await client.list(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=200`);
  const ids = await client.list(`/v1/appScreenshotSets/${set.id}/relationships/appScreenshots?limit=200`);
  check(shots.length <= 10 && ids.length === shots.length && new Set(ids.map(s => s.id)).size === ids.length,
    'invalid screenshot membership');
  const byId = new Map(shots.map(s => [resource(s, 'appScreenshots').id, s]));
  check(byId.size === shots.length, 'duplicate screenshot resources');
  return {set, shots: ids.map(id => {
    resource(id, 'appScreenshots'); check(byId.has(id.id), 'screenshot membership changed'); return byId.get(id.id);
  })};
}

function reconcile(group, images) {
  const matches = new Map();
  for (const shot of group.shots) {
    const a = shot.attributes;
    check(['AWAITING_UPLOAD', 'UPLOAD_COMPLETE', 'COMPLETE'].includes(state(shot)), 'failed or unknown asset state; preserve existing images');
    const candidates = images.filter(image => a?.fileSize === image.bytes &&
      (a.sourceFileChecksum === image.md5 || (state(shot) === 'AWAITING_UPLOAD' &&
        !a.sourceFileChecksum && a.fileName === name(image))));
    check(candidates.length === 1 && !matches.has(candidates[0].sha256), 'existing images need reconciliation; deletion is forbidden');
    const image = candidates[0];
    if (state(shot) === 'COMPLETE') check(a.imageAsset?.width === image.pixels[0] && a.imageAsset?.height === image.pixels[1],
      'processed image dimensions mismatch');
    matches.set(image.sha256, shot);
  }
  return matches;
}

export async function screenshotInventory(client, contents, config, bundle) {
  const groups = [];
  for (const locale of config.locales) {
    const localization = contents?.locales.get(locale);
    check(localization, 'target version and localization must already exist');
    resource(localization, 'appStoreVersionLocalizations');
    const allSets = await client.list(`/v1/appStoreVersionLocalizations/${localization.id}/appScreenshotSets?limit=200`);
    for (const set of allSets) {
      resource(set, 'appScreenshotSets');
      if (Object.values(config.targets).includes(set.attributes?.screenshotDisplayType)) continue;
      const shots = await client.list(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=200`);
      for (const shot of shots) resource(shot, 'appScreenshots');
      check(!bundle.receipt || shots.length === 0, 'other display slots contain existing images; preserve and reconcile them');
      if (shots.length) groups.push({set, shots, locale, displayType: set.attributes.screenshotDisplayType, images: null});
    }
    for (const planned of bundle.plan.groups) {
      const displayType = config.targets[planned.device];
      const group = await readGroup(client, localization.id, displayType);
      const images = bundle.receipt?.groups.find(g => g.device === planned.device)?.images;
      const matches = images ? reconcile(group, images) : null;
      groups.push({...group, images, matches, locale, device: planned.device, localizationId: localization.id, displayType});
    }
  }
  return groups;
}

export function screenshotSummary(groups) {
  return groups.map(g => ({locale: g.locale, displayType: g.displayType, setId: g.set?.id ?? null,
    localBytesVerified: !!g.images, screenshots: g.shots.map(s => ({id: s.id, state: state(s),
      fileSize: s.attributes?.fileSize, sourceFileChecksum: s.attributes?.sourceFileChecksum ?? null,
      width: s.attributes?.imageAsset?.width ?? null, height: s.attributes?.imageAsset?.height ?? null}))}));
}

function complete(group) {
  return group.images && group.shots.length === group.images.length && group.images.every((image, index) =>
    group.matches.get(image.sha256)?.id === group.shots[index]?.id && state(group.shots[index]) === 'COMPLETE');
}

export async function assertScreenshotsComplete(client, contents, config, bundle) {
  check(bundle.receipt, 'verified original bytes required');
  const groups = await screenshotInventory(client, contents, config, bundle);
  check(groups.every(complete), 'approved ordered screenshots are not COMPLETE');
  return screenshotSummary(groups);
}

export async function uploadScreenshots(client, contents, config, bundle, {beforeWrite, fetchImpl = fetch} = {}) {
  check(bundle.receipt && typeof beforeWrite === 'function', 'verified original bytes and write guard required');
  // Inspect ALL targeted locales/device sets before performing ANY mutation.
  const initial = await screenshotInventory(client, contents, config, bundle);
  const bytes = new Map(); let total = 0;
  for (const group of bundle.receipt.groups) for (const asset of group.images) {
    const value = bundle.readBytes(asset);
    check(digest(value) === asset.sha256 && value.length === asset.bytes &&
      createHash('md5').update(value).digest('hex') === asset.md5, 'asset bytes changed');
    total += value.length; check(total <= 256 * 1024 * 1024, 'asset memory bound exceeded');
    bytes.set(asset.sha256, value);
  }
  const change = async (...args) => { await beforeWrite(); return client.request(...args); };
  for (const original of initial) {
    let group = await readGroup(client, original.localizationId, original.displayType);
    reconcile(group, original.images);
    if (!group.set) {
      const set = resource((await change('POST', '/v1/appScreenshotSets', data('appScreenshotSets',
        {screenshotDisplayType: original.displayType}, {appStoreVersionLocalization: link('appStoreVersionLocalizations', original.localizationId)}))).data, 'appScreenshotSets');
      group = await readGroup(client, original.localizationId, original.displayType);
      check(group.set?.id === set.id, 'created set read-back mismatch');
    }
    for (const image of original.images) {
      group = await readGroup(client, original.localizationId, original.displayType);
      let shot = reconcile(group, original.images).get(image.sha256);
      if (!shot) {
        check(group.shots.length < 10, 'screenshot capacity exceeded');
        shot = resource((await change('POST', '/v1/appScreenshots', data('appScreenshots',
          {fileName: name(image), fileSize: image.bytes}, {appScreenshotSet: link('appScreenshotSets', group.set.id)}))).data, 'appScreenshots');
      }
      // Fresh GET reconciles an interrupted previous request, including a lost
      // reservation/commit response. Never blindly POST a duplicate or recommit.
      const current = resource((await client.request('GET', `/v1/appScreenshots/${shot.id}`)).data, 'appScreenshots', shot.id);
      check(reconcile({shots: [current]}, [image]).get(image.sha256), 'reservation identity mismatch');
      const membership = await readGroup(client, original.localizationId, original.displayType);
      check(membership.set?.id === group.set.id && membership.shots.some(s => s.id === current.id), 'reservation membership mismatch');
      reconcile(membership, original.images);
      if (state(current) === 'AWAITING_UPLOAD') {
        await transferScreenshot(current.attributes.uploadOperations, bytes.get(image.sha256), {fetchImpl, beforeWrite});
        await change('PATCH', `/v1/appScreenshots/${current.id}`, data('appScreenshots',
          {uploaded: true, sourceFileChecksum: image.md5}, null, current.id));
        const committed = resource((await client.request('GET', `/v1/appScreenshots/${current.id}`)).data, 'appScreenshots', current.id);
        check(['UPLOAD_COMPLETE', 'COMPLETE'].includes(state(committed)) && committed.attributes?.sourceFileChecksum === image.md5,
          'commit read-back mismatch; inspect before retrying');
      }
    }
    group = await readGroup(client, original.localizationId, original.displayType);
    const matched = reconcile(group, original.images);
    const ordered = original.images.map(image => matched.get(image.sha256));
    check(ordered.every(Boolean) && ordered.length === group.shots.length, 'membership changed before ordering');
    if (ordered.every(s => state(s) === 'COMPLETE') && ordered.some((s, i) => s.id !== group.shots[i].id)) {
      // Exact permutation only: never detach, replace or delete an existing ID.
      await change('PATCH', `/v1/appScreenshotSets/${group.set.id}/relationships/appScreenshots`,
        {data: ordered.map(s => ({type: 'appScreenshots', id: s.id}))});
    }
  }
  const final = await screenshotInventory(client, contents, config, bundle);
  return {result: final.every(complete) ? 'screenshots-complete' : 'screenshots-processing', groups: screenshotSummary(final)};
}
