# Relay protocol v1 — server contract / client implementation pending

## Authentication and enrollment

Every `/v1/*` operation is POST JSON <=8192 bytes and requires a current Supabase
access token in `Authorization: Bearer ...`. The Worker asks this project's
`/auth/v1/user` to verify it; it never trusts decoded JWT claims. Asymmetric vs
legacy HS256 signing configuration is not assumed or changed. Remote verification
adds Auth calls; it is intentional until actual signing settings can be inspected.

Each device generates a permanent, nonextractable P-256 **ECDSA** private key and
persists it locally (not the ephemeral ECDH pairing key). Every request additionally
has `X-Relay-Device` (UUID), `X-Relay-Time` (epoch-ms string), `X-Relay-Nonce` (new UUID)
and `X-Relay-Signature` (base64url of the 64-byte WebCrypto P1363 signature).
Sign SHA-256/ECDSA over UTF-8 of these LF-separated lines, no trailing LF:

```text
breeze-relay-v1
POST
<exact Worker origin, no trailing slash>
<pathname, e.g. /v1/request>
<lowercase SHA256 of exact JSON request bytes>
<device UUID>
<epoch milliseconds>
<nonce UUID>
<lowercase SHA256 of exact bearer token>
```

Clock skew allowance is 60s. SQL atomically consumes nonce with state change;
fresh proofs are required for retries, while `request_id` stays stable. The public
JWK contains ONLY `kty`, `crv`, `x`, `y` (no `d`, `ext` or `key_ops`). Fingerprint is
lowercase SHA256 of UTF-8 `JSON.stringify({kty,crv,x,y})` in that exact field order.

`register` verifies proof of possession and creates a 10-minute **pending** device.
No email-only self-approval endpoint exists. For the FIRST DEVELOPMENT device the
operator checks fingerprint via a trusted channel, confirms local E2EE unlock and
explicit opt-in, then uses service-only `relay_bootstrap(user,device,fingerprint)`.
This is a development gate, NOT completed production onboarding/recovery. Thereafter
an approved old device verifies the new fingerprint in the authenticated pairing
exchange and signs `approve`. Reuse existing ECDH QR/code/recovery to transfer the
vault master, but bind/approve the new ECDSA fingerprint separately. Never approve
an arbitrary same-account pending device solely because it can log in. Loss of all
approved signing keys requires an independently reviewed recovery process, not an
email-only fallback or reset of `everApproved`.

## Endpoints

All bodies reject unexpected fields. All identifiers are scoped to verified account.
Times are integer epoch milliseconds. HTTP errors have `{"error":"CODE"}`.

| POST suffix | JSON fields | Response / effect |
|---|---|---|
| register | public_key, consent | device_id, pending status, public_key_hash |
| approve | device_id, public_key_hash | approved status; caller must already be approved |
| revoke | device_id | revoked; current grants expire shortly; pending target is waived |
| consent | consent | saved consent; withdraw triggers cleanup reconciliation |
| offer | file_id | announce locally present original to opted-in own devices |
| request | file_id, request_id | new/join existing transfer; receiver requests only missing files |
| retry | file_id, request_id, reason | explicit fresh missing/expired/user_retry cycle; capped |
| source-missing | file_id | holder no longer has original; invalidate upload lease |
| upload | file_id, transfer_id, cipher_size | attempt_id + upload grant; sender must offer original |
| complete | file_id, transfer_id, attempt_id | HEAD/conditional Copy/HEAD; ready or HTTP202 FINALIZING |
| events | cursor (default "0") | events[64], cursor string, has_more |
| snapshot | after (optional file_id) | bounded items[32], after, has_more, resume_cursor |
| status | file_id | transfer view; source/target only |
| download | file_id, transfer_id | ready view + GET grant; pending target only |
| ack | file_id, transfer_id, attempt_id, verified:true, stored:true | receiver durable ACK; eventual all-target cleanup |
| cancel | file_id, transfer_id | waive caller's target only, not another receiver |
| cleanup-retry | file_id | retry a cleanup_failed transfer; involved approved device only |

