// One approved 1.9.8 review submission for Cloud run 295d8dcf.
// Uses the existing release client. Prints no keys, JWTs, or response bodies.
import {existsSync, readFileSync} from 'node:fs';
import {ReleaseError, createClient, release, tokenFactory} from './apple-release.mjs';

const RUN_ID = '295d8dcf-61d4-49f7-9beb-475f4c669f5a';
const COMMIT = '3423d0204da1df9922dd3091af2d39969024836c';
const CONFIRM = 'submit:breeze-198';

function expiry(now = Date.now()) {
  return new Date(now + 20 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function rel(resource, name) {
  const data = resource?.relationships?.[name]?.data;
  return data && typeof data.id === 'string' ? data.id : null;
}
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function describe(client) {
  const run = (await client.request('GET', `/v1/ciBuildRuns/${RUN_ID}`)).data;
  const attributes = run?.attributes ?? {};
  const summary = {
    ciBuildRunId: run?.id ?? null,
    buildNumber: attributes.number == null ? null : String(attributes.number),
    executionProgress: attributes.executionProgress ?? null,
    completionStatus: attributes.completionStatus ?? null,
    isPullRequestBuild: attributes.isPullRequestBuild ?? null,
    sourceCommit: attributes.sourceCommit?.commitSha ?? null,
  };
  const linked = await client.list(`/v1/ciBuildRuns/${RUN_ID}/builds?limit=200`);
  const builds = [];
  for (const item of linked) {
    if (item?.type !== 'builds' || typeof item.id !== 'string') continue;
    const build = (await client.request('GET', `/v1/builds/${item.id}?include=app,preReleaseVersion`)).data;
    const preId = rel(build, 'preReleaseVersion');
    const pre = preId ? (await client.request('GET', `/v1/preReleaseVersions/${preId}`)).data : null;
    builds.push({
      buildId: build?.id ?? null,
      buildNumber: build?.attributes?.version ?? null,
      processingState: build?.attributes?.processingState ?? null,
      expired: build?.attributes?.expired ?? null,
      buildAudienceType: build?.attributes?.buildAudienceType ?? null,
      version: pre?.attributes?.version ?? null,
      platform: pre?.attributes?.platform ?? null,
    });
  }
  return {summary, builds};
}

function confirmed() {
  if (process.env.CONFIRM === CONFIRM) return true;
  const path = 'releases/apple/live/submit-breeze-198.json';
  if (!existsSync(path)) return false;
  try {
    const request = JSON.parse(readFileSync(path, 'utf8'));
    return request?.releaseId === 'breeze-198' && request?.confirmation === CONFIRM;
  } catch {
    return false;
  }
}

async function main() {
  const submit = confirmed();
  console.log(JSON.stringify({
    releaseEnabled: process.env.ASC_RELEASE_ENABLED === 'true',
    writesEnabled: process.env.ASC_WRITES_ENABLED === 'true',
    keyType: process.env.ASC_KEY_TYPE || null,
    appId: process.env.ASC_APP_ID || null,
    keyIdSet: Boolean(process.env.ASC_KEY_ID),
    issuerSet: Boolean(process.env.ASC_ISSUER_ID),
    keySet: Boolean(process.env.ASC_PRIVATE_KEY),
    submit,
  }));
  if (process.env.ASC_RELEASE_ENABLED !== 'true') throw new ReleaseError('Secure Apple environment setup is not enabled');
  const client = createClient({
    token: tokenFactory(process.env),
    allowWrites: submit && process.env.ASC_WRITES_ENABLED === 'true',
  });
  let found = null;
  for (let attempt = 1; attempt <= 16; attempt++) {
    const described = await describe(client);
    console.log(JSON.stringify({attempt, ...described.summary, builds: described.builds}));
    if (attempt === 1 && submit && process.env.ASC_WRITES_ENABLED !== 'true') {
      throw new ReleaseError('Apple writes require ASC_WRITES_ENABLED=true');
    }
    const runOk = described.summary.executionProgress === 'COMPLETE'
      && described.summary.completionStatus === 'SUCCEEDED'
      && described.summary.isPullRequestBuild === false
      && described.summary.sourceCommit === COMMIT;
    const ready = described.builds.filter(build => build.processingState === 'VALID'
      && build.expired === false && build.buildAudienceType === 'APP_STORE_ELIGIBLE'
      && build.version === '1.9.8' && build.platform === 'IOS'
      && /^[1-9]\d{0,17}$/.test(build.buildNumber ?? ''));
    if (runOk && ready.length === 1) { found = {summary: described.summary, build: ready[0]}; break; }
    if (described.summary.completionStatus && described.summary.completionStatus !== 'SUCCEEDED'
      && described.summary.executionProgress === 'COMPLETE') {
      throw new ReleaseError(`Cloud run finished ${described.summary.completionStatus}`);
    }
    if (attempt === 16) break;
    await sleep(60_000);
  }
  if (!found) throw new ReleaseError('Cloud build is not a valid App Store 1.9.8 upload yet');
  if (!submit) return;
  if (process.env.ASC_WRITES_ENABLED !== 'true') throw new ReleaseError('Apple writes require ASC_WRITES_ENABLED=true');
  const manifest = {
    schemaVersion: 1,
    releaseId: 'breeze-198',
    appId: process.env.ASC_APP_ID,
    bundleId: 'kr.io.breeze.app',
    version: '1.9.8',
    buildId: found.build.buildId,
    buildNumber: found.build.buildNumber,
    ciBuildRunId: RUN_ID,
    expectedCommit: COMMIT,
    releaseType: 'MANUAL',
    whatsNew: {ko: '텍스트로 읽던 위치가 원본 EPUB과 PDF에서도 이어집니다.'},
    authorization: {operation: 'submit', expiresAt: expiry()},
  };
  const result = await release(client, manifest, 'submit');
  console.log(JSON.stringify({
    result: result.result,
    versionId: result.versionId ?? null,
    submissionId: result.submissionId ?? null,
    reviewState: result.reviewState ?? null,
    itemState: result.itemState ?? null,
    versionState: result.versionState ?? null,
    buildNumber: manifest.buildNumber,
    buildId: manifest.buildId,
  }));
}

main().catch(error => {
  console.error(error instanceof ReleaseError ? error.message : 'Apple submit failed');
  process.exitCode = 1;
});
