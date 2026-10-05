# Apple release automation setup

Code only: Xcode Cloud continues building, signing and uploading. This workflow
uses an existing Cloud build to prepare the exact App Store version, What's New
and build selection, then optionally submit for review. It never starts/uploads
builds, manages TestFlight groups, changes product numbering or publishes a held
approved version. No active release manifest or credentials are included.

## One-time secure setup (separate user approval)

1. Confirm ASC API access; the Account Holder requests it if needed. Full release
   operations require **App Manager** or higher; Developer alone cannot submit.
   Prefer an **individual key** for an App Manager user limited to Breeze: it
   inherits that user's app access/role. An Account Holder's individual key remains
   broad. The fallback **team App Manager key** covers all apps and cannot be
   app-scoped. Do not assume an existing key.
2. Before storing keys, configure GitHub's `apple-release` environment with required
   reviewers, no self-review/bypass where available, and deployments limited to
   `main`. If the GitHub plan cannot enforce these protections, leave automation
   disabled and retain the existing release process.
3. Store **environment secrets only**: `ASC_PRIVATE_KEY` (downloaded `.p8` text),
   `ASC_KEY_ID`, and `ASC_ISSUER_ID` for team keys only. Individual keys must omit
   issuer ID. Never put credentials in chat, committed files, repository-wide
   secrets, logs or artifacts.
4. Set repository variable `ASC_APP_ID` to Breeze's numeric app ID. Set environment
   variables `ASC_KEY_TYPE=individual` (or `team`) and `ASC_RELEASE_ENABLED=true`
   after secure setup. Keep `ASC_WRITES_ENABLED` unset until current schema
   verification and the GET-only status check below pass with explicit approval.

The `.p8` itself does not expire. Each request gets a fresh five-minute ES256 JWT:
team `iss`, individual `sub=user`, audience `appstoreconnect-v1`. Nothing prints or
persists keys/JWTs. Revocation, changed permissions/contracts/membership or Xcode
Cloud repository/signing access can still require user action.

## Smoke, exact manifest and operations

After review/merge: **Apple release → Run workflow → main → smoke** runs mock tests
and a pre-secret gate without Apple calls. The connector exposes neither dispatch
nor tag creation; an authorized Git client can request this same secret-free check
with the lightweight tag `apple-release/smoke` on exact current main. Do not create
release tags during today's independently handled release.

Merge a reviewed `releases/apple/<release_id>.json`. Example with fictitious IDs
and expired read-only authorization:

```json
{
  "schemaVersion": 1,
  "releaseId": "candidate",
  "appId": "1234567890",
  "bundleId": "kr.io.breeze.app",
  "version": "1.8",
  "buildId": "EXACT-ASC-BUILD-ID",
  "buildNumber": "237",
  "ciBuildRunId": "EXACT-CLOUD-RUN-ID",
  "expectedCommit": "7a5e0c25f2b87791dad6687719e4fb3eb4585c1a",
  "releaseType": "MANUAL",
  "whatsNew": {"ko": "사용자가 검토한 변경 사항"},
  "authorization": {"operation": "none", "expiresAt": "2026-10-05T00:00:00Z"}
}
```

Use a successful non-PR Cloud run's source commit (an ancestor of main), the exact
uploaded build ID and actual Cloud build number. No latest-build guessing or
increments. `include=app,preReleaseVersion` requests explicit build linkage;
missing linkage fails closed. Audience must be `APP_STORE_ELIGIBLE`:
`INTERNAL_ONLY`, missing or unknown audience cannot alter metadata or submit.

Compute `sha256sum releases/apple/<release_id>.json`. Manual runs target main and
provide mode/ID/hash. `status`/`dry-run` use GET only and verify future key access,
provenance and readiness. `prepare`/`submit` require matching authorization operation,
UTC expiry within 24 hours (rechecked before each write), plus confirmation
`<mode>:<release_id>:<hash>`. Only listed locales' What's New changes; other required
metadata must already be complete. `MANUAL` holds approval for manual publication;
`AFTER_APPROVAL` explicitly authorizes availability after Apple's approval.