Consent is exactly `{"policy":1,"send":true,"receive":true}` (booleans are user
choices). Enable only after explicit disclosure covering existing and future books.

Example request: `{"file_id":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","request_id":"11111111-1111-4111-8111-111111111111"}`.
Transfer view includes `file_id,transfer_id,state,outcome,expires_at,attempt_id,
cipher_size,recipient_status,source_availability,cleanup_pending`.
A grant includes `url,method,headers,expires_at`; upload also `content_length`.
PUT exact ciphertext bytes, `Content-Type: application/octet-stream`, `If-None-Match:*`.
Browser Blob/fetch sets Content-Length itself: do not assign the forbidden header;
the actual generated value must match signed length. Test real Safari/R2 before enabling.
GET requires returned `If-Match`; redirects/caches/logging/URL analytics are disallowed.
Never send auth tokens or signing secrets to R2 along with these grants.

Presigned URLs are **reusable bearer capabilities**, not one-time tokens. New grants
check approval/target/expiry. An already issued URL remains usable for <=60s unless
its object disappears. Device revoke cannot retroactively invalidate it instantly.
Staging create-only PUT cannot overwrite an existing stage; it is never a ready-key
PUT. Conditional server Copy freezes bytes under an unexposed ready key. Quiet-period
rechecks and lifecycle catch late writes. Header/length support needs real R2 acceptance;
if unsupported, STOP deployment rather than removing those protections.

Important errors: 400 BAD_* / UNEXPECTED_FIELD / DURABLE_ACK_REQUIRED;
401 UNAUTHENTICATED / BAD_PROOF / STALE_OR_INVALID_PROOF;
403 DEVICE_NOT_APPROVED / *_CONSENT_REQUIRED / DEV_ACCOUNT_NOT_ALLOWED;
404 NOT_FOUND; 409 STALE_TRANSFER / STALE_UPLOAD / UPLOAD_LEASE_BUSY / CLEANUP_PENDING /
RETRY_REQUIRED / PROOF_REPLAY / CURSOR_EXPIRED; 410 TRANSFER_EXPIRED;
413 FILE_SIZE_LIMIT / REQUEST_TOO_LARGE; 422 CIPHERTEXT_SIZE_MISMATCH;
429 ACCOUNT_CAPACITY / RATE_LIMIT / UPLOAD_RETRY_LIMIT / DOWNLOAD_GRANT_LIMIT /
RETRY_BUDGET_EXHAUSTED; 502 OBJECT_COPY_FAILED; 503 AUTH_UNAVAILABLE /
STATE_BACKEND_UNAVAILABLE / STATE_BUSY / RELAY_DISABLED / INFRA_NOT_VERIFIED.
Only network/503 retries with backoff+jitter are automatic. Do not turn expiry or
retry-budget errors into endless new uploads. Persist request_id and attempt_id.

## State, recipients and events

`idle → waiting_source ↔ unavailable_known_sources → uploading → ready → closing → deleted`.
Failure/lease timeout returns to waiting; all ACK, cancel/waive or expiry closes.
Eight failed deletions become `cleanup_failed`; explicit cleanup-retry restarts them.
A ready transfer may add a newly approved receiver before its final ACK commits.
The per-account SQL CAS orders that race. Once closing, recipient joins fail;
after cleanup a still-missing new receiver requests a new bounded generation.
Withdrawal/revoke waives that device, never treats it as a successful local save.

First upload sets 24h default access deadline, configurable down to 60s, maximum24h.
It does not reset for retries/another sender. A waiting transfer without uploaded
bytes expires after 7days. If no source is online, keep waiting; `no_known_source`
means all reported eligible holders are absent, not proof about an offline device
whose inventory is unknown. No new generation is automatically created on expiry.
Per file: max3 attempts/transfer and max3 cycles/rolling24h; explicit user/app retry.

