# Simple saved-word cards verification

Based on PR90 `4ba672bf13f78e198ec9b91b67911781690f8b78` with its free RSS filter
and existing1.7(232) metadata. No merge, deployment, archive or paid call here.

Local Chromium: actual shipped simple mode passes empty/one/2100 cards, all words
independent of Memory filters, front/back and keyboard, previous/next boundaries,
exit/reopen and real Back/Forward, dormant advanced actions, hidden/disabled
settings, saved-word persistence/reload, exact unchanged review bytes and **zero
review-storage reads/writes**. Ten phone/tablet/desktop/short-viewport/theme layouts
pass without horizontal overflow. Existing Memory search/sort/filter/edit/add/CSV
and Home tests pass. The explicit ON advanced fixture passes its existing full
review suite; the scheduler engine/unit tests are unchanged. Full `npm test`,
asset stamps and iOS sync/release verifier pass. No baseline was weakened.
WebKit is unavailable locally; CI runs both shipped simple and ON advanced fixtures.

[Phone dark front](phone-dark.png) and [tablet light back](tablet-light.png) show
synthetic saved-word fixtures, not user data. Full CI captures are uploaded under
`vocabulary-review-proof`.

Position is deliberately session-only; reloading starts at card1. Existing review
due dates/data remain untouched and can be overdue when1.8 later re-enables them.
No quality/accuracy or on-device performance improvement is claimed.
