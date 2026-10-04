# Home reading cards and started Holmes stories, 2026-10-04

Base: current main `0e72a35be0fa663167acd7de2c7dd9a8dfbdfc4c`, after PR93.
Scope: the two user-reported post-234 defects, in a new draft PR. Progress/anchor ownership,
RSS OFF and working gestures remain unchanged. The subsequent user authorization
adds TestFlight preparation for 1.7(235); the parent owns merge and cloud upload.

## Reproduced causes

The canonical record was already singular: `positions[book.id]`. Actual bundled
Bohemia read-start and wheel reading moved paragraph 173 (66.54%) to 177 (68.08%).
Returning Home committed 68.08% to memory and localStorage immediately. The center
capsule displayed 68%; the same retained shelf card still displayed 66%.

The same real ten-page PDF moved from completion to 50.51% and then backward to
19.51%. On the old source, the first two Home labels refreshed because completion
changed; the last retained label stayed at 50% while the committed record and
center capsule showed 19%. The fresh library shelf reads the current record.
These regressions fail on the previous source and pass after the patch. The
PDF fixture proves the shared render path; it is not the user's supplied PDF.

`homeBookSpec` intentionally retains tiles/covers, with a structural stamp whose
only progress input was completion. The patch adds a label update to the existing
reconciliation callback, using the current committed record. It does not replace
the tile for partial progress, change the stored position or hide backward moves.
Cold re-rendering or changed structural metadata can repair a stale label. The
user's eventual correction after using other apps is observed but its precise
trigger is unknown; waiting or backgrounding alone is not claimed causal.

Bundled saved cards also unconditionally opened catalog preview before the
read-start check. The patch checks their existing per-book timestamp and resumes
the exact clicked record. Catalog cards resolve a live library identity at tap
time. Unread/missing copies still preview, and only Read imports. No title special
case, new storage flag, duplicate book or network fetch is needed to resume.

## Verification

`tests/verify-home-reading-cards.mjs` evaluates the real source with DOM fixtures.
All five checks fail against the prior source and pass with the patch: partial
and backward updates without replacing cover nodes, first-read labels, PDF
completion/50/19, exact started-copy routing, current catalog identity and
deleted/unread/reimport state.

`tests/verify-home-reading-cards-browser.mjs` uses actual TXT import, real trusted
wheel reading, native Home return, durable database reload and a real PDF fixture.
It checks the visible card, center capsule and saved record separately. It covers
both Home and Explore; unread preview cancel and Read; Back/Forward; direct repeat
opens; backward progress; renamed/replaced/reloaded saved copies; interrupted
preparation; deletion/reimport; delayed illustration and font changes; and
light/dark at 390×844, 320×568, 820×1180, 1440×900 and 844×390. The Integrity job
attempts this test and the existing Bohemia regression in both Chromium and WebKit,
with Home proof screenshots uploaded even after failure.

The existing long-read preview/import regressions now expect direct started-copy
resume, while retaining unread/cancel/failure/retry/full-text/custom-cover and
cold offline assertions. Local Chromium checks, aggregate tests and final-head
CI results are recorded in the draft PR. Local WebKit installation remains
unavailable after the supported CDN returned HTTP 403; that route was stopped.
Final-head WebKit proof comes from CI. Automated browser checks do not replace
same-head iPhone/iPad WebView verification. User-reported working PDF edge
navigation, pinch dismissal, translation and iPad undo are preserved; this patch
does not change those implementations.

Local checks passed: all five actual-source regressions; complete touch/mobile
Chromium Home/Explore and real-PDF regressions; existing long-read preview and
offline/import/custom-cover regressions; existing complete Bohemia restoration,
lifecycle, font and cold-image regression; aggregate `npm test`; `ios:sync`;
source/www/iOS equality; release configuration checks; RSS OFF and `git diff --check`.
Both-engine exact-head CI remains required; no merge or publication was performed.

## Authorized TestFlight preparation

App and Share Extension Debug/Release are configured as 1.7(235), with matching
release validator, archive paths and upload checks. Main/remote repository base
remains 1.7(234); no new release build was started here. This executor has no
App Store Connect/Xcode Cloud inventory tool, so the parent must confirm build235
is unused before its cloud run. Assets are regenerated through `ios:sync`; this
is preparation, not an archive, signing operation or successful TestFlight upload.

No migration or deployment is needed: the fixes use existing per-book positions
and library identity. Existing local copies and reading anchors stay intact.
RSS remains OFF. App Store1.7 replacement/resubmission requires the user’s later
approval, and the current234 review and automatic-release setting are untouched.
