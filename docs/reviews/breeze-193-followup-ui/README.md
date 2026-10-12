# 1.9.3 follow-up UI and control review

Actual Chromium151 production UI, synthetic vocabulary/books, DPR2. These are
browser previews, not native screenshots. Existing private Safari photos are not
published or directly inspected here. The earlier documented reference ratios
ground target/capsule proportions; Apple SF Symbols guidance grounds optical
weight/contextual-scale decisions, not an exact numeric Safari glyph claim.

| Family | 269 actual stroke | Candidate actual stroke |
|---|---:|---:|
| General20px toolbar | 1.67px | 2px |
| Set directory/action20px | 1.5px | 2px |
| Back32px (all app roles) | 3.07px | 2px |
| PDF page/sidebar24px | 3.07px | 2px |
| Reader mode24px | 2.3px | 2px |
| Filled ellipsis dot diameter | 2.67px | 2px |
| Small inline/disclosure | context-dependent | 1.4px /1.2px |

`icon-before.json` captures the storage-integrated UI before the expanded icon
change (Reader already2px); `icon-after.json` contains170 scenes across five
viewports/both themes.46 paired phone button width/height comparisons show no
touch-box changes. `reader-guide-metrics.json` verifies actual painted2px Reader,
PDF sidebar (including selected fill), writing-tool controls and study Back,
plus read-only All Words and passive onboarding on phone/iPad/short in both
themes. Invisible alternate-mode paths are recorded but do not count as painted
icons. Existing lookup inline scales, logo, cover artwork, stars and large guide
illustrations retain their distinct roles. Apple assets were not extracted.

Selected raw before/after and changed-view screenshots are included. The passive
clips/posters in `assets/onboarding/study-{light,dark}.*` were recaptured from the
actual latest learning UI, including awaited durable grade completion. Existing
examples remain verbatim with safe occurrence-aware bold text; meanings are
hidden on the front. Next requires no practice.

Storage migration is separately documented in `docs/qa/study-quota-20261012/`.
Its integrated real-quota/abort/retry/reload/navigation checks passed Chromium.
Local WebKit remains unavailable; final exact-head CI must run it. No browser
proof establishes native playback, actual airplane mode, physical retry tap,
56-page native restart or iPad Pencil/palm interaction.269 stays frozen.

Library saving was attempted with the current supported batch flow but failed
before preparation due to its network connection; no new Library IDs were returned.
