# Approved study-set follow-up: 1.9.3 (267)

The user approved the final light/dark header icon crops and explicitly approved
continuing to the next internal TestFlight candidate. The parent browser operator
confirmed Apple's Next Build Number is 267 and existing 266 is Testing. Integrate
PR153 source `d2c29b2df752cda43cd033d8906fe0efd9135656` into
`integrate/breeze-193-cloud`; do not merge main. Parent owns one Cloud start.

Build267 pins the entire approved PR153 tree, including review captures and
source hashes, on top of historical266 `e9dc1f6986e1d73f1fd5df1aea9c50ad3723cae4`.
Only four release files receive the exact 266-to-267 counter delta and a floor
rejecting existing TestFlight266 or lower. All four app/extension Debug/Release
settings remain version1.9.3 and build267. Three existing CI runners select the
new candidate verifier. No arbitrary source, RSS deployment, auth change or
security change is permitted.

Historical266 receipt, recorder, verifier and decision are unchanged. They run
unchanged in a detached historical checkout, including original negative tests
and historical192/191 verification. The new receipt derives expectations from
immutable Git source, rather than blessing current bytes. It permits only the
listed new evidence files, exact release changes and verifier selection. Negative
tests reject altered reviewed source, changed historical receipt, altered
candidate evidence, extra paths, executable mode drift and symlink receipts.

The candidate boundary runs on checked-in build267 before Apple's post-clone
counter mutation. It remains outside npm test, as the historical boundary did;
the macOS CI hook smoke uses a synthetic900 counter in a disposable checkout.
The counter verifier validates all four checked-in settings before any rewrite,
rejects existing266 and malformed counters, and preserves everything else.
Source hashes and generated web/native assets must match before the parent
starts the exact candidate SHA. No archive/upload is started by this preparation.

Local preparation checks passed: full npm test and type checks (existing32
diagnostics unchanged), candidate/historical boundaries and negative tests,
iOS sync, native package and native service-worker checks. All232 packaged web
files match the native public bundle and corresponding source bytes. Trusted
Chromium touchscreen checks pass. The actual Apple archive/signing/upload is
not run here; exact candidate GitHub CI and parent's single Cloud run remain
required. Local WebKit installation is unavailable because browser-download
domains returned403, so no local WebKit execution is claimed.
