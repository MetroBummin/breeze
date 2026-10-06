# RSS cover loading shimmer after 1.8 (239)

Base: main `7a5e0c25f2b87791dad6687719e4fb3eb4585c1a` (PR #101).
Tested RSS source SHA-256: `edfc072173b7dfd76030832380db5e6ae5b35422331fe1a57a60ba52c08c69de`.

The user requested the existing shimmer while finding a cover. An admitted
visible metadata lookup and actual image loading/decoding now own
`rss-cover-pending`, independently of card interaction. Known metadata opens
Preview immediately. No-photo, error, cancellation and existing timeouts return
to the existing artwork; never-attempted, offscreen, budget-ineligible and
negative-cache cards do not shimmer. Decoded photographs retain priority.

The two-lookups-per-discovery-generation budget, serial/coalesced requests,
24-hour positive/30-minute negative metadata cache, 128 KiB retained prefix,
existing image fallback transport, Smart Crop and selected-only body preparation
remain in place. Same-URL refresh retains a pending or decoded image. Replacement
and view exit cancel pending presentation and prevent a late image from painting.

## Browser evidence

[Exact-source receipts](rss-cover-shimmer-20261006.json) record 17 Chromium
scenarios on the real app/DOM/IndexedDB with synthetic feeds, images and streamed
relay JSON. No live publisher, API key, server mutation, paid request or Jev run
is used. Lookup/request limits have the same measurement qualifications as
[the previous cover QA](rss-visible-covers-20261005.md).

| Scenario | Result |
| --- | --- |
| Cold/warm/offscreen/global budget | Two serial visible lookups; same-URL warm refresh/reload adds none; unattempted cards stay usable artwork |
| Supplied photo/alternate metadata | Supplied photo priority, OG/Twitter/first-image lookup, late-prefix fallback and cache/security rules preserved |
| Metadata to image decode | Pending starts only when admitted; persists through real image loading; ends when decoded |
| Repeated refresh during image load | Same DOM/image retained; no duplicate image load or same-URL metadata lookup |
| Empty/error/timeout/image failure/decode timeout | Pending ends to artwork; cards remain keyboard/tap accessible; negative-cache refresh adds no lookup |
| Cancellation/rotation/scroll/navigation | Aborted or abort-insensitive late completions cannot paint/cache obsolete metadata; pending image navigation also ends |
| Known-metadata Preview during pending image | Sheet opens synchronously with title/source; cover pending does not block entry |
| Light/dark/geometry/reduced motion | Same smoke/graphite material; no card size change; reduced motion disables shimmer |

Light/dark were checked at 390×844, 820×1024, 1440×900, 320×568 and 844×390.
The matrix explicitly stages the existing pending CSS state for consistent
captures; the light lookup capture below is taken during an actual delayed lookup.
The image timeout fixture holds browser decode and accelerates only the existing
4-second image and 15-second metadata timers. It does not change product budgets.

![Actual cover lookup pending in light mode](artifacts/rss-cover-shimmer-20261006/lookup-pending-light.png)
![Existing pending material in dark mode](artifacts/rss-cover-shimmer-20261006/pending-dark.png)
![Decoded fixture photographs replace the shimmer](artifacts/rss-cover-shimmer-20261006/decoded-photos.png)

## Validation and release boundary

- Added Node regression cases cover admission/terminal release, negative and
  ineligible/budget/offline states, cancellation and stale-owner handoff.
- Chromium RSS card/tap, supplied-cover mapping/failure/hotlink, visible-cover
  and current-only enrichment comparison checks pass.
- Full `npm test`, typecheck and `npm run ios:sync` run for this change; source,
  generated `www` and Capacitor public RSS/CSS/index bytes match.
- Marketing version remains 1.8. The checked-in build baseline and existing
  Cloud build-number override are unchanged; 240 is not hardcoded.
- Local WebKit download is blocked by HTTP 403 from all Playwright download
  hosts. The existing Integrity browser job runs the extended checks in both
  Chromium and WebKit and uploads its receipts/screenshots.

PR #102 Apple automation remains separate and unmerged. This change does not
merge, archive, upload or request an Apple build. Native device/WKWebView remains
a parent release-review step.
