# Approved design-only release

Base main c649047d. Selected teal b platform icon, neutral Home full wordmark
and single bookmark, preserving selected contours and shared glass geometry.
The actual phone light/dark PNGs exactly match approved bookmark previews by
SHA256. Main onboarding DOM/code/style, Reader/auth, native launch and version
settings are preserved by byte-level boundary checks. Guided changes remain
in PR122/124 and are explicitly excluded from this release.

Local full npm test, icon/adaptive checks, ten actual Home theme/layout/keyboard
checks, structure and both native asset syncs pass. Android source contracts
pass. Local WebKit/Xcode/installed device execution is unavailable; exact PR
CI provides both-engine and unsigned Simulator build checks before merge.

Do not merge red checks. Earlier draft WebKit offline Holmes anchor failure
is diagnosed with strict unchanged assertions, state output and screenshot.
No speculative Reader production fix is included. Exact-head results and
Cloud/Apple availability must be reported separately.

One authorized main merge triggers the existing Xcode Cloud archive path.
Marketing version stays 1.8.1; Apple's CI_BUILD_NUMBER supplies a unique
counter to App and Share Extension. No guessed numeric build, extra build
trigger or App Review submission.
