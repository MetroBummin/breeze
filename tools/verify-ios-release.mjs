import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function validateBuildNumber(value) {
  assert.match(value ?? '', /^[1-9]\d{0,17}$/, 'Build number must be a positive integer of at most 18 digits');
  return value;
}

export function verifyRelease(project, expectedBuild = '252') {
  validateBuildNumber(expectedBuild);
  const blocks = [...project.matchAll(/isa = XCBuildConfiguration;([\s\S]*?)name = (Debug|Release);/g)]
    .filter(m => /PRODUCT_BUNDLE_IDENTIFIER = kr\.io\.breeze\.app(?:\.share)?;/.test(m[1]));
  assert.equal(blocks.length, 4, 'Expected App and Share Extension Debug/Release configurations');
  const keys = blocks.map(m => `${m[1].match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/)[1]}:${m[2]}`);
  assert.equal(new Set(keys).size, 4, 'Duplicate or missing target configuration');
  for (const block of blocks) {
    const builds = [...block[1].matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)];
    const versions = [...block[1].matchAll(/MARKETING_VERSION = ([^;]+);/g)];
    assert.equal(builds.length, 1, 'Missing or duplicate build number');
    validateBuildNumber(builds[0][1]);
    assert.equal(builds[0][1], expectedBuild, 'App and extension build numbers must match expected build');
    assert.deepEqual(versions.map(m => m[1]), ['1.9'], 'Marketing version must remain 1.9');
  }
}

export function applyCloudBuild(project, build) {
  validateBuildNumber(build);
  // Validate the checked-in release before rewriting; do not hide drift or missing settings.
  verifyRelease(project);
  const updated = project.replace(/CURRENT_PROJECT_VERSION = 252;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  verifyRelease(updated, build);
  return updated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
  const project = readFileSync(path, 'utf8');
  if (process.argv.includes('--apply-cloud-build')) {
    writeFileSync(path, applyCloudBuild(project, process.env.CI_BUILD_NUMBER));
  } else {
    verifyRelease(project, process.env.CI_BUILD_NUMBER ?? '252');
  }
  console.log(`Breeze and Share Extension: 1.9 (${process.env.CI_BUILD_NUMBER ?? '252'})`);
}
