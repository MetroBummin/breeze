# Exact build272 screenshots and release tooling

The user approved the exact review-PDF set at2026-10-13T03:18:57.933656Z:
the existing1.9.3 archive's five iPhone and six iPad images plus the supplied
version1 learning image for each device. Preserve original bytes. Append the
learning image after each device's existing ordered set; total counts are6/7.
No future word-test feature belongs to build272 or this change.

`releases/apple/assets/breeze-193-build272.json` records Library identities,
approval, archive/image digests, dimensions and order. Local preflight rejects
incorrect archives, missing/extra images, symlinks, unsafe paths, changed bytes,
malformed PNG structure and wrong dimensions. It checks PNG structure/dimensions,
not full pixel decoding; the approved SHA-256 hashes establish content identity.

`apple-screenshots.mjs` adds inventory, set creation, reservation, binary PUT,
MD5 commit, processed state/checksum/dimension read-back and exact ordering.
It is reachable only through the existing release CLI gates. Exact272 prepare
and submit now require a manifest-bound screenshot plan and locally verified
originals. The plan path is fixed and loaded from committed Git bytes before
credentials. A manifest includes the plan SHA-256, explicit locales and API
slots; source37de137, Cloud run c5877215-c804-44e0-881d-25e3d6cf92b5,
buildUUID10a92796-4109-4dbb-a519-45eda33768ea and APP_STORE_ELIGIBLE remain checked.
No new key, live security setting, build or counter is introduced.

Inspect every targeted set before any mutation. Existing matching MD5/size images
are retained; COMPLETE images also require approved pixel dimensions. Other,
duplicate, failed or unknown images stop with reconciliation required. No DELETE
endpoint is allowed. Ordering sends only an exact permutation of current IDs.
Other locales remain untouched. Nonempty unplanned display slots in a target
locale block writes and are reported in read-only inventory. The version and target localizations
must already exist; this bounded screenshot path does not create them implicitly.

Interrupted reservations use a deterministic full-SHA-256 filename and exact size.
A fresh authorized invocation re-reads state: AWAITING_UPLOAD can resend its byte
parts; UPLOAD_COMPLETE waits; COMPLETE is reused. No POST, commit or transfer is
automatically retried. Lost responses require GET reconciliation and a new request.
Processing returns action-required and cannot advance into review submission.
All approved images must read back COMPLETE in order immediately before submit.
External clients can still race; the API provides no transactional compare-and-swap
across inventory and reorder. Coordinate ownership and inspect any ambiguous result.

Storage PUTs use only Apple-returned HTTPS *.blobstore.apple.com operation URLs,
exact contiguous byte ranges, bounded sizes/timeouts and supplied safe headers.
No ASC JWT, cookies, redirects, URL logging or arbitrary remote destinations.
An unfamiliar Apple storage host requires reviewed code support, not a bypass.
Authorization expiry is checked before every PUT, commit and other Apple mutation.

The previous272 boundary described packaging only and rejected any later repository
file. CI now verifies this explicit release-tooling path set against main5f8b178;
all shipped and historical bytes/modes remain fixed. CI runner edits are exact
check-command substitutions, and package.json can only add the two mock suites.
The original272 positive/negative tests and their historical chain still run
unchanged in an isolated37de137 checkout. The OCR gate remains unwaived.

Current executor evidence: official Library preparation succeeded for all four
required source files, but each current supported byte-transfer helper returned
`library file transfer failed: download failed`. No raw HTTP status was exposed;
no automatic approval-review denial was observed. Another authorized consumer
succeeded, which does not establish byte availability here. The local asset root
is empty. Supported remediation is to restore this consumer's Library bridge/
transfer runtime, have the provider materialize into this consumer's filesystem,
or execute in a consumer where official transfer and original hash checks succeed.
Do not copy signed URLs, hand-fetch originals, patch helpers or move credentials.
The unrelated public Apple Markdown fetch received a gateway403; this does not
prove the same cause for the Library failure.

Tests use synthetic data and mock Apple APIs. No screenshots or metadata were
uploaded, deleted, reordered or submitted here. The draft PR leaves source272,
main/integration, credentials and live configuration untouched. Production execution
still needs approved originals in the executing consumer, existing protected
credentials, live inventory/eligibility, exact metadata/locales/publication choice,
and the separately owned approved writes flag. The workflow intentionally has no
unverified artifact-download or credential-copy step.
