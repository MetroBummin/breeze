# Apple release automation setup

This PR adds code only. Xcode Cloud continues to build, sign and upload. GitHub
Actions inspects an **existing** Cloud build, prepares an exact App Store version,
What's New localizations and build selection, and optionally submits that version
for review. It never starts builds, uploads binaries, invites testers, changes
signing, or publishes an already approved version. No product version is changed.

## One-time secure setup (user-owned; not performed by this PR)

1. Confirm App Store Connect API access. If unavailable, the Account Holder must
   request it. For full release operations, use **App Manager** (or an existing
   higher role). Developer access alone does not authorize submission.
2. Prefer an **individual key** for an App Manager user whose app access is limited
   to Breeze. It inherits that user's role/app access; an Account Holder's individual
   key still has broad access. Individual keys cannot use provisioning endpoints,
   which this script does not need. A **team key** with App Manager is the fallback;
   team keys access all apps and cannot be app-scoped. Do not assume a key exists.
3. Before storing any key, separately configure the GitHub `apple-release`
   environment with required reviewers, prevent self-review/bypass where available,
   and permit only `main` initially. Store keys **only as environment secrets**:
   `ASC_PRIVATE_KEY` (the downloaded `.p8` text), `ASC_KEY_ID`, and for team keys only
   `ASC_ISSUER_ID`. Never put them in chat, files, manifests, repository-wide secrets,
   logs or artifacts. Individual keys must leave `ASC_ISSUER_ID` unset.
4. Set repository variable `ASC_APP_ID` to Breeze's numeric ASC app ID; set environment
   variables `ASC_KEY_TYPE=individual` (or `team`) and `ASC_RELEASE_ENABLED=true`
   **only after** the protections and key have been securely configured. Leave
   `ASC_WRITES_ENABLED` unset for GET-only setup. No setup
   or permissions are changed by this PR. Environment support depends on the
   repository's GitHub plan; if protections are unavailable, leave Apple operations
   disabled and use the existing release process.

The `.p8` key itself does not expire. The script signs a fresh five-minute ES256 JWT
for every request (team: `iss`; individual: `sub=user`; audience
`appstoreconnect-v1`). It neither prints nor persists tokens or keys. Revocation,
changed user permissions, contracts, developer membership or Xcode Cloud's own
repository/signing access can still require user action; this is not perpetual access.

## Safe smoke and status checks

After review and merge, run **Apple release → Run workflow → main → smoke**.
This runs mock tests and validates main with no secrets and no Apple calls.
The connector currently exposes neither workflow dispatch nor tag creation.
An explicitly authorized Git client can use the single lightweight tag
`apple-release/smoke` pointing at exact current `main` as a secret-free alternative.
Creating the automation PR or ordinary development pushes cannot run this workflow.
Do not create any release tag while today's separate release is in progress.

For a real **GET-only** setup check, merge a manifest with authorization `none`,
then run `status` or `dry-run` with its ID and exact SHA-256. This verifies key
access, app/bundle identity, Cloud commit/build linkage and ASC processing state.
Missing keys, wrong role, incomplete build data or mismatches fail closed.

## Exact manifest and explicit authorization

Add `releases/apple/<release_id>.json` through a reviewed PR. The following is an
illustration with fictitious IDs and an expired authorization, not an active release:

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

Use the successful **non-PR Cloud run's source commit**, which must be an ancestor
of main, and the uploaded build's ASC resource ID and actual Cloud build number.
Checked-in Xcode build numbers need not equal Cloud counters. No latest-build
guessing or auto-incrementing is used. Unknown manifest fields are rejected.
Only listed locales' What's New text changes; other metadata must already be complete.

`status` and `dry-run` perform GETs only. `prepare` requires authorization operation
`prepare`; `submit` requires `submit`. Each write rechecks expiry: a future UTC
timestamp within 24 hours. `MANUAL` holds an approved app for manual publication;
`AFTER_APPROVAL` explicitly authorizes automatic availability following Apple's
approval. The script does not separately release a held version.

Compute `sha256sum releases/apple/<release_id>.json`. Manual runs must target main,
provide mode/ID/hash, and for writes provide the exact confirmation
`<mode>:<release_id>:<hash>`. Reviewers should inspect those exact file bytes, the
expected build/commit and publication choice before approving the environment job.

## Optional release-ref path

After **separate approval of security setup**, restricted release operators using
an authorized Git client (or a connector that supports tag creation) may
create a lightweight tag:
`apple-release/<status|dry-run|prepare|submit>/<release_id>/<64-character-hash>`.
It must point to **exact current main** and the manifest must already be reviewed
on main. The tag itself is an explicit operation request; arbitrary branches,
extra segments, wrong hashes, stale main, expired authorization and unapproved
operations are rejected before Apple credentials are attached.

Before permitting these tags in the environment, configure an enforced tag ruleset
for `apple-release/**`: restrict creation to release operators and disallow updates
and deletion. Keep required environment review and have the reviewer verify the
tag targets reviewed main. A push workflow is loaded from its triggering ref;
script checks alone cannot protect against someone replacing the entire workflow
on an untrusted ref. **Do not allow release-tag deployments without these external
protections.** Keep manual-main-only setup if those controls cannot be enforced.
This PR creates no tags, rulesets, environments or keys.

## Reliability and current contract evidence

One global concurrency group serializes all requests; in-flight runs are never
cancelled by a newer request. A retry reads Apple's state first: matching metadata
is left alone, a matching single-item draft resumes, and an already submitted exact
version returns `already-submitted` without writes. Unrelated/empty drafts, extra
review items and ambiguous resources require reconciliation. No POST/PATCH retries
are made; a timeout may mean a write succeeded. Inspect ASC/status before retrying.
Other clients can still race with this workflow; coordinate release ownership.

Official documentation checked on 2026-10-05:

- [Key types and access](https://developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/),
  [key management](https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api),
  [JWT contract](https://developer.apple.com/documentation/appstoreconnectapi/generating-tokens-for-api-requests),
  [submission roles and metadata requirements](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app/).
- [Cloud run](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-cibuildruns-_id_),
  [run → builds](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-cibuildruns-_id_-builds),
  [build](https://developer.apple.com/documentation/appstoreconnectapi/get-v1-builds-_id_),
  [beta-group build access relationship](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-builds-_id_-relationships-betagroups) (available in ASC, outside this workflow).
- [Create version](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-appstoreversions),
  [localization](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appstoreversionlocalizations-_id_),
  [build selection](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appstoreversions-_id_-relationships-build),
  [create review submission](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-reviewsubmissions),
  [attach version item](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-reviewsubmissionitems),
  [submit via PATCH](https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-reviewsubmissions-_id_).

The modern review sequence is submission → version item → `submitted=true`;
the legacy version-submission create route is not used. Here Apple's detailed
schema pages rendered a JavaScript shell, and Markdown/OpenAPI downloads were
blocked. Resource routes and role guidance were checked; full current schema
verification remains a **pre-write setup blocker**. Mock tests verify the implemented
payloads, not Apple's acceptance. Recheck Apple's current OpenAPI schemas before
enabling writes, then perform the GET-only status test. Set environment variable
`ASC_WRITES_ENABLED=true` only after both checks and explicit setup approval. No live Apple endpoint,
real secret, secure setup or end-to-end release was exercised for this PR.

Local checks: `node --test tests/verify-apple-release.mjs` (also included in
`npm test`). The script uses Node built-ins only; workflow actions are commit-pinned,
Node is version-pinned, checkout credentials are discarded, and GITHUB_TOKEN has
only `contents: read`. No dependency installation occurs in the Apple credential job.