An awake foreground app consumes `events` on a modest jittered interval (e.g.60–120s),
not the full vault. Persist the returned cursor; drain has_more. Each file_changed
triggers at most a relevant status/request/offer. On startup, foreground or reconnect,
query since cursor. A new device or CURSOR_EXPIRED uses paginated snapshot once,
**keeps the FIRST page's resume_cursor across ALL pages**, then drains events from
that cursor. Keeping the last page's cursor could miss changes during pagination.
Reconcile the device's encrypted book metadata/local inventory on initial pairing;
terminal file records can be pruned after30days. Do not poll every file or full vault.

## Identity and client encrypted package

For PDF/EPUB use actual original bytes from `originalGetForBook`/`originals` and the
SHA256 used by `book.sourceHash`, `book.original.hash` or the original record's hash.
Recompute/verify rather than hashing extracted `paras`. Lowercase hex64 sourceHash
is LOCAL or encrypted manifest only. Derive the server-visible opaque file_id:

```js
await VaultCrypto.recordId(master, 'relay-file-v1', sourceHash.toLowerCase())
```

This is24 HMAC bytes encoded as32 unpadded base64url characters, scoped by vault
master. Do not send sourceHash directly, local book.id, title or filename as file_id.
For TXT without an original, first define/persist canonical UTF8 original bytes on
the device, then hash those bytes; do not silently equate reflowed text with a PDF.
The server never receives master, recovered keys, title or the manifest plaintext.

The following v1 binary format is the client contract, NOT an implemented app codec:

- Fixed header36bytes: ASCII `BRZRL001` (8), random HKDF salt(16), random nonce prefix(8),
  manifest ciphertext byte length u32 big-endian(4). No titles/IDs/hashes in the header.
- Derive AES256GCM key via HKDF-SHA256(master,salt,UTF8 `breeze/relay/package/v1`).
  Fresh salt/prefix for EVERY new attempt; never reuse a key/nonce for different bytes.
- Manifest plaintext UTF8 JSON: `{v:1,vaultId,fileId,transferId,attemptId,kind,title,
  originalFilename,sourceHash,originalBytes,chunkBytes:1048576,chunkCount}`. Local
  metadata fields remain encrypted. Bound manifest plaintext to64KiB; reject unknown
  version, oversized counts, mismatched identities and unsafe filenames on receive.
- Nonce = prefix8 || u32be(index); index0 for manifest, 1..chunkCount for original data.
  Each record uses AES-GCM 128-bit tag. Ciphertext records follow header: manifest,
  then1MiB plaintext chunks (last shorter), each with16-byte tag. No archive paths.
- AAD = UTF8 JSON.stringify(["breeze-relay-package-v1",userId,vaultId,fileId,transferId,
  attemptId,index]) || byte0 || fixed header36bytes. Fields/order/UUID casing must be
  identical on both devices. Use the approved shared vaultId, never email as a key.
- Exact cipher_size =36 + manifest UTF8 length +16 + originalBytes +16*chunkCount,
  max32MiB in this DEV server. Manifest length can be calculated using a same-length
  UUID placeholder before upload reserves/returns the actual attempt_id. Reject
  trailing bytes, truncation, wrong chunk count/order, AAD/tag failure, wrong source
  SHA256 or recalculated file_id. Never route even encrypted book chunks through SQL.

ACK only AFTER authenticated decryption of ALL records, source hash/file identity
verification, durable original+book/index transaction commit and successful reopen.
A cancelled/aborted/quota-failed local transaction MUST NOT ACK. Browser storage
persistence requests alone do not guarantee permanent physical retention; the app
must report storage errors and later re-request after local loss. Device key/ID and
pending ACK state also need crash-safe persistence. Existing helpers that swallow
read/storage errors must not be mistaken for successful durability. Server cannot
prove client storage durability cryptographically; it enforces the explicit contract.
