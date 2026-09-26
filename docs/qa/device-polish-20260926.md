# Device validation follow-up — 2026-09-26

## Findings and changes

- PDF PR #27 was a query-flagged, mock-state design. Production continued to show the old top toolbar. The bottom pill now calls the existing engine for read/pen/eraser, color, width and undo/redo, behind the native iPad flag. Reading locks edits; writing hides progress. Collapsing Reader chrome retains editing and shows a mini tool control. Serialized ink storage and native input routing are unchanged.
- Preview explicitly focused Close and used a blue focus-visible outline; Home cards also used blue outlines. Pointer modality suppresses sticky WebKit outlines without blurring controls. Keyboard focus remains visible and neutral. Preview now initially focuses its labeled dialog.
- Korean summary has a neutral card, loading shimmer, a short reveal, and reduced-motion support. Read uses the shared neutral action token.
- Deployed article-preview v4 logs showed four unsupported_number errors after its release, including the user's current testing period. All v4 generator errors in the queried window were this category. The client previously flattened these into generic service-unavailable copy. The validator now compares numeric quantities across separators, English counts, abbreviated months and Korean scale units; unsupported quantities still fail. Numeric/JSON failure gets at most one fresh repair within one 12-second deadline and quota charge. Other errors do not automatically retry. Failed metadata is not cached.
- Reader notices now yield to PDF writing controls. Sentence-loading UI also hides editing controls while it owns the pill.

## Verification

- npm test passed, including core storage, sync, gestures, dictionary, EPUB and Reader contracts. Type findings decreased from the existing 37 to 35.
- Article preview server: 17 tests passed, including valid numeric conversions, fabricated amount rejection, repair cap and upstream non-retry.
- Preview browser: Chromium/WebKit at 320/390/820/1280 widths; cache, failure and Reader entry passed.
- Preview resilience: 40 passed. Save intent: 20 passed, including no persistence on preview dismissal.
- PDF ink browser: both engines passed colors/widths, history, reload persistence, erasure, quota failure/retry, coordinate/zoom alignment and synthetic contact ownership. Production mode entry requires no query flag.
- Device polish browser: both engines passed touch/keyboard focus, neutral light/dark preview, summary states, real PDF pill mode changes, narrow iPad split-view reachability and notice ownership. Persistent WebKit profiles are used for PDF Blob storage, as in the existing ink suite.
- Home UI, ingestion and PDF glyph/highlight geometry suites passed.
- Live generator: 11 of 12 public article samples generated; one hit the total timeout. This does not establish universal availability or factual validation of all summaries.
- article-preview v5 deployed. Three public articles generated with HTTP 200 and shared persistence; each repeated request returned HTTP 200 with cached=true (six successful requests).
- App Store Connect upload succeeded. Xcode discovered existing build 166 and managed the export to 1.4 (167); its terminal result confirmed uploaded package processing. Source archive remains 166; next source build is reserved as 168.
- iOS sync completed; 112 source/www/native files matched. Archive 1.4 (166) has the same 112 assets, valid signature, bundle kr.io.breeze.app and no embedded Share Extension.

## Verification boundaries

- Fresh physical iPad/Pencil writing, palm handling and inertia were not performed in this run. Browser synthetic events and archive success are not device proof.
- Long Reader notification text at 320px clips in WebKit. The identical test fails on untouched main eac4826 as well; this pre-existing layout issue is outside the bottom writing controls and remains open.
- tests/verify-integrity-browser.mjs is absent in this checkout (the CI workflow conditionally skips it). No pass is claimed for that nonexistent suite.
