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
2. **Solo profile, requiring explicit security approval:** configure GitHub's
   `apple-release` environment with Selected branches and tags → **Branch `main`
   only**, environment secrets, and **no required deployment reviewers**. Requiring
   the sole operator `MetroBummin` to review with self-review prevented deadlocks;
   allowing self-review still adds a prompt each run. A team can choose reviewers,
   accepting those recurring approvals. This PR changes no live setting. If the
   plan cannot enforce environment secrets/main-only access, keep it disabled.
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

The solo tradeoff is explicit: the account, connected GitHub credential and everyone
able to change main/workflows are trusted with release authority and environment
secrets. Actor/diff checks limit this workflow; they cannot constrain someone who
can replace it on main. Preserve the existing main policy and limit its writers;
do not silently weaken branch protection to make a request work. One-time key setup
removes recurring Apple sign-ins, not the need for the user's exact release instruction.

## Smoke, exact manifest and operations

After review/merge: **Apple release → Run workflow → main → smoke** runs mock tests
and a pre-secret gate without Apple calls. Manual mode defaults to GET-only `status`;
missing release inputs fail before credentials. The connector exposes file creation,
but neither dispatch nor tag creation: the request path below supports it. No release
requests are included here or created during today's independently handled release.

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

## Connector-compatible request-only main push

After setup, use the user's specific instruction naming the operation, app, source
commit, version/build, What's New and publication choice to review the manifest.
It must already be on main. Then append **one new file only** at
`releases/apple/requests/<request_id>.json`, as `MetroBummin`. Example GET-only setup
check (`manifestSha256` must be replaced with the exact lowercase file hash):

```json
{
  "schemaVersion": 1,
  "requestId": "status-candidate",
  "mode": "status",
  "releaseId": "candidate",
  "manifestSha256": "REPLACE-WITH-EXACT-64-CHARACTER-SHA256",
  "requestedBy": "MetroBummin",
  "confirmation": ""
}
```

Omitted mode defaults to `status`. `prepare`/`submit` require that explicit mode,
`confirmation=<mode>:<release_id>:<hash>`, and the matching manifest authority/expiry.
`requestedBy` records the operator; it is not proof of a chat instruction. The caller
must create the record only after that specific instruction, never from routine
code pushes or a standing blanket deployment grant. JSON is parsed as data: no
commands, URLs, code paths or arbitrary arguments are accepted.

Only `main` pushes matching `releases/apple/requests/*.json` trigger. Before secrets,
the gate checks the complete Git before/after diff: exactly one added request,
no code/manifest edits, request ID/path match, exact manifest hash, authenticated
actor/sender/rerun actor `MetroBummin`, and exact current main. It checks real Git
history, not potentially truncated webhook file lists. Requests and manifests must
be regular committed files; symlinks fail. Forced/deleted/new-branch pushes, modified
records, multiple requests, stale refs and unknown fields fail closed. Tags and PRs
cannot trigger. Writes cannot rerun: inspect status and authorize a fresh request.

The connector's file-create action can append the record if the existing main policy
allows it; a request-only PR merge by the same operator also works. Its actual push
principal and ability to start Actions still need a GET-only setup test. GitHub
suppresses push runs produced by a workflow's `GITHUB_TOKEN`; this design adds no
token or service to bypass that. If the connector cannot commit under the allowed
principal/policy, manual main dispatch remains the exact fallback.

Request-only main commits may also match existing Xcode Cloud start conditions or
other main CI. This workflow never starts a Cloud run, but avoidance of redundant
Cloud builds is **unverified until those start conditions are inspected**. Do not
enable this route when it would duplicate builds without separate workflow setup;
manual dispatch avoids a source push. No Cloud settings are changed here.

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

GitHub sources: [environment configuration](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments),
[branch/path filters](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax#onpushpull_requestpull_request_targetpathspaths-ignore),
[token-trigger limits](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

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
