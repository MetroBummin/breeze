import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, unlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, dirname} from 'node:path';
import {deflateSync} from 'node:zlib';
import {validateScreenshotPlan, verifyScreenshotAssets, pngDimensions} from '../tools/verify-apple-screenshot-assets.mjs';

const approved = JSON.parse(readFileSync(new URL('../releases/apple/assets/breeze-193-build272.json', import.meta.url)));
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function crc(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) { value ^= byte; for (let n = 0; n < 8; n++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); }
  return (value ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]), out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length); body.copy(out, 4); out.writeUInt32BE(crc(body), out.length - 4); return out;
}
const compressed = new Map();
function png([width, height], marker = '') {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  const key = `${width}x${height}`;
  if (!compressed.has(key)) compressed.set(key, deflateSync(Buffer.alloc((width * 3 + 1) * height)));
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr),
    chunk('tEXt', Buffer.from('Synthetic fixture\0' + marker)), chunk('IDAT', compressed.get(key)), chunk('IEND', Buffer.alloc(0))]);
}
function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'breeze-approved-shots-')); t.after(() => rmSync(root, {recursive: true, force: true}));
  const plan = structuredClone(approved), archive = Buffer.from('Synthetic archive: no real approved screenshot bytes.');
  writeFileSync(join(root, plan.baseArchive.file), archive); plan.baseArchive.sha256 = digest(archive);
  for (const group of plan.groups) for (const asset of group.orderedAssets) {
    const path = join(root, asset.file), bytes = png(asset.pixels, asset.file);
    mkdirSync(dirname(path), {recursive: true}); writeFileSync(path, bytes); asset.sha256 = digest(bytes);
  }
  return {root, plan, first: join(root, plan.groups[0].orderedAssets[0].file)};
}

test('approved identities name exactly6 iPhone and7 iPad images, including the two approved v1 learning files', () => {
  validateScreenshotPlan(approved);
  assert.deepEqual(approved.groups.map(g => g.orderedAssets.length), [6, 7]);
  assert.deepEqual(approved.groups.map(g => g.orderedAssets.at(-1).libraryVersion), [1, 1]);
  assert.equal(approved.groups[0].orderedAssets.at(-1).sha256, 'd694f6fd6b9967da709760a3ce04d0dcea6bfaedb1a61db679b8b743fb39e8be');
  assert.equal(approved.groups[1].orderedAssets.at(-1).sha256, '800c18292b717ccaf8f93fb9ef284dc850550390b011c368525ad7a906d93b82');
});
test('complete synthetic set verifies original bytes without writing files or calling the network', t => {
  const f = fixture(t), before = readFileSync(f.first), originalFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('Network forbidden in asset preflight'); };
  try {
    const result = verifyScreenshotAssets(f.root, f.plan);
    assert.equal(result.count, 13); assert.equal(result.appleWrites, 0); assert.equal(result.networkRequests, 0);
    assert.deepEqual(result.groups.map(g => g.images.length), [6, 7]);
    assert.deepEqual(readFileSync(f.first), before);
  } finally { globalThis.fetch = originalFetch; }
});
test('changed original image bytes cannot be substituted', t => {
  const f = fixture(t); writeFileSync(f.first, Buffer.concat([readFileSync(f.first), Buffer.from('altered')]));
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /SHA256 mismatch/);
});
test('wrong archive is rejected before image handling', t => {
  const f = fixture(t); writeFileSync(join(f.root, f.plan.baseArchive.file), 'different archive');
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /archive SHA256 mismatch/);
});
test('missing and extra images are rejected rather than silently uploading partial or broader sets', t => {
  const f = fixture(t); writeFileSync(join(f.root, 'unapproved.png'), png([1, 1]));
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /Missing or unapproved/);
  unlinkSync(join(f.root, 'unapproved.png')); unlinkSync(f.first);
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /Missing or unapproved/);
});
test('symlink files and directories cannot redirect reads', t => {
  const f = fixture(t); unlinkSync(f.first); symlinkSync(join(f.root, f.plan.baseArchive.file), f.first);
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /symlink/);
  unlinkSync(f.first); symlinkSync('/tmp', join(f.root, 'outside'));
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /symlink/);
});
test('path traversal, duplicates, wrong dimensions and incomplete groups fail plan validation', () => {
  for (const path of ['../outside.png', '/tmp/outside.png', 'iPhone/../outside.png', 'iPhone\\outside.png']) {
    const plan = structuredClone(approved); plan.groups[0].orderedAssets[0].file = path;
    assert.throws(() => validateScreenshotPlan(plan), /Unsafe/);
  }
  let plan = structuredClone(approved); plan.groups[0].orderedAssets[1].file = plan.groups[0].orderedAssets[0].file;
  assert.throws(() => validateScreenshotPlan(plan), /duplicate/);
  plan = structuredClone(approved); plan.groups[0].orderedAssets[0].pixels = [1, 1];
  assert.throws(() => validateScreenshotPlan(plan), /dimensions/);
  plan = structuredClone(approved); plan.groups[1].orderedAssets.pop();
  assert.throws(() => validateScreenshotPlan(plan), /Exactly7|Exactly 7/);
});
test('another build, UUID, source or approval is never accepted', () => {
  for (const [key, value] of [['buildNumber', '274'], ['buildId', 'another-build'], ['sourceCommit', '0'.repeat(40)], ['approvedAt', '2026-10-14T00:00:00Z']]) {
    assert.throws(() => validateScreenshotPlan({...approved, [key]: value}), /required/);
  }
});
test('PNG dimensions are read from original bytes; malformed/truncated/trailing data is rejected', () => {
  const valid = png([1320, 2868]); assert.deepEqual(pngDimensions(valid), [1320, 2868]);
  for (const bytes of [Buffer.from('not an image'), valid.subarray(0, valid.length - 1), Buffer.concat([valid, Buffer.from('extra')])]) {
    assert.throws(() => pngDimensions(bytes), /PNG/);
  }
});
test('incorrect image dimensions fail even if a hypothetical plan digest matches those bytes', t => {
  const f = fixture(t), bytes = png([1, 1]); writeFileSync(f.first, bytes); f.plan.groups[0].orderedAssets[0].sha256 = digest(bytes);
  assert.throws(() => verifyScreenshotAssets(f.root, f.plan), /PNG dimensions mismatch/);
});
