# OCR stress evidence for the 1.9.2 candidate

The submitted 1.9.1(257), release boundary policy, main, product versions and
deployment are outside this test change. No original/user PDF, paid API, new
secret, permission grant or release signing is used.

## Corpus and evidence levels

`tests/fixtures/pdf-ocr-stress/manifest.json` records 25 owned synthetic scans,
independently drawn word bounds, and five clean controls (including a blank
page). Fixed PNG bytes make native runs comparable. Cases cover 8–360 pixel font
sizes, three Gaussian blur radii, low contrast, two skews, 90/180/270-degree pixel
rotation, columns, repeated words, dense text, synthetic ink alone/mixed with
print, burned-in ink overlap, scribbles and clipped edges. Synthetic pen paths
are **not** a representative human handwriting dataset.

The native stress workflow runs the production plugin with a test-only bridge
transport. Apple Vision runs on macOS under process-local network denial;
that is actual Vision execution but not iOS-device acceptance. Android runs
the bundled ML Kit plugin on a fresh emulator with airplane mode and wifi/data
disabled before its first OCR call. It does not modify KVM permissions or accept
new SDK licenses; lack of a bootable emulator is a reported execution blocker.

All cases retain raw words, confidence and geometry, plus a score using the
production JavaScript acceptance adapter. Clean controls fail CI if words or
their independently drawn locations are wrong. Difficult-case failures remain
in the report; they are not an asserted general accuracy rate. Repeated calls
initially record 24 resident-memory/PSS and duration samples. The Vision follow-up
uses 96 calls with memory sampled after completion and draining input autorelease
objects, prompted by the increase in the initial run. Framework/model caches and
the test harness are included, so these samples alone cannot prove no leak or
predict physical-device performance.

Browser tests exercise real PDF.js/IndexedDB and controlled native responses.
They establish scheduling, stale-result rejection and input ownership, never
Vision/ML Kit recognition accuracy. Live Breeze ink must be absent from the OCR
raster; ink flattened into the source image is a separate recognition challenge.

## Product acceptance

Reading, scrolling and zoom must remain available during OCR, failure and retry.
An uncertain recognition must not silently become a confidently presented word
meaning. Failure must leave the original readable and permit an explicit retry;
no automatic request storm or delayed lookup from a stale tap is acceptable.
Rapid navigation, repeated taps, pinch/ink, close/reopen, cache eviction, offline
reopen and retained memory are assessed independently of recognition accuracy.

## Initial actual Vision result

Run [37956011050](https://github.com/MetroBummin/breeze/actions/runs/37956011050),
head `9e7642178b9668439967bcdbb2e464bf6cb7277d`, executed the unchanged production
Swift plugin with real macOS Vision under network denial. The five strict
controls passed (26 expected printed words plus a blank page), as did 24 repeated
calls. This does **not** mean every corpus case was accurate. The durable
[scored evidence](evidence/pdf-ocr-vision-9e76421.json) retains all cases and samples.

| Case | Correct expected words | Observed limitation |
| --- | --- | --- |
| 180px / 360px print | 2/2 / 1/1 | Only these synthetic large-word cases |
| 8px print | 0/4 | No words accepted |
| 12px print | 2/4 | `Bright` became `Briaht` at confidence **1.0**; `Quiet` became `uliet` |
| 16px print | 2/4 | `Bright world` became `briont worla` |
| 24px print | 4/4 | No observed mismatch in this case |
| Blur radius 1.5 / 4 / 8 | 4/4 / 4/4 / 0/4 | Severe blur was not readable |
| Skew +7/−13 and pixel rotation 90/180/270 | 4/4 each | Centers matched truth; axis-aligned boxes are approximate |
| Two columns / repeated words / dense print | 12/12 / 8/8 / 120/120 | Occurrence centers matched within 1% page tolerance |
| Synthetic ink only | 2/2 | Hand-authored vector `READ BOOK`, not human handwriting acceptance |
| Mixed print + synthetic ink | 4/5 | Ink `BOOK` was omitted |
| Flattened ink overlap | 4/4 | Only this owned overlap pattern |
| Scribbles without words | 0 accepted | No observed false word in this pattern |
| Clipped edges | 0/2 | Incomplete `wor` accepted |

Repeated-call process RSS ranged from 184,893,440 to 206,192,640 bytes; first/last
samples were 190,562,304 / 198,115,328 bytes. These are measured **macOS test
process** samples, including models, active autorelease objects and the harness.
The observed increase is not evidence of a stable long-run plateau or a proven
leak. It is not an iPhone memory estimate or acceptance result.

ML Kit compiled in that run but did not execute: the emulator process exited
during startup, before instrumentation. Its first harness did not print the
redirected emulator log, so the precise startup reason is not established by
that run. The next attempt reports acceleration and startup logs and uses only
already accessible acceleration; no KVM permission/ACL change is permitted.

The diagnostic run [37959210009](https://github.com/MetroBummin/breeze/actions/runs/37959210009)
at `e7351c5488e77d61714667b906fb6c78aad20e43` again passed Vision but failed before
ML Kit execution. Its log identifies a mismatched AVD search path (`Unknown AVD
name`, missing `.ini`) as the immediate exit cause, plus inaccessible KVM as a
separate constraint. The harness now supplies an explicit shared `ANDROID_AVD_HOME`
and AVD data path and checks discovery before boot. It uses bounded software
emulation when existing KVM access is unavailable, without changing permissions.

## Product fixes prompted by stress

- Missing, nonfinite or out-of-range confidence and rectangles that clamp to
  zero area no longer become lookup words. A failing regression preceded the fix.
- Confidence is not treated as proof of spelling. Every OCR word requires a
  nonmodal spelling check before the existing lookup, including cached meanings.
  Repeated source taps do not confirm. Original reading and zoom stay available;
  source changes invalidate the prompt/action. OCR does not enable sentence lookup.
- The existing explicit tap retry after a native failure remains; unreadable
  pages remain readable originals. No cloud fallback or spelling fabrication is
  introduced. Returning to the original dismisses the spelling prompt.

Final browser/native results and exact head are recorded in the PR. Browser
stress uses native doubles and locally fulfilled bundled assets for offline
reopening, not a claim about web/PWA offline support or model accuracy. Physical
iPhone/iPad/Android hardware, real user handwriting, stylus delivery and
long-duration memory behavior remain separate acceptance gates.
