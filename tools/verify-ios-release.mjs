import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function validateBuildNumber(value) {
  assert.match(value ?? '', /^[1-9]\d{0,17}$/, 'Build number must be a positive integer of at most 18 digits');
  assert.ok(BigInt(value) > 271n, '1.9.3 build number must exceed existing TestFlight build 271');
  return value;
}

function appReleaseBlocks(project) {
  const blocks = [...project.matchAll(/isa = XCBuildConfiguration;([\s\S]*?)name = (Debug|Release);/g)]
    .filter(m => /PRODUCT_BUNDLE_IDENTIFIER = kr\.io\.breeze\.app(?:\.share)?;/.test(m[1]));
  assert.equal(blocks.length, 4, 'Expected App and Share Extension Debug/Release configurations');
  const keys = blocks.map(m => `${m[1].match(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/)[1]}:${m[2]}`);
  assert.equal(new Set(keys).size, 4, 'Duplicate or missing target configuration');
  return blocks;
}

export function verifyRelease(project, expectedBuild = '273') {
  validateBuildNumber(expectedBuild);
  for (const block of appReleaseBlocks(project)) {
    const builds = [...block[1].matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)];
    const versions = [...block[1].matchAll(/MARKETING_VERSION = ([^;]+);/g)];
    assert.equal(builds.length, 1, 'Missing or duplicate build number');
    validateBuildNumber(builds[0][1]);
    assert.equal(builds[0][1], expectedBuild, 'App and extension build numbers must match expected build');
    assert.deepEqual(versions.map(m => m[1]), ['1.9.3'], 'Marketing version must remain 1.9.3');
  }
}

// UTC YYYYMMDDHHMMSS. Distinct from the small Xcode Cloud counter, and unique
// for builds that do not start in the same second.
export function cloudBuildStamp(now = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}`;
}

// App Store Connect receives the number written here, not the checked-in baseline.
// CI_BUILD_NUMBER can repeat a build Apple already accepted. A greater UTC stamp
// is unused; a cloud counter that is already greater is left unchanged.
export function resolveCloudBuildNumber(ciBuildNumber, now = new Date()) {
  validateBuildNumber(ciBuildNumber);
  const stamp = validateBuildNumber(cloudBuildStamp(now));
  return BigInt(stamp) > BigInt(ciBuildNumber) ? stamp : ciBuildNumber;
}

export function verifyResolvedCloudRelease(project, ciBuildNumber) {
  validateBuildNumber(ciBuildNumber);
  const builds = appReleaseBlocks(project).map(block => {
    const found = [...block[1].matchAll(/CURRENT_PROJECT_VERSION = ([^;]+);/g)];
    assert.equal(found.length, 1, 'Missing or duplicate build number');
    return found[0][1];
  });
  assert.equal(new Set(builds).size, 1, 'App and extension build numbers must match');
  assert.ok(BigInt(builds[0]) >= BigInt(ciBuildNumber), 'Uploaded build must not be lower than the Xcode Cloud counter');
  verifyRelease(project, builds[0]);
}

export function applyCloudBuild(project, build) {
  validateBuildNumber(build);
  // Validate the checked-in release before rewriting; do not hide drift or missing settings.
  verifyRelease(project);
  const updated = project.replace(/CURRENT_PROJECT_VERSION = 273;/g, `CURRENT_PROJECT_VERSION = ${build};`);
  verifyRelease(updated, build);
  return updated;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = new URL('../ios/App/App.xcodeproj/project.pbxproj', import.meta.url);
  const project = readFileSync(path, 'utf8');
  const ci = process.env.CI_BUILD_NUMBER;
  if (process.argv.includes('--apply-cloud-build')) {
    const build = resolveCloudBuildNumber(ci);
    writeFileSync(path, applyCloudBuild(project, build));
    console.log(`Breeze and Share Extension: 1.9.3 (${build})`);
  } else if (ci) {
    verifyResolvedCloudRelease(project, ci);
    console.log(`Breeze and Share Extension: 1.9.3 (cloud ${ci})`);
  } else {
    verifyRelease(project);
    console.log('Breeze and Share Extension: 1.9.3 (273)');
  }
}
