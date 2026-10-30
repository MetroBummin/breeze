# #309 before/after: pronunciation on word flashcards

Captured by `tests/capture-study-card-speech-browser.mjs` in Chromium (Playwright 1.64),
front side of the first card, device scale 2. Korean glyphs render as boxes because the
CI image has no Korean font; the app ships its own.

- `chromium-set-*`: study-set card (`#study-sets-flashcard`).
- `chromium-all-*`: All Words card (`#review-flip`).
- `*-before.png`: `main` at `58532937`, no speaker.
- `*-after.png`: this PR. The speaker sits at the bottom centre of the English side,
  so a tap in the middle of the card still flips it.
- `*-after-playing.png`: right after a tap on the speaker (playing state).

Viewports: phone 390×844, tablet 820×1180, desktop 1440×900, short 844×390.
Running the script with `BREEZE_CARD_SPEECH_OUTPUT=<dir>` writes every viewport in
light and dark.
