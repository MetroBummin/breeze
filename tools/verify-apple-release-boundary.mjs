// Release tooling after272 must not change a single shipped or historical byte.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync, lstatSync, mkdtempSync, rmSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const baseline = '5f8b178e45727948690c0ce52d1e5f0a30362544';
const shipped = '37de13779b99bdfed7f0b20809577619f163f705';
const runners = ['.github/workflows/integrity.yml', '.github/workflows/design-brand.yml', '.github/workflows/social-auth.yml'];
const allowed = new Set([...runners, '.github/workflows/apple-release.yml', 'package.json',
  'tools/apple-release.mjs', 'tools/apple-screenshots.mjs', 'tools/verify-apple-screenshot-assets.mjs',
  'tools/verify-apple-release-boundary.mjs', 'tests/verify-apple-release-boundary.mjs',
  'tests/verify-apple-screenshots.mjs', 'tests/verify-apple-screenshot-assets.mjs',
  'releases/apple/assets/breeze-193-build272.json', 'docs/decisions/031-apple-272-screenshot-preflight.md',
  'docs/apple-release-automation.md']);
const git = (...args) => execFileSync('git', args, {cwd: root, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe']});
const read = path => readFileSync(join(root, path));
const original = path => git('show', `${baseline}:${path}`).toString();
const blob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
function regular(path, mode = '100644') {
  const stat = lstatSync(join(root, path));
  assert.ok(stat.isFile(), `Regular release file required: ${path}`);
  assert.equal(stat.mode & 0o111 ? '100755' : '100644', mode, `Release mode drift: ${path}`);
}
export function verifyAppleReleaseBoundary() {
  git('merge-base', '--is-ancestor', baseline, 'HEAD');
  const changed = [...git('diff', '--name-only', baseline).toString().split('\n'),
    ...git('ls-files', '--others', '--exclude-standard').toString().split('\n')].filter(Boolean);
  for (const path of changed) { assert.ok(allowed.has(path), `Unapproved release tooling path: ${path}`); regular(path); }
  for (const entry of git('ls-tree', '-rz', baseline).toString().split('\0').filter(Boolean)) {
    const [meta, path] = entry.split('\t'), [mode, type, id] = meta.split(' ');
    assert.equal(type, 'blob'); if (allowed.has(path)) continue;
    regular(path, mode); assert.equal(blob(read(path)), id, `Shipped or historical bytes changed: ${path}`);
  }
  // CI changes may only route the boundary check; no assertion/job suppression.
  for (const path of runners) assert.equal(read(path).toString(), original(path)
    .replaceAll('tests/verify-193-build272-boundary.mjs', 'tests/verify-apple-release-boundary.mjs'), `Unexpected CI edit: ${path}`);
  assert.equal(read('package.json').toString(), original('package.json').replace('tests/verify-apple-release.mjs &&',
    'tests/verify-apple-release.mjs tests/verify-apple-screenshot-assets.mjs tests/verify-apple-screenshots.mjs &&'), 'Unexpected package edit');
}
export function verifyOriginal272() {
  const scratch = mkdtempSync(join(tmpdir(), 'breeze-apple-historical272-')); let registered = false;
  try {
    git('worktree', 'add', '--quiet', '--detach', scratch, shipped); registered = true;
    execFileSync(process.execPath, ['tests/verify-193-build272-boundary.mjs'], {cwd: scratch, stdio: 'inherit'});
  } finally {
    if (registered) git('worktree', 'remove', '--force', scratch); else rmSync(scratch, {recursive: true, force: true});
  }
}
