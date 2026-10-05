# Private integration QA: imports, covers and offline originals

## Scope and baseline

Verified remote main: `93d38f2a73069910e2bc7e293a436f2702677519` (PR94 merged).
Local integration branch: `codex/breeze18-import-integration`.
Integrates the reviewed changes from `e8f04c9177ee77f5a46c1b2af042539516cf9446`
and `bf3389a063d974ad65575427edd6d0143f368e78` as one local commit on that main.
No push, PR creation, main merge, deployment, native archive or new build.
Breeze and Share Extension remain **1.8 (235)**.

## Preservation checks

PR94's Home progress update callback is byte-for-byte unchanged; only the card's
structural signature gains `coverUpdatedAt`. The full `homeBookSpec` matches main
when that one field is removed. `article-preview.js`, `longreads.js`, Integrity
workflow and iOS project settings match main byte-for-byte. Started-story routing
and exact library identity behavior are preserved.

Generated source hashes, `www/` and `ios/App/App/public/` were refreshed with
`npm run www` and `npx cap copy ios`. All **195 payload files** are byte-identical
between source, www and the iOS asset copy. Service-worker stamp **b52a8d67** matches
the repository's index-plus-READY version input; a repeated stamp makes no change.
Generated native/web directories remain ignored according to repository policy.
This is asset generation, not an iOS compilation or TestFlight build.

## Validation on the integrated tree

| Check | Result |
|---|---|
| `npm test`, including PR94 Home contracts and release validator | PASS, exit 0 |
| Typecheck within aggregate | PASS, baseline 34 diagnostics; no increase |
| Available extra Integrity contracts: article preview server, PDF ink geometry | PASS |
| New import/cover browser regression | Chromium 14/14 PASS |
| Offline first/uncontrolled and controlled session; TXT/EPUB/PDF; worker generation transition | Chromium PASS |
| PR94 Home reading cards on source | Chromium PASS |
| PR94 Home reading cards on generated www | Chromium PASS |
| PR94 Home reading cards on generated iOS asset directory | Chromium PASS, served over local HTTP; not native execution |
| Bohemia progress, seven reopen/font cycles, cold and delayed illustrations | Chromium PASS |
| Long-read preview, 30 Holmes viewport/theme states, cancel/failure/retry and direct resume | Chromium PASS |
| Real 80-page PDF / EPUB / TXT import feedback | Chromium PASS |
| Shared-file browser bridge, durable failures, retry and duplicate input | Chromium PASS; not native share extension execution |
| Source/www/iOS byte equality; unchanged PR94 routing/version settings; whitespace | PASS |

Home proof includes actual Bohemia 66 -> 68 with the same tile and decoded cover,
and the same PDF 100 -> 50 -> 19 with corresponding Reader, stored, center capsule,
Home-card and shelf labels. The full routing test covers unread preview, cancel,
Read, Home/Explore direct resume, backward navigation, renamed/reloaded identity,
interrupted opens and deletion/reimport.

One initial iOS-assets wrapper invocation completed all product assertions but
failed while deleting a temporary test filename shared with a concurrent www
invocation. It was rerun directly using the test's supported Chromium executable
and root environment options, with exit 0. No application assertion was weakened
and no production change was made for this harness cleanup issue.

## Limits and remaining gates

Linux Chromium 151.0.7922.173 is the installed fallback, using Playwright 1.63.0.
WebKit was unavailable because official browser downloads returned HTTP 403 in
this environment. No bypass was attempted. Full two-engine Integrity browser CI
is not claimed green; unaffected browser suites were not all rerun.
No Xcode/Swift compiler or iOS device/simulator is available, so native Pencil,
WKWebView, share extension execution, native compilation and device behavior are
not verified by these browser checks. User acceptance of PR94's running 235 is
parent-reported and is not substituted for testing this additional patch.

Fixtures and anonymous local state only; external browser requests blocked.
No paid AI requests, sign-in, production-data access, RSS gate changes or OXOX work.
Parent review still owns publication, CI completion and any future release.

## Behavior contract for review

A failed first original write now leaves no partial text-only book or success
receipt. Import commits book/source/images atomically. Cover edits likewise commit
bytes and edited metadata together; explicit None and newer presentation edits
survive reimport. Same-file ownership is within the application instance, not a
new cross-tab coordination protocol. Immutable offline libraries are cached when
first needed on an uncontrolled web page; native bundles use their local assets.
