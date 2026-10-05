# WebKit staged image promotion

The [diagnostic run](https://github.com/MetroBummin/breeze/actions/runs/37356317490/job/111919510195)
compared build-238 `7f64075aa1a4b82c74ec7bb829409b99d09e6d81` against
`e9ff4b1f2555a8df6e091f392862e5f0a0a08899`, existing versus single persistent
browser ownership, and original assertions with/without byte observations.
Two fresh-profile attempts per combination produced 32 case outcomes: 27 passed,
5 failed. Every attempt is retained in [the receipt](import-byte-promotion-20261005.json)
and [original artifact](https://github.com/MetroBummin/breeze/actions/runs/37356317490/artifacts/11364134716).

Four instrumented failures locate the same boundary on base and current: native
53,578-byte JPEG inputs, completed staging writes and pre-promotion reads all
match SHA-256 `efd8384ea5b1f430102ea4a9b7fcb75eaac5626a49c22b00b848f104cfb7a571`.
Promotion reports transaction completion, but final images immediately reject
`arrayBuffer()` with `NotFoundError`; direct `get(key)` also fails after the
original snapshot fails. No purge ran in these successful first imports.
The fifth failure occurred in an uninstrumented current control. Both browser
ownership modes fail, so removing the unused outer browser is not an evidenced
repair. Instrumentation can change timing; controls remain necessary.

The production correction is scoped to `commitImportedBook`: materialize its
private staged native images before the atomic write and use the existing binary
record representation. Existing/custom images are left intact. A failed byte read
cannot publish a book. Original abort, same-key replacement, reimport, None,
concurrent edit and reload assertions remain unchanged. A new direct promotion
case exercises 20 books/40 native image records and checks immediate and reloaded
bytes; another verifies rejection preserves the previous book and images.

The comparison still executes and records strict baseline assertions; baseline
failures are expected evidence of the original bug, while any current failure
fails the diagnostic job. Full Integrity remains mandatory. This is Linux
Playwright WebKit evidence, not a physical iOS Photo Library/WKWebView result.

Local correction validation: full `npm test` and `npm run ios:sync` exit 0.
All 14 pre-existing Chromium import cases, the 40-image promotion case and the
unreadable-byte rejection case pass. The generated iOS bundle matches all four
changed production scripts. Remote WebKit base/current comparison and full CI
must pass on the published correction before parent-coordinated merge/release.
