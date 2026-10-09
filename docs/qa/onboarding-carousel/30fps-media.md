# Approved onboarding media quality refresh

Base: `2dec555656eed5068d47173be03311c02683bc46`, runtime `a342409` /1.9(252).
Independent branch `media/onboarding-2x-30fps` at `/tmp/breeze-onboarding-all-30fps`.
The user approved the first Word/chevron 2x30fps sample with “ㅇㅋ 낫배드” and
“이렇게가자”, authorizing this full media-only refresh.

The 14 existing MP4 paths and14 matching JPEG paths are replaced. UI source,
layout, captions, page order, welcome handwriting, original OpenStax source page,
auth, Reader/Memory ownership and native/version metadata are byte-identical to base.
Only capture tooling and related quality/provenance documentation accompany assets.

| Scene | Encoded pixels | Frames/theme | Duration/theme | MP4 bytes light / dark |
| --- | --- | --- | --- | --- |
| word | 732×400 | 105 | 3.5s | 269,136 / 239,166 |
| details | 748×900 | 105 | 3.5s | 234,666 / 214,021 |
| sentence | 732×800 | 135 | 4.5s | 344,183 / 267,204 |
| easy | 732×800 | 135 | 4.5s | 367,989 / 294,674 |
| settings | 780×1280 | 105 | 3.5s | 337,022 / 260,901 |
| pdf | 820×1180 | 120 | 4.0s | 905,369 / 906,762 |
| memory | 780×1280 | 105 | 3.5s | 274,335 / 276,317 |

All clips are H264 Baseline/avc1, silent,30fps, with `moov` before `mdat` for
fast-start playback. Phone captures retain the same390×640 CSS viewport/crops
at deviceScaleFactor2. PDF retains820×1180 CSS geometry and is encoded directly
at820×1180 instead of downsampling to410×590. Thus every MP4 doubles its old
encoded width/height without upscaling an old raster frame. Posters match the
new encoded dimensions and use JPEG quality95. The old PDF poster already had
820×1180 pixels; its dimensions are retained while it is newly captured.

## Real frame generation and validation

`tools/capture-onboarding-30fps.mjs` uses real production controls and the same
authored sentence/meaning/translation/easy-answer fixtures. It moves the JS clock
at1/30s steps and samples actual CSS/WAAPI animations at their corresponding
times. Pen strokes are sent through the production PDF ink owner once per source
frame. Source PNGs are newly rendered at native requested pixel dimensions; no
existing MP4 is read, no old11fps frame is enlarged/repeated, and no fps filter
invents intermediate motion. Screenshot wall time does not dictate film time.

`tools/encode-onboarding-frames.swift` asserts source image dimensions, consumes
each PNG exactly once and appends it at CMTime(index,30). Target bitrate is5Mbps
(8Mbps PDF); actual bitrate is lower during still holds. AVAssetReader fully
decoded all1,620 media frames. Every adjacent encoded PTS is1/30s, every clip has
its expected dimensions/frame count/duration, and fast-start atom order is checked.

Source pixel hashes distinguish still holds from motion. Contact movement, native
panel morph, translation reveal, easy expansion and24 consecutive pen movement
steps have zero repeated adjacent frames in both themes. Static holds are
intentionally identical; a still image need not change30times per second. A few
registered invisible/finished animation samples also have identical pixels, as
recorded explicitly in `capture-receipt.json`, without disguising them as motion.
Every clip's first/last source pixel arrays are exactly equal (MAE0), giving a
static matching loop boundary after its normal close/reset action.

The current actual onboarding player was tested with all14 newly shipped sources,
unchanged UI and native-iPad capability emulated only to expose its PDF lesson.
Each clip loops twice with one active source, no page errors and no presented
mediaTime gap above1/30s. The first measurement sought to0 while already playing
and counted a single discarded frame for memory-light and easy-dark. These raw
observations are retained. Easy-dark recheck:0. Memory-light pause→await seeked
diagnostic:0 throughout all per-callback decoder counters and two loops. This
separates explicit seek initialization from ordinary loop playback.

Unmodified `tests/verify-onboarding-browser.mjs` passed on Chromium and WebKit: 
welcome timing, gestures/lifetime/navigation/completion, responsive light/dark
phone/tablet/desktop/short layouts, poster-only reduced motion, autoplay fallback,
background pause/resume, source ownership and Reader data isolation. No tests
were weakened or skipped. Actual decoded frames and current-player screenshots
were visually inspected; English/Korean, mini-pill/chevron, native controls and
OpenStax page14/footer remain readable and within their intended crops.

## Sizes and provenance

Media total:952,362 →6,524,958bytes; +5,572,596bytes (6.851×).
`build-www` copy remains226files:16,652,705 →22,225,301bytes; +5,572,596bytes.
Normalized ZIP:13,704,778 →18,404,717bytes; +4,699,939bytes. These are web asset
measurements, not IPA/AAB/TestFlight download sizes. Encoder temporary sibling
staging files were removed and excluded from source/package.

PDF input is the unchanged39,957-byte one-page excerpt, SHA256
`94c0eb634676c1769ee73afafc0298827b33933a0f2afaa512a4c622df2db259`, extracted
from original OpenStax SHA256
`9a4c00306a07b9d39b049c54a3eedeb321582166c1484c2005661f254007b1b8`.
PDF page28 / printed page14, “Words and Images,” and
“Access for free at openstax.org.” remain. Input PDFs are temporary capture-only
files and are not bundled. Attribution/license are in `pdf-media-credits.md`.

## Handoff and limits

Full 2x30fps preview shows the unchanged real carousel: light welcome animation
→seven scenes→Home, then dark static replay welcome→seven scenes→Home.
Raw PNGs/decoded frames/player logs and reproducible preview tools are preserved
in `/Users/kosangbum/Documents/Codex/2026-10-08/task-9/all-proof`.

This patch does not push PR132, change its integration hash receipt, build/upload
a native archive, deploy or merge main. The release owner must integrate the
media commit and update the authorized asset hashes in its integration receipt
before exact-head release validation. Physical TestFlight/Pencil playback remains
unverified; desktop headless tests do not guarantee any particular device fps.
