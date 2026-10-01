# Reader continuity and sidebar proportions — build 210

Base: main `0bf3928`, source version 1.6 (209). The user requested the latest
main, Apple Music-like Home capsule continuity, correct recent-book identity,
right-hand PDF bookmarks, matching EPUB navigation, and Apple Preview-like
thumbnail proportions. Source app and share-extension build numbers are 210.

## Changes

- Persist one local resume book ID independently of cloud progress timestamps.
  Reopening without scrolling selects that book; deleted targets fall back to
  saved reading history and transient onboarding never replaces the target.
- Retain lexical paint across unchanged Home round trips. No text retokenization
  or PDF/EPUB saved-marker refresh runs when the visible mode and saved-word
  presentation are unchanged. Changed vocabulary still refreshes the target.
- Keep capsule snapshot contents at intrinsic size while the rounded surface
  moves, with a gentler initial velocity and eased 480/440ms opening/closing.
- Align PDF bookmark targets to paper's upper-right edge. EPUB uses the same
  right-aligned collapse control and existing shared sidebar entrance/exit.
- Slice continuous EPUB chapters into 1:sqrt(2) navigation pages that fill the
  strip width with an 8px allowance, a 12px page-number line and an 8px gap.
  Source reading layout stays untouched; preview selection uses those slices.
- Present the sidebar before creating EPUB preview documents, then admit one
  nearby preview per frame. Session/generation ownership cancels stale work.

## Verification

Chromium and WebKit: Home UI (including slow opens, cancellation, failure and
reduced motion), retained Text/PDF/EPUB identity and scroll, saved-word changes,
PDF navigation/bookmarks/deletion/direction, Reader chrome motion/reversal,
Reader work/sidebar reuse, and design-tone checks. EPUB ratio/width assertions
and screenshots cover 320/390/820/1440px and short landscape, both themes.

`npm test`, unchanged 34-diagnostic typecheck baseline, Capacitor iOS sync and
`git diff --check` pass. The Reader work test now lets viewport restoration settle
before admitting a synthetic sentence request; restoration correctly closes
stale lookup state and previously raced that request in Chromium.

The separate long-notice geometry assertion at
`tests/verify-reader-notifications-browser.mjs:108` fails in this Linux Chromium
on both untouched base `0bf3928` and this branch. Its existing two-line geometry
is outside these changes; this is not reported as a passing suite.

Browser results prove state, geometry, invalidation and eliminated work, not
physical-iPhone frame pacing. Xcode Cloud archive/distribution status must be
reported from the run on the merged commit, separately from local validation.
