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
record 24 resident-memory/PSS and duration samples. Framework/model caches and
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

Execution results will be recorded in the PR with the exact tested commit and
artifact links. Initial harness creation is not a claim that either native run
has passed. Physical iPhone/iPad/Android hardware, real user handwriting, stylus
delivery and long-duration memory behavior remain separate acceptance gates.
