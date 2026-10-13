// Read-only preparation for the exact approved build272 screenshot set.
// This module neither obtains credentials nor performs network requests.
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, readdirSync, realpathSync} from 'node:fs';
import {join, resolve, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const planURL = new URL('../releases/apple/assets/breeze-193-build272.json', import.meta.url);
const hash = (bytes, algorithm = 'sha256') => createHash(algorithm).update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
const safePath = path => typeof path === 'string' && !path.includes('\\') && !path.includes('\0') &&
  path.split('/').every(part => part && part !== '.' && part !== '..') && !path.includes(':');

export function validateScreenshotPlan(plan) {
  check(plan?.schemaVersion === 1 && plan.appId === '6804570182' && plan.version === '1.9.3' &&
    plan.buildNumber === '272' && plan.buildId === '10a92796-4109-4dbb-a519-45eda33768ea' &&
    plan.sourceCommit === '37de13779b99bdfed7f0b20809577619f163f705', 'Exact approved build272 identity required');
  check(plan.approvedAt === '2026-10-13T03:18:57.933656Z', 'Exact13-image approval required');
  check(plan.baseArchive?.file === 'Breeze-AppStore-1.9.3-iPhone5-iPad6-final.zip' &&
    /^[a-f0-9]{64}$/.test(plan.baseArchive.sha256), 'Approved base archive identity required');
  check(Array.isArray(plan.groups) && plan.groups.length === 2, 'Exactly two device groups required');
  const files = new Set(), hashes = new Set();
  for (const [index, [device, count, width, height]] of [['iPhone', 6, 1320, 2868], ['iPad', 7, 2064, 2752]].entries()) {
    const group = plan.groups[index];
    check(group.device === device && Array.isArray(group.orderedAssets) && group.orderedAssets.length === count,
      `Exactly ${count} ordered ${device} images required`);
    for (const asset of group.orderedAssets) {
      check(safePath(asset.file) && asset.file.endsWith('.png') && !files.has(asset.file), 'Unsafe or duplicate screenshot path');
      check(/^[a-f0-9]{64}$/.test(asset.sha256) && !hashes.has(asset.sha256), 'Invalid or duplicate screenshot digest');
      check(Array.isArray(asset.pixels) && asset.pixels.length === 2 && asset.pixels[0] === width && asset.pixels[1] === height,
        'Screenshot dimensions differ from approved device group');
      files.add(asset.file); hashes.add(asset.sha256);
    }
  }
  return plan;
}

function regularFile(root, relative) {
  check(safePath(relative), 'Unsafe asset path');
  let path = root;
  const parts = relative.split('/');
  for (const [index, part] of parts.entries()) {
    path = join(path, part);
    const stat = lstatSync(path);
    check(!stat.isSymbolicLink() && (index === parts.length - 1 ? stat.isFile() : stat.isDirectory()),
      'Asset paths must contain only regular directories and files');
  }
  check(realpathSync(path).startsWith(root + sep), 'Asset escaped its root');
  const stat = lstatSync(path);
  check(stat.size > 0 && stat.size <= 64 * 1024 * 1024, 'Invalid or oversized asset');
  return readFileSync(path);
}

export function pngDimensions(bytes) {
  check(bytes.length >= 45 && bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
    bytes.readUInt32BE(8) === 13 && bytes.toString('ascii', 12, 16) === 'IHDR', 'Invalid PNG header');
  let offset = 8, hasData = false, ended = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    check(length <= bytes.length - offset - 12, 'Truncated PNG chunk');
    if (type === 'IDAT') hasData = true;
    offset += length + 12;
    if (type === 'IEND') { check(length === 0 && offset === bytes.length, 'Invalid PNG ending'); ended = true; break; }
  }
  check(ended && hasData, 'Incomplete PNG');
  return [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
}

export function verifyScreenshotAssets(directory, plan = JSON.parse(readFileSync(planURL, 'utf8'))) {
  validateScreenshotPlan(plan);
  const supplied = resolve(directory);
  check(lstatSync(supplied).isDirectory() && !lstatSync(supplied).isSymbolicLink(), 'Regular asset root required');
  const root = realpathSync(supplied);
  check(hash(regularFile(root, plan.baseArchive.file)) === plan.baseArchive.sha256, 'Approved archive SHA256 mismatch');
  const expected = plan.groups.flatMap(group => group.orderedAssets), found = [];
  function scan(path, prefix = '') {
    for (const entry of readdirSync(path, {withFileTypes: true})) {
      check(!entry.isSymbolicLink(), 'Asset root contains a symlink');
      const relative = prefix + entry.name;
      if (entry.isDirectory()) scan(join(path, entry.name), relative + '/');
      else if (/\.png$/i.test(entry.name)) found.push(relative);
    }
  }
  scan(root);
  check(found.sort().join('\n') === expected.map(a => a.file).sort().join('\n'), 'Missing or unapproved screenshot file');
  const groups = plan.groups.map(group => ({device: group.device, images: group.orderedAssets.map(asset => {
    const bytes = regularFile(root, asset.file);
    check(hash(bytes) === asset.sha256, `Approved image SHA256 mismatch: ${asset.file}`);
    const pixels = pngDimensions(bytes);
    check(pixels.every((n, i) => n === asset.pixels[i]), `PNG dimensions mismatch: ${asset.file}`);
    return {file: asset.file, sha256: asset.sha256, bytes: bytes.length, pixels, md5: hash(bytes, 'md5')};
  })}));
  return {appId: plan.appId, version: plan.version, buildNumber: plan.buildNumber, buildId: plan.buildId,
    approvedAt: plan.approvedAt, count: expected.length, groups, networkRequests: 0, appleWrites: 0};
}

// Re-read through the same path and digest checks immediately before transfer.
export function readScreenshotBytes(directory, asset) {
  const supplied = resolve(directory);
  check(lstatSync(supplied).isDirectory() && !lstatSync(supplied).isSymbolicLink(), 'Regular asset root required');
  const bytes = regularFile(realpathSync(supplied), asset.file);
  check(hash(bytes) === asset.sha256, 'Approved image SHA256 mismatch before transfer');
  return bytes;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    check(process.argv.length === 3, `Usage: node ${fileURLToPath(import.meta.url)} ASSET_DIRECTORY`);
    console.log(JSON.stringify(verifyScreenshotAssets(process.argv[2]), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
