import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, unlinkSync, existsSync, chmodSync, symlinkSync} from 'node:fs';
import {verifyAppleReleaseBoundary, verifyOriginal272} from '../tools/verify-apple-release-boundary.mjs';
verifyAppleReleaseBoundary();
for (const file of ['scripts/ui/study-sets.js', 'ios/App/App.xcodeproj/project.pbxproj',
  'tools/record-193-build272-boundary.mjs', 'docs/qa/breeze-193-build272/boundary.json',
  '.github/workflows/integrity.yml', 'package.json']) {
  const path = new URL('../' + file, import.meta.url), original = readFileSync(path);
  try {
    writeFileSync(path, Buffer.concat([original, Buffer.from('\n// deliberate regression\n')]));
    assert.throws(verifyAppleReleaseBoundary, /Unapproved|changed|Unexpected/);
  } finally { writeFileSync(path, original); }
}
const extra = new URL('../unapproved-release-probe.txt', import.meta.url);
assert.equal(existsSync(extra), false);
try { writeFileSync(extra, 'probe'); assert.throws(verifyAppleReleaseBoundary, /Unapproved/); }
finally { unlinkSync(extra); }
const path = new URL('../tools/apple-screenshots.mjs', import.meta.url), bytes = readFileSync(path);
try { chmodSync(path, 0o755); assert.throws(verifyAppleReleaseBoundary, /mode drift/); }
finally { chmodSync(path, 0o644); }
try { unlinkSync(path); symlinkSync('apple-release.mjs', path); assert.throws(verifyAppleReleaseBoundary, /Regular/); }
finally { unlinkSync(path); writeFileSync(path, bytes); }
verifyAppleReleaseBoundary();
verifyOriginal272();
console.log('Release tooling boundary: shipped272 bytes and original historical positive/negative contracts preserved.');
