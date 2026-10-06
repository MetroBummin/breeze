# Android internal-test preparation

This change adds an official Capacitor 8.5.0 Android project alongside the existing
iOS project. It does not merge the separate Android handwriting work, change iOS
release numbering, sign a Play release, upload to Play, or deploy anything.

## Build contract

- Release application ID: `kr.io.breeze.app`; debug ID: `kr.io.breeze.app.debug`
- Capacitor core/CLI/iOS/Android lockfile versions: 8.5.0
- Node 22+, Java 21, Android SDK 36; Android 7/API 24 minimum
- Android Gradle Plugin 8.13.0 and Gradle 8.14.3; wrapper distribution checksum pinned
- Android version code starts at 1 independently of the Apple build counter. Supply
  `-PandroidVersionCode=N` for later Play uploads; N must exceed previously uploaded
  Play versions and be at most 2100000000. Version name comes from package.json.
- The checked-in native launcher uses unchanged `assets/favicon/icon-512.png`.
- Only INTERNET permission is requested. OS backup and device-transfer extraction
  are disabled, preserving the app's explicit encrypted-backup/local-original model.

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run test:android
npm run android:sync
cd android
./gradlew --no-daemon lintDebug assembleDebug assembleDebugAndroidTest bundleRelease
```

`android:debug` includes web asset sync and makes an installable development APK.
`android:bundle` includes sync and makes an **unsigned** release AAB. Neither uploads.
Android sync must run again after any web, native, or handwriting integration change.
Never commit generated assets, build outputs, release keys, signing passwords, or
local SDK paths. Do not configure CI signing until the owner explicitly approves
the secure credential setup and the destination.

## Continuous verification and artifacts

`.github/workflows/android-build.yml` checks out the exact proposed commit and uses
the GitHub runner's existing SDK. It runs wrapper contracts, builds/syncs all bundled
web assets, checks sync equality, runs Android lint, compiles the app and the device
test APK, and assembles debug APK plus unsigned release AAB. It does not accept new
SDK licenses, access signing credentials, or publish a Play release.

`tools/verify-android-artifacts.py` compares every runtime asset byte in both
artifacts against `www`, rejects scaffold-only assets, checks the release AAB is
unsigned, and records exact source commit, SHA-256, size and remaining release gates.
The artifact and lint report are retained for seven days. A green build is compile
and packaging evidence, not a completed tablet/stylus or Play acceptance test.

Generated template arithmetic/package-name tests were removed. The correctly
namespaced `PackagedAssetsTest` is a device/emulator smoke test for app identity and
bundled runtime assets. `assembleDebugAndroidTest` only compiles it. To actually run
it on a connected authorized test device/emulator, use `connectedDebugAndroidTest`.

## Before the first Play internal test

1. Integrate and rerun the separate Android PDF-pointer handwriting change.
2. Verify the existing Play developer account and the app's package identity. Account
   ownership/verification, any required account fee, and any blocking Console tasks
   are not established by this repository. Do not create/pay for an account silently.
3. Use the owner's approved upload-signing key or arrange owner-controlled key setup.
   A default debug key and unsigned AAB are not acceptable substitutes for the Play
   upload key. Key creation, persistent secret storage and new signing access are
   separate approval gates; never send passwords or private keys in chat or a PR.
4. Build/sign the final exact commit, choose a fresh Android version code, inspect
   the Console's required app-content/listing declarations and Play App Signing
   terms, then obtain the necessary approval before submitting the internal release.
5. Add the approved tester group and verify the returned opt-in link by installing
   from it. Internal testing is distinct from production publication. Do not promise
   a submission/availability date until account, signing and review gates are known.

## Android device QA required before release claim

Use a phone and an Android tablet with a real stylus, with an up-to-date WebView:

- Launch and return from background; rotate and resize without losing the reader
- Light/dark, short landscape, system bars, gesture navigation and keyboard insets
- Import PDF/EPUB via system picker; cancel/retry; open locally with network disabled
- Stylus-only ink, palm rejection, pen during inertia, finger scroll, two-finger zoom
- Repeated pen/eraser toggles, canceled pointers, page switches, sidebar and Back
- Ink persistence after close/reopen, app restart, offline use, and page deletion
- Email/password/OTP login and explicit backup export/import where supported
- Release-signed upgrade preserves existing local data; debug's separate ID is not
  proof of the release upgrade path

The current wrapper has no Android share-receiver extension or iOS-only native
plugins. System file picking uses the web runtime; iOS-specific functionality must
not be advertised as Android-verified merely because the shell compiles.

## Official requirements checked October 6, 2026

- [Google Play target API policy](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-EN): new mobile apps and updates require Android 16/API 36 from August 31, 2026
- [Capacitor Android](https://capacitorjs.com/docs/android) and [Capacitor 8 migration](https://capacitorjs.com/docs/updating/8-0): API 24 minimum, SDK 36 and supported build versions
- [Android app signing](https://developer.android.com/studio/publish/app-signing): app bundles need the upload signature before Play Console upload
- [Google Play internal tests](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en-EN): tester opt-in distribution and temporary first-upload listing details
- [Hosted Ubuntu runner inventory](https://github.com/actions/runner-images/blob/main/images/ubuntu/Ubuntu2404-Readme.md): preinstalled Android SDK/build tools

## Local evidence

The immutable main `693488cfe25419654e91d5bf18a03cbb8d8d591c` source archive was
downloaded without credentials and all 804 tracked blobs were verified against the
GitHub tree. The official Capacitor generator and Android sync succeeded, packaging
195 runtime files (19.94 MB). Existing typecheck passed its baseline without new
diagnostics. This cloud executor has Java 21 but no Android SDK, so native compilation
and lint results must come from the exact-commit GitHub workflow. Device QA, release
signing and Console submission remain outstanding until separately verified.
