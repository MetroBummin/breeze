# 듣기 모드 (first version, trial)

## Scope

Read-aloud is offered only for the public-domain classics Breeze ships. The gate is `listeningBookEligible()` in `scripts/reader/listening.js`. A book qualifies only when all of these hold:

- it is a text book (`kind:'txt'`), not transient;
- it carries a `longReadId`, which only the catalog importer (`importLongRead`) sets;
- its catalog entry, or the attribution saved at import, has a public-domain license.

User EPUB/PDF/TXT, articles, RSS, AO3, previews and the CC BY-SA Homeward text get no button. A user upload with the same bytes as a classic is still the user's upload.

## Engine

The engine is the device's Web Speech `speechSynthesis` with an English voice. It prefers a local `en-US` voice and adds no server or network cost.

- **Word highlighting:** follows the utterance `boundary` events. Engines that send none, such as network voices, fall back to highlighting only the sentence.
- **Pausing:** pause, a speed change and opening a word all cancel the speech. Playing again restarts the current sentence. `pause()`/`resume()` are not reliable on Android Chrome or iOS.
- **Volume fade:** Web Speech cannot ramp volume. When a word is tapped, the dimmed text eases back to full contrast and the speech is cancelled.
- **Starting speech:** `startListening()` and "여기서부터 듣기" speak synchronously inside the tap, because iOS Safari drops a first `speak()` that is not started by a gesture.

## Ownership

- **Gestures:** `gesture.js` stays the only judge. Before it opens a word, the text surface asks `listeningWordTap()` whether the tap belongs to listening.
  - A tap on the sentence being read replays that sentence.
  - A tap on a word in another sentence pauses playback and opens the normal popup. Playback resumes from the start of the same sentence when the popup closes.
- **Long-press:** long-press behaviour is unchanged. The sentence surface gains a top item, "여기서부터 듣기". The failure pill keeps its approved single retry action, so listening from a sentence needs a successful (or cached) translation; ⏮/⏭ still work offline.
- **Sentences:** the same splitter as long-press, `bridgeSentences`, runs on the same `#rtext [data-pi]` elements.
- **Highlighting:** CSS Custom Highlights drawn over offset ranges, so lazy word-span hydration is untouched. Without Highlight support, light rectangles are drawn instead and the other text is not dimmed.
- **Auto-scroll:** uses `readerScrollTo`, so the bottom controls' collapse logic and the user-scroll detection both recognise it as a programmatic scroll.
- **Bottom row:** the dock row keeps its geometry. While listening, the pill widens to the full row and the side circles step aside, as they do when the chrome collapses.

## Storage

All values are kept on this device only and are not synced:

- the last sentence per book: `breeze.listen.v1:<bookId>`;
- the speed: `breeze.listen.rate.v1`;
- whether the one-time hint has been shown: `breeze.listen.hint.v1`.

## Not yet verified

- Audibility, the silent switch, background audio and the voice quality on real iPhones and Android devices.
- The iOS shell: WKWebView Web Speech is the engine here. Decision 001 routes word pronunciation to `AVSpeechSynthesizer` instead.
- Browser walk-through and captures: `npm run test:listening` uses a scripted voice.
