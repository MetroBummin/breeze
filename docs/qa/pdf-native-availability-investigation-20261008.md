# PDF annotation availability investigation — 2026-10-08

Status: native-only restriction with the user-approved Android tablet policy. Base: main
`e7b61d5304d20d639d45fc8dd23116db5d6446e5`. Isolated local branch:
`codex/pdf-native-availability`. No merge, deploy, data deletion, or onboarding /
MemoryUI edits.

## Approved Android policy

The user accepted Android tablet-only button availability with pen-only actual
input, including the tradeoff that a penless tablet can show the button. Model
allowlists are not required. The implementation uses native built-in display
configuration as a tablet-class policy; it does not promise pen hardware detection.

The inspected public APIs do not establish both pen hardware compatibility and
tablet identity across supported Android versions/protocols. Do not invent a
`FEATURE_TOUCHSCREEN_STYLUS` PackageManager constant or treat its absence as a
hardware verdict.

## Evidence and limits

- Existing iOS `SceneDelegate.swift` publishes `breezeInkIPad` from native UIKit
  `.pad`, excluding iOS apps on Mac. It requires no attached Pencil and is stable
  across responsive viewport changes. The current boolean identifies iPad idiom;
  it is not itself a model-specific Apple Pencil compatibility inventory.
- Android registers a narrow read-only `BreezePdfPlatform` Capacitor plugin before
  bridge creation. `getCapabilities()` returns only `{tablet:boolean}`. It reads
  application-context resources for Display.DEFAULT_DISPLAY, requiring native
  LARGE/XLARGE screenLayout and normal UI mode, and excluding PC-feature devices.
  It adds no permissions or model inventory and uses APIs available on API 24+.
