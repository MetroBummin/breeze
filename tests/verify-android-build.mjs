import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const json = path => JSON.parse(read(path));

test('Android uses the existing Capacitor version and secure local origin', () => {
  const pkg = json('package.json'), lock = json('package-lock.json'), config = json('capacitor.config.json');
  assert.equal(pkg.dependencies['@capacitor/android'], pkg.dependencies['@capacitor/core']);
  for (const name of ['core', 'android', 'ios', 'cli']) {
    assert.equal(lock.packages[`node_modules/@capacitor/${name}`].version, '8.5.0');
  }
  assert.equal(config.appId, 'kr.io.breeze.app');
  assert.equal(config.webDir, 'www');
  assert.equal(config.server.androidScheme, 'https');
  assert.equal(config.server.url, undefined, 'Ship local bundled content, not a development server');
  assert.match(pkg.scripts['android:sync'], /npm run www && cap sync android/);
});

test('native wrapper targets API 36 and separates debug identity from Play', () => {
  const variables = read('android/variables.gradle'), app = read('android/app/build.gradle');
  assert.match(variables, /minSdkVersion\s*=\s*24/);
  assert.match(variables, /compileSdkVersion\s*=\s*36/);
  assert.match(variables, /targetSdkVersion\s*=\s*36/);
  assert.match(app, /namespace\s*=\s*"kr\.io\.breeze\.app"/);
  assert.match(app, /applicationId "kr\.io\.breeze\.app"/);
  assert.match(app, /applicationIdSuffix '\.debug'/);
  assert.match(app, /versionCode requestedVersionCode\.toInteger\(\)/);
  assert.match(app, /2100000000/);
  assert.doesNotMatch(app, /signingConfig\s|storePassword|keyPassword/);
  assert.match(read('android/app/src/main/java/kr/io/breeze/app/MainActivity.java'), /extends BridgeActivity/);
});

test('wrapper preserves local-data privacy and keeps permissions minimal', () => {
  const manifest = read('android/app/src/main/AndroidManifest.xml');
  assert.match(manifest, /android:allowBackup="false"/);
  assert.match(manifest, /android:fullBackupContent="false"/);
  assert.match(manifest, /android:usesCleartextTraffic="false"/);
  assert.match(manifest, /android:dataExtractionRules="@xml\/data_extraction_rules"/);
  const permissions = [...manifest.matchAll(/<uses-permission android:name="([^"]+)"/g)].map(match => match[1]);
  assert.deepEqual(permissions, ['android.permission.INTERNET']);
  const backup = read('android/app/src/main/res/xml/data_extraction_rules.xml');
  for (const kind of ['cloud-backup', 'device-transfer']) {
    const section = backup.split(`<${kind}>`)[1]?.split(`</${kind}>`)[0];
    assert.ok(section);
    for (const domain of ['root', 'file', 'database', 'sharedpref', 'external']) {
      assert.ok(section.includes(`<exclude domain="${domain}" path="." />`));
    }
  }
});

test('Android launcher reuses the unchanged approved Breeze artwork', () => {
  const hash = path => createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex');
  assert.equal(hash('android/app/src/main/res/mipmap-nodpi/ic_launcher.png'), hash('assets/favicon/icon-512.png'));
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">Breeze<\/string>/);
});

test('reproducible wrapper and CI produce explicitly unsigned release artifacts', () => {
  const wrapper = read('android/gradle/wrapper/gradle-wrapper.properties');
  assert.match(wrapper, /gradle-8\.14\.3-bin\.zip/);
  assert.match(wrapper, /distributionSha256Sum=bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531/);
  assert.ok(existsSync(new URL('android/gradle/wrapper/gradle-wrapper.jar', root)));
  const ci = read('.github/workflows/android-build.yml');
  assert.match(ci, /persist-credentials: false/);
  assert.match(ci, /java-version: '21'/);
  assert.match(ci, /lintDebug assembleDebug assembleDebugAndroidTest bundleRelease/);
  assert.match(ci, /python3 tools\/verify-android-artifacts\.py/);
  assert.doesNotMatch(ci, /secrets\.|pull_request_target|sdkmanager --licenses|supply|upload_to_play_store/);
  const ignore = read('android/.gitignore').split('\n');
  for (const entry of ['*.jks', '*.keystore', 'keystore.properties', 'signing.properties']) assert.ok(ignore.includes(entry));
});
