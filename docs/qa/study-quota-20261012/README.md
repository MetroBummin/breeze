# Study storage investigation and repair

Investigated shipped integration `2c82442b082ae148bcf41c0377d0f7ec108e9c23`
in an isolated cloud checkout; no user-device or production data was accessed.

## Confirmed

- Set creation copies complete saved meanings into `cards`. Starting a set adds
  a complete frozen `session.queue`. The whole collection is rewritten for every
  reveal/grade. Overlapping sets store the same content repeatedly.
- Vocabulary retains `breeze.words` plus changed `breeze.word-item.*` records.
  A bulk word write temporarily adds its full pending journal. Existing study v1
  migration requires a separate exact backup in the same localStorage pool.
- The shipped real Chromium reproduction (no quota fault injection or padding)
  used 5,000 synthetic saved meanings with corpus-sized Korean meanings/examples,
  2,500 changed item overrides, 18 sets / 7,200 captured cards / 6,100 queue copies.
  Total localStorage key/value length was 5,240,797 UTF-16 code units. Existing
  study resumed and saved an answer; All Words' first 158,650-character session
  save and a new 100-card set threw `QuotaExceededError`. Source bytes survived.
- The same origin still committed/read a 1 MiB IndexedDB book payload. The
  failure therefore does not imply physical disk shortage or full IndexedDB.
- Opening a fresh All Words session does not write it; the first answer does.
  Its generic shipped error also reproduced with an invalid saved session and
  only 65 storage characters, with zero write attempts. That message alone is
  not a quota diagnosis. Creating a new set's quota-specific error is stronger.
- Injected post-commit render failure in 269 produced `committed:true`; retry
  performed no write and created no duplicate. That already-fixed path does not
  explain the observed quota-specific creation message.

Exact shipped source: [study storage](https://github.com/MetroBummin/breeze/blob/2c82442b082ae148bcf41c0377d0f7ec108e9c23/scripts/core/study-sets-storage.js#L11),
[snapshot and queue copies](https://github.com/MetroBummin/breeze/blob/2c82442b082ae148bcf41c0377d0f7ec108e9c23/scripts/core/study-sets.js#L116),
[All Words persistence](https://github.com/MetroBummin/breeze/blob/2c82442b082ae148bcf41c0377d0f7ec108e9c23/scripts/ui/vocabulary-review.js#L28),
[word writes](https://github.com/MetroBummin/breeze/blob/2c82442b082ae148bcf41c0377d0f7ec108e9c23/scripts/core/state.js#L97),
[commit/display classification](https://github.com/MetroBummin/breeze/blob/2c82442b082ae148bcf41c0377d0f7ec108e9c23/scripts/ui/study-sets.js#L296).

WebKit's current implementation separately specifies a 5 MiB localStorage quota
and accounts for string byte sizes; Chromium's measured character boundary must
not be treated as a measurement of the reporting iPhone. See
[WebKit local storage](https://github.com/WebKit/WebKit/blob/main/Source/WebKit/NetworkProcess/storage/LocalStorageManager.cpp#L37),
[byte accounting](https://github.com/WebKit/WebKit/blob/main/Source/WebCore/storage/StorageMap.cpp#L85),
and [origin quota versus persistence policy](https://webkit.org/blog/14403/updates-to-storage-policy/).
`navigator.storage.persist()` does not enlarge this localStorage budget.

## Bounded repair and evidence

Move the two active study stores to IndexedDB, retaining their exact schemas
and immutable byte-for-byte legacy archives. Verify committed archives before
releasing matching localStorage study keys. Preserve vocabulary, dormant review
history and unrelated backups. Await transaction completion and reject stale
writers; retain retry and navigation ownership.

`shipped-reproduction.json` records the failure. `fixed-chromium.json` records
real quota migration freeing 3,364,294 key/value characters, unchanged source
bytes, successful new creation and All Words, reload, transaction abort/retry,
duplicate input, pending-save navigation and post-commit display recovery.
Run `BREEZE_BROWSER_EXECUTABLE=/usr/bin/chromium node tests/verify-study-quota-browser.mjs`.
The fixture is synthetic; its word/meaning pairings are not a translated dictionary.

Remaining limits: the user's exact device key inventory and exception were not
inspected; no physical iPhone run was possible. Linux WebKit installation was
blocked by the browser download hosts returning HTTP 403. CI includes the same
quota test for Chromium and WebKit. Cross-version downgrade and localStorage
exhaustion caused solely by vocabulary/unrelated history remain separate risks.
No release counter, merge, deployment, or build dispatch is part of this branch.

Final validation is listed in `validation.json`, including source hashes. Full
`npm test`, targeted storage/UI/engine tests, Chromium lifecycle/cold-offline,
creation, All Words, trusted-touch and ten-layout swipe suites pass. Native
packaging retains every live dependency. The 1/10/50-set benchmark also checks
cross-document notifications and stale-token retry; at 50 sets the cloud-browser
median reveal/commit cost was 121 ms (p95 164.1 ms), with zero hidden-list rebuilds.
This is an end-to-end synthetic timing, not a physical-device speed claim.
