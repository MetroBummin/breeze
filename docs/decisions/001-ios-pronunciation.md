# iOS pronunciation playback

## Problem and confirmed cause

The pronunciation button used only `window.speechSynthesis`. The native shell did not own an audio session, output route, cancellation, or lifecycle state. A dictionary MP3 field was not part of the playback path.

This proves that iOS playback depended entirely on WKWebView Web Speech. It does not prove which WebKit or device condition caused the reported silence.

## Decision

Keep Web Speech for browsers. In the iOS shell, route an explicit button press through the existing WKWebView message bridge to `AVSpeechSynthesizer`. Activate `AVAudioSession` as `.playback` with `.default` mode and `.duckOthers`. A new tap cancels the prior utterance immediately. Backgrounding cancels speech; the next tap creates a fresh session. Only the native `didStart` callback may show the playing state, and setup errors are reported as failures.

Use no explicit AirPlay, Bluetooth, speaker, or retry-routing options. Output follows the system route; `.duckOthers` remains so short pronunciation playback lowers other audio temporarily. This is a compatibility-oriented reduction of the requested audio-session combination, not proof that `.spokenAudio` or `.allowBluetoothA2DP` individually caused Build 108's category failure.

Native failures carry a stable stage (`bridge-postMessage`, `audio-session-category`, `audio-session-activate`, `voice-selection`, or `delegate-didStart-timeout`), separated `NSError` domain/code/description, the requested category/mode/options, and bundle version/build. The device log records each transition. The last error remains available as `window.__breezeLastNativeSpeechDiagnostic` and is not replaced by later successful events; the failure prompt exposes the same content for selection and copying without including the spoken word or book text.

## Alternatives reviewed

- Keep Web Speech on iOS: rejected because it does not provide reliable control of the silent switch, audio route, or app lifecycle.
- Download dictionary MP3 first: rejected because it adds network latency and another failure path, and does not solve audio-session ownership.
- Add a TTS service or dependency: rejected as unnecessary and outside scope.

## Invariants

- Browser pronunciation keeps using Web Speech.
- Repeated taps do not queue or overlap speech.
- A request being accepted is not presented as audible success.
- Native setup failure clears the playing state and is visible to the user.
- A queued utterance that never reaches `didStart` fails with a diagnostic stage instead of hanging silently.
- A late callback from a cancelled generation cannot cancel the new generation's deadline or deactivate its audio session.

## Verification

- Type checks and the native speech contract test pass.
- `npm run ios:sync` and a non-booting command-line iOS build are required before release handoff.
- Actual audibility, silent-switch behavior, Bluetooth output, and foreground return remain physical-device checks.
- Build 108 established the category-stage failure but did not expose the underlying `NSError`, so no single removed option is recorded as the confirmed cause.
- The next Archive is build 109 so its copied diagnostic can be distinguished from the failed Build 108 result.

## Word flashcards (2026-10-30, #309)

The study-set card (`#study-sets-flashcard`) and the All Words card (`#review-flip`) show one speaker button on the English side. It calls the same `speak()` as the lookup panel, so iOS still goes through `breezeSpeech` and `AVSpeechSynthesizer` with the `.playback` session above. That means the silent switch behaves the same as for lookup pronunciation, and browsers still use Web Speech. No new audio path, dictionary MP3 or TTS service is added.

- Button only. Breeze has no auto-play setting, so a card never speaks by itself.
- `speak(text, buttonId)` takes the id of the button that shows the playing state. Cards re-render on flip and keep the same id, so late start/end events reach the current button.
- `stopSpeech()` raises the generation and sends the existing native `cancel` command (or `speechSynthesis.cancel()`). Grading, undo, leaving the study screen and showing a different word all call it. Flipping the same card does not.
- When neither Web Speech nor the native bridge exists, the button is hidden and the card works as before.
- A tap on the speaker never flips the card. A drag that starts on it still swipes or scrolls the card and does not play audio.

`tests/verify-study-card-speech-browser.mjs` covers Web Speech, a stubbed native bridge and the no-engine case in both card surfaces. Actual audibility and the silent switch remain physical-device checks.
