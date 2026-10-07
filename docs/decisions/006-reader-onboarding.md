# Guided onboarding

## Decision

First-time readers see the existing mascot, “브리즈에 오신 걸 환영해요”, and
one bottom “시작하기” button. The lesson uses a quiet interactive illustration:
Reader chrome is hidden and only the large word Breeze is visible. Tapping it
opens the production mini pill. Its chevron opens the production word detail;
“다음” then reveals “Breeze lets your reading flow.” with a font-size transition.

The existing Reader long press, sentence selection cue, responsive translation
pill and easy-explanation surface remain authoritative. “길게 누르기 대신 문장
해석” provides a keyboard and tap alternative through the registered text Reader
adapter. Sentence extraction and truncation are unchanged. After easy explanation,
“다음” introduces only two font-size controls and a live sentence preview, using
the existing font-size setter. Other choices can wait until normal reading.
Appearance changes are session-only and restored on exit.

The final screen offers only “책 추가하기” and “나중에”. The former opens the
existing book-import dialog. Authentication belongs in normal Settings: email
opens the existing link/code form; password is a subdued secondary link with a
44px target. This main revision contains no Apple client flow or native sign-in
entitlement on web, iOS or Android. Apple remains disabled and explicitly
unsupported. No provider, credentials, security settings or auth request methods
change. Approved Apple artwork is still an access blocker (see QA notes).

Guidance yields to lookup surfaces. Its explicit controls own their taps, so the
Reader's outside-tap dismissal cannot consume the tutorial's Next action. Next
requires word expansion, easy explanation, and one font-size adjustment.
Tutorial Back revisits steps; Skip remains available during lessons. Welcome
and final screens make the covered Reader inert. Focus follows explicit stage
changes. Controls have visible focus and keyboard access (Enter/Space word lookup,
chevron, sentence alternative and font controls). Reduced motion removes attention
and reveal animation. Existing account and guest behavior remain available.

## Local data and lifecycle

The temporary TXT book is transient and never inserted into the library.
Prepared meanings for all five words, the sentence translation and easy
explanation use shared production surfaces with a deterministic one-second
first result. They never call dictionary APIs, debit quota, populate caches,
add vocabulary, persist reading history or enter sync payloads. Repeat word and
sentence lookups are immediate. Network failures cannot block the lesson.

The existing `breeze.onboarding.v1` completion marker is retained. Returning
readers with local books, vocabulary, tombstones or positions are not interrupted.
`breeze.onboarding.guided-progress` records the current step and completed
interactions for interrupted first-time sessions. It is cleared on Skip or
completion and never written by Settings replay. Timers, observers and stale
replies are invalidated on exit/replay. Replay restores the previous view/book
and appearance without replacing account data. Startup and boot fallback remain
unchanged.

## Verification

`npm run test:onboarding` covers word/chevron, long-press release gating,
local sentence help, font preview, interruption/reopening, Back, Skip, both final
actions, replay restoration, cancellation, keyboard alternatives, Settings auth
routes, returning local data, storage isolation and zero dictionary requests.
Web and native-shell emulation exercise five stages in light/dark at 390×844,
820×1180, 1440×900, 320×568 and 844×390. Email login browser tests exercise the
existing request/reopen/password-return flow with mocked auth at five sizes in
both themes. Captures and remaining validation limits are in
[QA notes](../qa/guided-onboarding-draft.md).
