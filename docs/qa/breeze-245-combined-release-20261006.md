# Breeze 245 combined release

## Authorized scope and single-release boundary

The October 6 instruction authorizes deploying the dictionary correction,
combining the pending fixes, merging once, and producing the next Xcode Cloud /
TestFlight build, expected to be 245 after the user's confirmed 244. It does not
authorize App Review submission. Password-login removal was deferred and is not
included. Android signing/Play submission remain separate from this iOS release.

The release branch extends PR #116 after its four pending test/document fixes
were published at `40b9ca9b06fac37bf9eac1a97abc693ff7f04348`. It incorporates
the green word-recovery PR #117 at `e8aa78f0766ccacfd03b6a31d145e4f436df28c8`.
Earlier component PRs must not be merged individually. A single final main merge
is the intended Xcode Cloud trigger, avoiding extra Apple builds.

## Included changes and preserved behavior

- PDF tap feedback, final Android pointer-pen handling and its native-iPad gate
  regression coverage, email-code form recovery, and the Android build shell
  remain from #116. The device-polish negative fixture now disables both input
  routes; no successful-input assertion or production behavior was weakened.
- Word validation derives bounded legitimate morphology from the selected token,
  rather than treating old-client candidates as a complete allow-list. Existing
  storage identities, request input/fingerprints, receipt replay and success-only
  quota charging remain unchanged. A stale detail/mini context error no longer
  hides a successful same-occurrence retry.
- Password login remains available. Its earlier email-state/request-ownership
  corrections remain included; the separately deferred removal is excluded.
- Existing PDF observer/no-op/repaint/readiness guards are preserved. RSS remains
  enabled for the existing WIRED pilot with feed IDs `[7]`; configuration is
  unchanged. No quota, schema, secrets, auth, telemetry or RSS server setting is
  changed by this release integration.

## Server-first deployment and compatibility

The deployment owner read back Breeze project `hrtfhojbhqvaoiulspto`, function
`dict`, as ACTIVE version 60. All seven deployed files match #117's exact Git
blobs; `verify_jwt=false` and no import map are preserved. Only `lookup.ts` and
the new shared `modules/lexical/core.js` differ from version 59. The bundle keeps
repository-relative imports and has `ezbr_sha256`:

`dee8b780a903f6e929923d9df8714f89d6060d3bea4840fb774151c33804c175`

A code-only version-59 rollback bundle is retained by the deployment owner.
Older clients keep their existing payloads and benefit from server-side lemma
validation without an app update. Their fingerprints/receipt replay remain
compatible. Deterministic old-client, forged-headword, identity and quota tests
passed; no paid live AI request or user vocabulary mutation is part of proof.

The local cloud shell cannot currently reach the public function, so its timeout
does not count as a passed warm check. The release PR opts into one CI request via
`[verify-dict-warm]`: unauthenticated POST `{"op":"warm"}` to the fixed existing
endpoint. This branch returns before auth/provider/quota/DB work. CI must receive
HTTP 200, `ok:true` and `sentenceEasyExplanation:true`, and retain its timestamped
receipt, before the main merge. Source readback and live initialization are
separate pieces of evidence.

## Final verification gates

1. Verify the complete combined source and final head, preserving the password UI
   and all main/#116 safeguards. Regenerate index/service-worker/landing asset
   fingerprints against that source.
2. Run full npm contracts and the existing typecheck baseline. Sync both native
   platforms and compare shared lexical/dictionary bytes with source. Keep the
   iOS project and existing Cloud post-clone script unchanged.
3. Require the exact combined commit's full Integrity, pointer/native-iPad,
   PDF tap/ownership, word retry, native Android artifact checks and live dict
   warm receipt to pass. Earlier component passes do not replace these gates.
4. Merge the single combined PR only after server and CI gates pass. Verify main
   resolves to the tested tree. Observe that exact main commit's Xcode Cloud run,
   archive and workflow result; do not trigger a second manual build.
5. Verify the actual Cloud numeric build and TestFlight processing/availability
   from available Apple or notification evidence. GitHub archive success alone
   does not establish TestFlight availability. Do not submit App Review.

Checked-in `CURRENT_PROJECT_VERSION=236` is intentional: the verified post-clone
script replaces all four app/extension values with Apple's `CI_BUILD_NUMBER`.
Do not hard-code 245 or change marketing version 1.8 to force the expected counter.

## Device acceptance still required

Synthetic browser tests and native compilation do not establish physical stylus,
palm rejection or native momentum behavior. Preserve the existing Android test
runbook's physical acceptance gates. For the user's confirmed PDF blue-panel case,
tap a word, begin scrolling and keep scrolling on the reproduction device while
checking panel and lookup behavior. Other formats were not reported as tested.
Also verify a previously failing word's actual mini/detail retry on the installed
TestFlight build; deterministic defects do not prove every not-found case has one
cause. Do not alter existing user vocabulary or quota to manufacture a success.