- [Context.createDisplayContext](https://developer.android.com/reference/android/content/Context#createDisplayContext(android.view.Display))
  adjusts resources to the given display and is a non-UI context. Starting from
  the application context and selecting the built-in display avoids Activity
  window-size overrides and external display resizing. The result is cached once
  per web-document load; responsive changes cannot independently admit a phone.
  This is an OS configuration category, not a universal manufacturer taxonomy.
  Foldable posture, unusual density overrides and vendor configurations remain
  physical acceptance cases. Native LARGE begins around 480x640 dp; XLARGE around
  720x960 dp. Neither means that a pen is present or supported.
- Android [InputDevice](https://developer.android.com/reference/kotlin/android/view/InputDevice#SOURCE_STYLUS)
  reports stylus-capable input sources. This is useful positive input-device
  evidence, but it does not identify tablet form factor; external drawing tablets
  may also advertise stylus sources. No input device / first pen event is not
  reliable negative evidence for built-in hardware compatibility.
- Android 14/API 34+
  [InputManager.getHostUsiVersion](https://developer.android.com/reference/android/hardware/input/InputManager#getHostUsiVersion(android.view.Display))
  reports display USI protocol support without asking for a pen contact. A null
  answer means no USI support, not no support for every other pen protocol. It
  does not establish tablet identity and is unavailable on older supported APIs.
- [Configuration](https://developer.android.com/reference/android/content/res/Configuration)
  offers normal/desk/car/TV/watch/etc. UI modes, without a distinct tablet mode.
  `smallestScreenWidthDp` measures available screen size; it is not acceptable
  hardware proof under this task's requirements.
- [MotionEvent stylus guidance](https://developer.android.com/develop/ui/views/touch-and-input/stylus-input/advanced-stylus-features)
  describes actual input and palm cancellation. It cannot resolve eligibility
  before pen use, and synthetic events cannot validate physical pen behavior.

## Current code and implementation handoff

Before this change, `scripts/reader/pdf-ink.js` admitted any runtime with
PointerEvent, TouchEvent, maxTouchPoints > 0, and scrollend (or the native iPad
flag). The partial change requires the native iPad flag or native Android using
[Capacitor's documented platform APIs](https://capacitorjs.com/docs/basics/utilities),
plus tablet classification from the native plugin and the existing Android
pointer input adapter capabilities. Native Android phones are denied; pending,
old wrappers without this plugin and bridge failures remain read-only.

`supported()` previously gated `open()` and `mount()` as well as writing UI.
This change separates PDF stored-ink loading / SVG readback from annotation
authorization. IndexedDB database, page keys, schemas, strokes, tool preferences,
and existing save-retry ownership are preserved.

The partial native gate is consumed by toolbar visibility, `setMode`, event
admission, `history` (including public undo), and `writing()`. Missing/throwing
Android bridge fails closed. A native platform update revokes editing by
cancelling unfinished contacts and resetting mode to read, without discarding
stored strokes or completed dirty saves. Android actual geometry remains owned
only by pointerType=pen with cancelable companion Touch admission; finger/mouse
input never draws. Existing palm filtering, scrolling, pinch and eraser/history
owners are retained.

Mode is initialized/reset to read in the current code. Persisted tool preference
is loaded as `lastTool`; activation and preference restoration must still pass
authorization. Audit caller paths/deeplinks at implementation time. Current ink
keydown handling closes settings on Escape; no write-activation shortcut was
found in the inspected ink module.

Onboarding task `01a11906-8462-77ff-90fb-824917f86009` should use the same final
eligibility owner for its optional PDF-writing step: await
`BreezePdfInk.availability()` before choosing steps, or use
`BreezePdfInk.available()` after initialization (false while pending). Both include
native eligibility and the input adapter requirement. Do not use `writing()`
state or pointer/touch capability alone as device eligibility.
Its branch/components were not edited.

## Draft behavior matrix

| Client | Write entry / activation | Stored annotation readback |
| --- | --- | --- |
| Desktop web, mobile web, installed PWA | Hidden / denied | Retained |
| iPhone native, Mac runtime | Hidden / denied | Retained |
| Native iPad, Pencil attached or absent | Available from native UIKit idiom | Retained |
| Native Android phone, even with pen input | Hidden / denied | Retained |
| Native Android tablet-class device, no attached pen or first pen event | Available with safe input adapter; actual ink pen-only | Retained |
| Native Android without safe input adapter, or missing/throwing bridge | Hidden / denied | Retained |

Orientation, split view, viewport width, coarse pointer and first pen event must
not change hardware eligibility. Matrix tests must also cover forced activation,
restore/last-tool state, undo, and existing stored ink on every restricted client.

## Completed independent checks

On exact unmodified base `e7b61d5304d20d639d45fc8dd23116db5d6446e5`:

```
node --test tests/verify-pdf-ink-regressions.mjs tests/verify-pdf-session-regressions.mjs tests/verify-pdf-visible-repaint.mjs tests/verify-pdf-scope-noop.mjs tests/verify-android-build.mjs
```

96 passed, 0 failed, 0 skipped. These are baseline contracts, not proof that the
new restriction works. Log: `/tmp/pdf-availability-baseline.log`.

Validation:

- 114 PDF/Android/input regression tests passed; typecheck passed without raising
  its existing baseline; structure checks passed.
- Full `npm test` passed.
- Installed Chromium passed `verify-pdf-availability-browser.mjs`: real PDF.js /
  IndexedDB readback on web/mobile web, simulated standalone PWA, native iPhone,
  native iPad, Android phone/tablet adapter cases, missing bridge/old wrapper and unsafe input
  adapter. Stored ink remained identical after hidden tool clicks, public undo,
  keyboard input and attempted pen events. Persisted last eraser tool did not
  activate writing; native capability revocation reset writing. Eligible clients
  retained eligibility across responsive/orientation changes. A denied capability
  reply does not close unrelated read-mode lookups. Restricted clients
  remained read-only at 320/390/820/1440 widths, portrait/landscape and short light /
  dark layouts. Native signals are mocked; this is not physical hardware evidence.
- Existing Chromium native-iPad ink suite and Android pointer ink suite passed,
  including highlighter, erasure, history, failed save/retry and durable reload.
- Android web asset sync passed; the generated ink bundle matches the source.
- New command: `npm run test:pdf-availability` (Chromium and WebKit by default).

Browser proof/logs are in `/tmp/breeze-pdf-availability` and
`/tmp/pdf-availability-*.log`. Playwright browser downloads returned 403 Domain
forbidden; installed `/usr/bin/chromium` was used. WebKit's initial new test failed
fixture import in a nonpersistent context; the test now uses persistent Blob
storage, matching existing PDF suites. CI on the earlier partial head confirmed
Android lint/debug APK/device-test APK/unsigned AAB and iOS simulator compilation;
final Android policy head requires its own compile and WebKit result. Android SDK
and Xcode are unavailable locally. The GitHub CLI token
is invalid, but the supported GitHub connector authenticated as MetroBummin;
no access restriction was bypassed.
