# Holmes illustrated collection validation

Verified 2026-10-04 on isolated branch `codex/holmes-illustrated-five`, based on main `2b80f51775c4b8719a86a243baec7fe6a9c3eb5a`.

Five approved covers and fifty interior illustrations are bundled as uncropped WebP derivatives (6,581,598 bytes total, from 122,296,418 bytes of user-delivered PNG originals). Source/derivative hashes, dimensions, generation records and source-backed scene placements are preserved under `docs/content`. Originals and the supplied complete-text patch remain outside this checkout, untouched.

The Final Problem has 123 blocks and 7,150 words; The Hound of the Baskervilles has 1,328 blocks, 59,266 words, all fifteen chapters and complete original frontmatter. Existing three story text bytes are unchanged. Every scene appears after its depicted passage. Previews show covers only. Source text and reading-position indices remain canonical; saved titles, covers and positions are preserved.

## Passed checks

- Full `npm test`, including type-check baseline, source coverage/edit replay, all asset hashes/containers/dimensions, source-backed anchors and existing FSRS tests.
- Five illustrated books in Chromium and WebKit: full import, all fifty image decodes and placements, word-lookup data, real IndexedDB reload and offline late-paragraph restoration.
- Five viewport sizes in light and dark themes (320×568, 390×844, 820×1180, 1440×900, 844×390), plus Hound title/chapter typography at font sizes 14 and 26.
- Existing Backrooms reading/import and lookup, long-read preview/cancellation/truncation/custom-cover repair, and simple word cards in Chromium and WebKit.
- Complete new text normal TXT import, lookup spans, database reload and offline restoration in both engines.
- `npm run ios:sync`: 195 web files, 19.90 MB. All fifty-five image hashes and all five text bytes match the native web bundle. Editorial source/license records are excluded.
- `node tools/verify-ios-release.mjs`: app and extension Debug/Release remain 1.7 (232).
- `git diff --check`.

## Screenshots

These are synthetic local QA fixtures, not user reading data. Reader shots can contain story spoilers; do not use them in promotional galleries.

- [chromium-shelf-820x1180-dark.png](chromium-shelf-820x1180-dark.png)
- [webkit-shelf-390x844-light.png](webkit-shelf-390x844-light.png)
- [chromium-final-problem-390x844-light.png](chromium-final-problem-390x844-light.png)
- [webkit-hound-frontmatter-320-light-font26.png](webkit-hound-frontmatter-320-light-font26.png)
- [webkit-hound-chapter9-390-light-font26.png](webkit-hound-chapter9-390-light-font26.png)
- [chromium-speckled-band-844x390-dark.png](chromium-speckled-band-844x390-dark.png)

## Remaining release checks

No native binary build, physical-device performance test, archive, upload, version increment or merge was performed. WebKit does not establish cold service-worker control in this harness; native iOS WebView cold offline launch and hardware reading behavior need the coordinated device check before release. Browser offline position tests and native bundle hash checks are separate evidence, not a claim of a completed device test. Existing saved custom/default covers are retained intentionally.

## CI fixture correction

The first Integrity run on `db841de` passed the five-story suite and both-engine
reader gesture/pinch checks, but `verify-client-polish-browser.mjs:23` timed out
waiting for the retired 1024px PNG cover. The timeout reproduced locally.

The fixture now waits for both exact manifest dimensions, validates on-disk cover
bytes/SHA-256, and compares each repaired IndexedDB cover Blob's bytes, SHA-256
and decoded dimensions with its audited WebP entry. Existing text/identity,
custom-cover, dormant review UI, schedule-byte preservation and twenty per-engine
theme/viewport captures remain intact. The concurrent cover-repair unit mock also
uses the current manifest size/type. A repository search found no remaining old
Holmes cover size/dimension assertions; PNG filenames in generation/source
provenance remain intentional. The covers README now describes current assets.

The corrected client-polish suite passed Chromium and WebKit, and full `npm test`
passed. The complete `npm run test:holmes` also passed all five works in both
engines. Product code and release settings were not changed for this correction.

## Existing cloud archive path inspected

Base main `2b80f51775c4b8719a86a243baec7fe6a9c3eb5a` has an `App | Default`
GitHub commit status of `success`, pointing to the [existing Xcode Cloud run](https://appstoreconnect.apple.com/teams/39091a3f-cb93-4b26-95f6-b3a372956334/apps/6804570182/ci/builds/bd2aca48-d7b9-47a0-a880-346706222038).
This confirms a cloud build path, not actual TestFlight processing or tester access.

`ios/App/ci_scripts/ci_post_clone.sh` supplies Node 22+ if needed, installs locked
dependencies, runs full `npm test`, and performs `ios:sync` before Cloud Archive.
It rejects a nonempty `CI_BUILD_NUMBER` other than 232. The shared App scheme's
Archive action uses Release. App/Share Extension Debug/Release, the release
verifier and the local `tools/ios-testflight.sh` also target 1.7 (232). The local
script requires an authenticated Mac; it is separate from Cloud. Prior release
QA documents identify the existing Default / Archive - iOS workflow with its
TestFlight post-action; Apple-side current workflow/counter/distribution settings
need confirmation for the next coordinated release. No Cloud workflow trigger,
number increment, archive or upload was performed here.
