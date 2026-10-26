# First-run onboarding v2

## Decision

The first launch shows a short local demonstration, then a book choice. It does
not play the welcome pen, the eight feature videos, or a temporary Reader.
Completion stays on `breeze.onboarding.v1` (`done`). Interrupted progress stays
on `breeze.onboarding.carousel-progress`. A saved `{scene:'choice',version:'v2'}`,
a legacy `{feature:'finish'}`, or an integer `page > 0` resumes on the choice
screen. Replay from Settings (`튜토리얼 다시보기`, `startOnboarding(true)`)
always starts on the word and does not clear books or vocabulary.

People who already have a book, a reading position, a tombstone, or any
vocabulary other than the onboarding sample are not interrupted. The sample is
the single word `take` with `onboardingSample` and the canned gloss below.
That record alone does not count as an existing library.

The guide is one overlay (`#onboarding`). App views and the lookup, sentence,
settings, and add surfaces are inert while it is open. If the active view
changes, or the session goes back, the overlay closes without marking `done`.
Escape on a demo scene jumps to the choice screen. Escape on the choice screen
closes the overlay and leaves progress so the next launch resumes there.
`건너뛰기` does the same jump and does not mark `done`.

Scenes, in order, about fifteen seconds if the reader waits:

1. The word `take` sits in the center with a soft pulsing ring and no caption.
   A tap, or about three seconds of idle, bursts canned Korean glosses of
   `take` across the screen. The list is local. There is no network lookup and
   no model call. There are no speed lines or arrows.
2. The glosses shrink, blur, and move back into the word. The view then settles
   on `She decided to take the job in London.` with `take` highlighted. A tap,
   or a short pause, shows one pill: `맡다 · (일자리를) 받아들이다`, labeled
   `문맥에 맞는 뜻`.
3. A green toast, `✓ 단어장에 저장됐어요`, slides down once, and a green `+1`
   appears on a small vocabulary glyph. The same record is written through
   `saveWords` so the vocabulary list is not empty afterwards. Replay does not
   overwrite a real `take` and does not add the sample when other words exist.
   Skipping to the choice screen still writes the sample under those rules.
4. Built-in offline classics sit in a horizontal cover flow. The centered cover
   is largest; neighbors are smaller, faded, and partly visible. Scrolling
   snaps. The primary button names the centered book (`앨리스 바로 읽기`, and
   the matching label for each other book) and opens that book in the Reader
   without the preview step (`importLongRead`, then `openBook`). `내 파일 넣기`
   keeps the existing file import (`PDF · EPUB` is only a label; `.txt` stays
   accepted). A failed or cancelled import stays on the choice screen.
   `둘러볼게요` marks the guide done and paints Home.

`prefers-reduced-motion: reduce` drops the burst nodes and the timed motion,
and still reaches the sentence, the pill, the save, and the choice screen.
The idle wait stays unless the reader taps.

`onboardingOwnsReader()` stays false. The empty hooks
`onboardingAppearanceOpened`, `openOnboardingWord`, `renderOnboardingWordDetail`,
`explainOnboardingSentence`, and `goOnboardingPage` remain so older callers do
not throw. `goOnboardingPage(0)` shows the word; any later page shows the choice.

## Long-press tip

After three successful Reader word opens (`breeze.reader.word-taps`), once,
the app highlights one sentence and shows a glass tooltip inside the page
column: `문장을 꾹 눌러보세요` / `문장 전체 해석을 볼 수 있어요`, with a close
control. `breeze.reader.longpress-tip` is `shown` at display and `dismissed`
on close or on a sentence long-press. A long-press before the tip appears also
dismisses it, so it never shows later. There is no separate vocabulary tip.

## Events

`onboardTrack` calls `breezeTrack`, `trackEvent`, or `recordEvent` when one of
those functions exists, and always adds `onboarding_version: 'v2'`. Until an
events logger is present the call does nothing. Names used by this guide:
`onboarding_start`, `onboarding_step_complete`, `onboarding_step_skip`,
`first_word_tap`, `first_lookup_success` (`source` `canned` or `dict`),
`vocab_save`, `onboarding_choice` (`choice` is a book id, `file`, or `browse`),
`longpress_tip_shown`, `longpress_tip_dismissed`.

## Retired

The welcome pen and the passive video carousel are no longer part of the app.
Their media files under `assets/onboarding/` are unused by the guide and are
left in place so this change does not rewrite the release-boundary asset list.