## Optional bounded release refs

After separately approved security setup, release operators using authorized Git
(or a future tag-capable connector) can create a lightweight tag
`apple-release/<status|dry-run|prepare|submit>/<release_id>/<64-character-hash>`
on **exact current main**, with the manifest already reviewed there. Updates,
deletions, annotated tags, stale main, wrong hashes and expired/mismatched authority
fail before secrets. Ordinary PR/development pushes cannot run this workflow.

Before permitting these tags in the environment, enforce an `apple-release/**`
tag ruleset restricting creation to release operators and prohibiting updates/
deletion. Keep required environment review; reviewers must verify the tag targets
reviewed main and inspect the exact manifest/build/publication choice. A push
workflow comes from its triggering ref: script checks cannot protect against an
untrusted replacement workflow. Without these external protections, retain
manual-main-only setup. This PR configures none of these controls.

## State handling, evidence and remaining blockers

Global concurrency serializes requests without cancelling in-flight runs. Matching
metadata is left alone; only an unsubmitted matching single-item draft resumes.
Item API states are `READY_FOR_REVIEW`, `ACCEPTED`, `APPROVED`, `REJECTED`, `REMOVED`;
`IN_REVIEW` belongs to the submission enum. Allowlisted active submission/item pairs
report `already-submitted`; `COMPLETE` plus `APPROVED` reports `review-complete`,
which does not imply publication. `COMPLETE` plus `ACCEPTED` requires reconciliation:
an accepted item can still be held by unresolved items. A timestamp
alone never proves success. GET modes expose `action-required` for unresolved
issues, rejection/removal, cancellation or inconsistent state; writes stop. Unknown
states fail closed. Rejected versions/items are never automatically edited or
resubmitted. Resolve them separately in ASC with fresh authority. Unrelated/empty
drafts and extra items require reconciliation. Writes are never retried; after a
timeout inspect ASC/status because a partial write may have succeeded. Coordinate
with other release clients, which can still race with this workflow.

Official sources checked on 2026-10-05:
[key access/roles](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/),
[JWT](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests),
[submission requirements](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/),
[unresolved issues](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/manage-a-submission-with-unresolved-issues/),
[Cloud run](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-cibuildruns-_id_),
[run builds](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-cibuildruns-_id_-builds),
[build include](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_),
[audience](https://developer.apple.com/documentation/appstoreconnectapi/buildaudiencetype),
[localization](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appstoreversionlocalizations-_id_),
[selection](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appstoreversions-_id_-relationships-build),
[submission](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-reviewsubmissions),
[item](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-reviewsubmissionitems),
[item states](https://developer.apple.com/documentation/appstoreconnectapi/reviewsubmissionitem/attributes-data.dictionary?changes=_4_8),
[status meanings](https://developer.apple.com/help/app-store-connect/reference/app-information/app-and-submission-statuses),
[submit](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-reviewsubmissions-_id_),
[beta-group access](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-builds-_id_-relationships-betagroups)
(available in ASC, outside this workflow).

Apple's detailed schema pages rendered JavaScript shells; Markdown/OpenAPI downloads
were blocked. Full current schema verification remains a **pre-write blocker**,
including include/linkage response shape, audience and review/item state transitions.
The item enum above follows the official Attributes source supplied in review;
the full source could not be independently retrieved here. Mock tests distinguish
sparse defaults from explicit includes and exercise conservative state classification;
they do not prove Apple's acceptance. Verify current OpenAPI, run GET-only status,
then separately approve `ASC_WRITES_ENABLED=true`. No live Apple endpoint, secret,
secure setup or end-to-end release was exercised here.

Run `node --test tests/verify-apple-release.mjs` (also in `npm test`). Node built-ins
only; Actions and Node are pinned, GITHUB_TOKEN is `contents: read`, checkout
credentials are discarded, and no dependencies install in the credential job.
