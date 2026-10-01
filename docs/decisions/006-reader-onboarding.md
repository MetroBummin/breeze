# Onboarding in the real Reader

## Decision

First-time web and native readers open the same temporary TXT book in `#v-read`.
The normal Reader body renderer, gesture owner, floating controls, Aa, word pill,
detail popup and translation-only sentence result are authoritative. Onboarding
adds only a guidance card and Skip. No copied Reader controls or lookup surfaces
remain. The existing completion marker is retained; returning readers with local
books, vocabulary, tombstones or reading positions are not interrupted. Settings
provides replay on both platforms. Startup waits for the local library and chooses
the initial Reader or Home before revealing the app, without a post-Home delay.
A boot error or an eight-second script-load watchdog reveals the app so a failed
startup cannot leave the interface permanently hidden.

The short authored story has a prepared Korean meaning and English definition
for every tappable word, plus translations for every sentence. The first lookup
of an occurrence waits 1000 ms using the real loading UI; a repeat is immediate.
The normal 750 ms long-press threshold and release-before-result rule remain.
The word detail can open during that same pending lookup. No AI request, metadata
request, quota charge or dictionary-cache write is made for these answers.

The book is transient, never inserted into the library. Word cards are owned by
the presentation, never inserted into `words`. Existing vocabulary cannot merge
words into saved phrases or color the tutorial. Progress/history persistence and
dictionary warmup are skipped for transient books. Aa uses real controls with
session-only changes, restored on exit. Timers and stale replies are invalidated
on skip, navigation, another lookup, replay, and completion. A settings replay
can return to the user's existing book without deleting or replacing its data.

Guidance advances on completed actions and yields while lookup/Aa is open.
Each step names and outlines its target: tap “curiosity”, press and hold “Reading”,
then tap Aa. Korean guidance uses short action-first instructions. The Reader
Back button is disabled throughout the tutorial, including lookups and Aa, and
the Home-return action also rejects tutorial requests. Exit restores the button's
previous state; Skip, completion and Escape remain available. Settings labels
the replay action “튜토리얼 다시보기”.
Completion offers the existing Add dialog or a later exit. The final note reminds
readers of tap/long-press gestures; it makes no login claim. The tutorial grants no
extra production access.

Signed-out and signed-in lookups share the same renderer. Successful anonymous
lookups show no legacy explanations or repeated trial counters. Login/exhaustion
is an actionable state only when a lookup is blocked; the pill retry opens login
instead of issuing another doomed request. A new pending result clears the old
meaning/part-of-speech/notice before painting. Production authentication and quota
rules are unchanged.

## Verification

`npm run test:onboarding` covers fresh web/native sessions, prepared word coverage,
1000 ms first lookup, immediate repeats, shared detail and real long-press behavior,
Aa, completion, replay, cancellation, history/storage isolation and zero lookup
requests. Screenshots include phone, desktop and dark completion. Normal Reader,
word/sentence lifecycle, signed-out states, shared controls and full-suite checks
remain required. Browser/native-shell emulation does not prove physical iOS behavior.

## Visible-only startup (2026-09-29)

After local data loads, choose onboarding before rendering Home. A first-time
Reader does not build recommendation cards or begin their image/feed work for a
hidden Home. Returning readers still render Home, and leaving onboarding renders
it through normal navigation. The one-second authored tutorial feedback policy,
boot failure fallback and local storage ordering are unchanged.

## Compact targets and optional completion (214)

Word guidance uses the existing pale-blue selection fill on the actual span,
without an outline or expansion into neighboring text. Aa retains a separate
control outline. The temporary book is titled “Breeze Tutorial”.
The final coach offers both Add Book and “나중에 할게요”; either completes the
same transient session, but the latter exits without opening the Add dialog.
