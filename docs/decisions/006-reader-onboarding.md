# Guided onboarding in the real Reader

## Decision

First-time web and native readers begin with the existing mascot, “브리즈에 오신 걸
환영해요”, and one bottom “시작하기” button. A temporary TXT book then presents
only the large word Breeze. Tapping it opens the production word mini pill;
expanding its chevron enables Next. The same source paragraph reveals “Breeze
lets your reading flow.” with a short font-size transition. The normal Reader
long press, selected sentence cue, responsive anchored translation pill and
explicit easy-explanation surface are authoritative. A keyboard-accessible
“길게 누르기 대신 문장 해석” button calls the same registered text Reader adapter,
including its range paint and sentence origin. Sentence extraction is unchanged.

The next step introduces the real Aa controls with one instruction about font
size. Appearance changes remain session-only and are restored on exit. The final
step shows “이메일 로그인” and “Apple 로그인” as main choices and a subdued
“비밀번호 로그인” link with a 44px tap target. Email and password open the existing
account settings forms. This main revision has no Apple sign-in client or native
entitlement on web/iOS/Android, so Apple is disabled and labelled as unsupported.
Adding Apple support requires a separate implementation and configuration.
Guest completion and Skip remain available; no authentication or security policy
changes are part of onboarding. Signed-in replay offers reading completion.

The normal Reader renderer, gesture owner, floating controls, word pill/detail,
sentence pill and Aa own their behavior. Guidance yields to these surfaces and
provides a separate “안내로 돌아가기” action. Next requires word expansion, sentence
easy explanation, and an Aa visit respectively. Tutorial Back revisits steps;
the Reader Home action remains disabled while the transient book is open.
Welcome and account steps make the covered Reader inert. Focus follows explicit
stage changes; guidance announces changes, controls have keyboard access and
visible focus (including Enter/Space word lookup and its chevron), and reduced motion removes attention and reveal motion.

## Local data and lifecycle

The book is transient and never inserted into the library. Prepared answers for
all five words, the sentence translation, and easy explanation use production
surfaces with the existing one-second local first-result feedback. They never
make dictionary/API requests, debit quota, populate dictionary caches, add
vocabulary, persist reading history or enter sync payloads. Repeat word/sentence
lookups are immediate. Easy explanation remains transient and does not populate
the production sentence-help cache. Network failures cannot block these demos.

The existing `breeze.onboarding.v1` completion marker is retained. Returning
readers with local books, vocabulary, tombstones or positions are not interrupted.
A separate `breeze.onboarding.guided-progress` local marker records completed
interactions and the current step for interrupted first-time sessions. It is
cleared on Skip or completion and is never written by Settings replay. Timers,
observers and stale replies are invalidated on exit/replay. Replay restores the
previous view/book and appearance without replacing account data.

Startup still chooses Reader or Home after local library loading, before revealing
Home. The boot error/watchdog fallback remains unchanged.

## Verification

`npm run test:onboarding` checks actual word and chevron interaction, actual
long-press release gating, local sentence help, Aa, interrupted/reopened/back,
skip, guest completion, replay, cancellation, keyboard sentence alternative,
existing email/password handoff, returning local data, storage isolation and zero
dictionary requests. It exercises web and native-shell emulation and captures
all five stages in light/dark at 390×844, 820×1180, 1440×900, 320×568 and 844×390.
Chromium video and selected screenshots are linked from
`docs/qa/guided-onboarding-draft.md`. Full suite, production word/sentence/help
regressions, shared controls and build remain required. Native-shell emulation
is not physical iPhone/iPad validation; real authentication is not exercised.
