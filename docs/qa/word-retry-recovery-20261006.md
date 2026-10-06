# Word retry recovery investigation

## Verified failures

### Correct lemmas repeatedly rejected

The pre-fix server's `validateLook()` accepted a word headword only when it was
equal to the supplied `word`, selected token, or client-supplied `cands`.
The client's lightweight morphology misses legitimate forms:

- `slept → sleep`, `stole → steal`, `swam → swim`, `hung → hang`
- `studied → study`, `denied → deny`, `tried → try`

Running the actual handler with correct synthetic provider answers produced
502 for the first call and every retry; `ate → eat` and `patient → patient`
returned 200 in the same harness. Each failed call could exhaust three provider
attempts. This is answer rejection, not an absent retry request or a negative
answer cached by the receipt system. Failed generation does not write a receipt
or consume user quota.

The read-only retrieved production `dict` v59 validator matched the pre-fix
repository source. The same validator and lexical core exist in commit
`e497ccb58ec0b9ba7b4428adbc46cfe601131178`, whose iOS project declares 1.7(216).
This establishes an older source lineage; it does not independently identify
the exact App Store binary installed on a reporting device.

The repair derives allowable morphology on the server from the selected token.
It ignores untrusted/stale client candidates as authority, accepts additional
attested inflections, and still rejects unrelated words such as bank → flood,
including when `word/cands` claim flood. Existing expression/member/answer
validation remains in place. The entire storage candidate function stays
unchanged; the new validation-only helper also handles casing and possessives.

### Detail retry retained an earlier context error

An existing unresolved word opened through `openWord()` has a temporary
`contextView`. After a failed lookup, detail `askAI()` could save a successful
answer while leaving `contextView.error` set. The presentation continued to hide
that answer behind the old error. Opening another word replaces the context.
The mini-pill retry also allowed the old context error to hide its pending state,
although its successful completion already cleared the context.

The correction is scoped to the current occurrence and opening lifetime.
An older result must not clear a newer selection's context or revive its surface.

## Evidence and limits

- `verify-word-lemma-validation.mjs`: real server and client recovery functions,
  20 morphology/legacy-identity cases, 13 casing/possessive/own-property cases, all 75 existing
  word goldens, invalid/forged headwords, first failure → same-ID manual retry →
  another word, receipt replay and success-only counting
- Existing word-span golden remains unchanged: 17 texts, 114 spans, 9 properties
- Existing lemma baseline remains unchanged: 44 preferred identities
- Existing actual Postgres/PGlite quota orchestration tests remain applicable
- No production AI request, user vocabulary mutation, production deployment,
  app publication, or physical-device test was performed for this investigation
- A reporting device's exact word/sentence has not been supplied; the two
  reproduced defects are not proof that every not-found message has one cause

For any separately approved Edge deployment, preserve the repository-relative
`server/dict/*` and `modules/lexical/core.js` paths in one bundle. Updating only
the web/native client does not repair old App Store clients' server validation.
