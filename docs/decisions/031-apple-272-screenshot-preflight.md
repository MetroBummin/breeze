# Exact build272 screenshot preparation

The user approved the exact review-PDF set at2026-10-13T03:18:57.933656Z:
the existing1.9.3 archive's five iPhone and six iPad images plus the supplied
version1 learning image for each device. Preserve original bytes. Append the
learning image after each device's existing ordered set; total counts are6/7.
No future word-test feature belongs to build272 or this preparation.

`releases/apple/assets/breeze-193-build272.json` records the supplied identities,
approval, archive digest, exact image digests, dimensions and order. The local
preflight reads only; it has no credentials or network client. It rejects an
incorrect archive, missing/extra images, symlinks, paths outside the asset root,
changed bytes, malformed PNG structure, wrong sizes, other builds and other
approval identities. Its PNG check validates structure/dimensions, not full pixel
decoding; the approved byte digests remain the content identity check.

The consumer must independently materialize these Library originals and run:

```
node tools/verify-apple-screenshot-assets.mjs /absolute/asset-root
```

The root holds the untouched base ZIP, its selected extracted `iPhone/` and
`iPad/` files, and the two untouched `Breeze-learning-*-preview.png` files.
This is a preparation utility, not a screenshot uploader or submit command.
No original bytes were successfully materialized in this executor: four official
Library transfer preparations succeeded, then every supported byte-transfer
helper call failed. The empty directory fails preflight. Tests use synthetic
fixtures and do not establish live asset, API or screenshot upload readiness.

The existing `apple-release.mjs` remains unchanged. Its trusted-main/actor/hash/
authorization/ancestry/write guards remain active. A separate worker owns the
already-approved `ASC_WRITES_ENABLED` setting; do not change it concurrently.
Before any upload, the existing authenticated route must validate exact ASC
buildUUID10a92796-4109-4dbb-a519-45eda33768ea, source37de137, original Cloud run
c5877215-c804-44e0-881d-25e3d6cf92b5 and APP_STORE_ELIGIBLE; read current1.9.3
localizations and screenshot sets. Never infer the live display-type enum from
marketing screen size or select a later automatic build.

Apple documents screenshot-set creation, screenshot reservation/upload/commit
and ordering in its App Store Connect API. The existing release client's write
allowlist does not implement those operations. Current request/response schema,
existing-set reconciliation, bounded asset transfer and ordered checksum/state
read-back must be verified before extending it. Do not wire an unverified asset
writer around the existing guards or declare uploads/submission complete.

Official references:
- https://developer.apple.com/documentation/appstoreconnectapi/uploading-assets-to-app-store-connect
- https://developer.apple.com/documentation/appstoreconnectapi/post-v1-appscreenshots
- https://developer.apple.com/documentation/appstoreconnectapi/patch-v1-appscreenshots-_id_
- https://developer.apple.com/documentation/appstoreconnectapi/post-v1-appscreenshotsets

This local preparation changes no source272 bytes, native counters, keys,
environment permissions, main branch or Apple state. CI21/22 and the inherited
WebKit offline Blob/FileReader OCR failure remain unwaived.
