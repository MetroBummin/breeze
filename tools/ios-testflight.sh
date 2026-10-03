#!/bin/bash
# Run from an authenticated Mac. No keys or signing material belong in this repo.
set -euo pipefail
mode="${1:---archive}"
case "$mode" in --archive|--upload) ;; *) echo "Usage: $0 [--archive|--upload]" >&2; exit 2;; esac
if [[ "$(uname -s)" != Darwin ]] || ! command -v xcodebuild >/dev/null; then
  echo "Requires macOS with Xcode and Apple signing access. No archive or upload was attempted." >&2
  exit 1
fi
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"
# Confirm both targets retain the reviewed version; do not auto-increment a release.
node tools/verify-ios-release.mjs
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run ios:sync
release_out="${BREEZE_RELEASE_DIR:-$repo_root/build/ios-1.7-231}"
mkdir -p "$release_out"
archive="$release_out/Breeze-1.7-231.xcarchive"
if [[ -e "$archive" ]]; then echo "Archive already exists: $archive. Use a fresh BREEZE_RELEASE_DIR." >&2; exit 1; fi
# Optional App Store Connect API key (path only); otherwise use Xcode's signed-in account.
auth=()
if [[ -n "${ASC_KEY_PATH:-}" ]]; then
  : "${ASC_KEY_ID:?Set ASC_KEY_ID}" "${ASC_ISSUER_ID:?Set ASC_ISSUER_ID}"
  auth=(-authenticationKeyPath "$ASC_KEY_PATH" -authenticationKeyID "$ASC_KEY_ID" -authenticationKeyIssuerID "$ASC_ISSUER_ID")
fi
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$archive" \
  -allowProvisioningUpdates "${auth[@]}" archive
/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$archive/Info.plist"
[[ "$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleVersion' "$archive/Info.plist")" == 231 ]]
[[ "$(/usr/libexec/PlistBuddy -c 'Print :ApplicationProperties:CFBundleShortVersionString' "$archive/Info.plist")" == 1.7 ]]
if [[ "$mode" == --upload ]]; then
  xcodebuild -exportArchive -archivePath "$archive" \
    -exportOptionsPlist ios/ExportOptions-TestFlight.plist -exportPath "$release_out/export" \
    -allowProvisioningUpdates "${auth[@]}"
  echo 'Upload command completed. Confirm Apple processing and build 1.7 (231) in TestFlight before claiming availability.'
else
  echo "Archive ready: $archive"
fi
