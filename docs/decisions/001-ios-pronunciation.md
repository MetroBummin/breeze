# iOS pronunciation playback

## Problem and confirmed cause

The pronunciation button used only `window.speechSynthesis`. The native shell did not own an audio session, output route, cancellation, or lifecycle state. A dictionary MP3 field was not part of the playback path.

This proves that iOS playback depended entirely on WKWebView Web Speech. It does not prove which WebKit or device condition caused the reported silence.

## Decision

Keep Web Speech for browsers. In the iOS shell, route an explicit button press through the existing WKWebView message bridge to `AVSpeechSynthesizer`. Activate `AVAudioSession` with the playback/spoken-audio category, Bluetooth A2DP and AirPlay routing, and ducking. A new tap cancels the prior utterance immediately. Backgrounding cancels speech; the next tap creates a fresh session. Only the native `didStart` callback may show the playing state, and setup errors are reported as failures.

## Alternatives reviewed

- Keep Web Speech on iOS: rejected because it does not provide reliable control of the silent switch, audio route, or app lifecycle.
- Download dictionary MP3 first: rejected because it adds network latency and another failure path, and does not solve audio-session ownership.
- Add a TTS service or dependency: rejected as unnecessary and outside scope.

## Invariants

- Browser pronunciation keeps using Web Speech.
- Repeated taps do not queue or overlap speech.
- A request being accepted is not presented as audible success.
- Native setup failure clears the playing state and is visible to the user.

## Verification

- Type checks and the native speech contract test pass.
- `npm run ios:sync` and a non-booting command-line iOS build are required before release handoff.
- Actual audibility, silent-switch behavior, Bluetooth output, and foreground return remain physical-device checks.
