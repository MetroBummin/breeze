import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyCloudBuild, verifyRelease} from '../tools/verify-ios-release.mjs';
const project = readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url), 'utf8');
// Cloud runs npm test after rewriting its checkout: restore the fixture baseline.
const baseline = project.replace(/CURRENT_PROJECT_VERSION = [^;]+;/g, 'CURRENT_PROJECT_VERSION = 236;');
for (const build of ['236', '237', '238']) {
  test(`Cloud build ${build} updates all four settings and preserves everything else`, () => {
    const result = applyCloudBuild(baseline, build);
    verifyRelease(result, build);
    assert.equal(result.replaceAll(`CURRENT_PROJECT_VERSION = ${build};`, 'CURRENT_PROJECT_VERSION = 236;'), baseline);
  });
}
for (const build of [undefined, '', '0', '-1', '1.2', 'abc', ' 237', '237\n', '0237', '1234567890123456789']) {
  test(`reject invalid counter ${JSON.stringify(build)}`, () => assert.throws(() => applyCloudBuild(baseline, build)));
}
for (const [name, altered] of [
  ['missing build', baseline.replace('CURRENT_PROJECT_VERSION = 236;', '')],
  ['target mismatch', baseline.replace('CURRENT_PROJECT_VERSION = 236;', 'CURRENT_PROJECT_VERSION = 237;')],
  ['marketing drift', baseline.replace('MARKETING_VERSION = 1.8;', 'MARKETING_VERSION = 1.9;')],
  ['missing target', baseline.replace('PRODUCT_BUNDLE_IDENTIFIER = kr.io.breeze.app.share;', 'PRODUCT_BUNDLE_IDENTIFIER = other;')],
]) {
  test(`reject ${name}`, () => assert.throws(() => applyCloudBuild(altered, '238')));
}
