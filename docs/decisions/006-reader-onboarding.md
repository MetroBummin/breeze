# Passive onboarding carousel

## Decision

The approved PR124 welcome is selectively preserved: original flow wordmark,
‘브리즈에 오신 걸 환영해요’, ‘막힘없이 읽는 새로운 방법.’ and ‘시작하기’.
Fresh sessions always show it first; replay also starts there. Interrupted first
runs resume their saved explanation page. The original completion key
`breeze.onboarding.v1` remains authoritative. Readers with existing local books,
vocabulary, tombstones or positions are not interrupted.

The former action-gated temporary Reader is replaced by a passive overlay.
Seven authored scenes describe word tap, chevron, sentence hold, easy explanation,
right-side Aa settings, PDF annotation and finally Home bookmark → Breeze Memory.
PDF is conditional on the annotation owner's capability. Until its shared public
capability is available, the verified native iPad flag is the conservative fallback;
web/phones do not receive a pen lesson based on viewport or touch guesses.

Each scene uses a silent H264 Baseline/AVC MP4 of the real production UI, plus a
JPEG poster. Word/sentence clips contain a single authored sentence and the real
result surfaces, cropped at capture time. Settings/PDF/Home retain their actual
controls to teach their locations. No user, student or private document is used.
Capture response fixtures supply authored Korean meanings and explanations;
no AI request, auth change, quota charge or durable user-data write is performed
by the guide. The film is not a simulated interactive Reader.

Selected layout 1 owns media above caption, compact centered progress and one
wide bottom Next/Complete. Seven progress marks occupy exactly 96px (5px dot,
18px active mark, 8px gaps), matching the selected original. Dots are indicators,
not seven 44px buttons. Next, horizontal swipe, keyboard arrows and an accessible
previous control own navigation. There is no Skip. Escape/browser Back cancels
without recording completion; returning from Settings replays from welcome.

The overlay never opens a book or changes its appearance, scroll, words, sync,
cache or history. Existing Reader and dialog controls become inert during the
guide and restore their exact previous inert state on exit. External navigation
cancels the guide rather than covering the newly opened view. Startup does not
render/feed-fetch hidden Home beneath the welcome. Completion reveals the prior
view through its existing renderer and persists the original ‘done’ marker.

Only the visible video receives a source. Navigation pauses and unloads every
other video; session cancellation invalidates outstanding play promises. Nothing
is loaded during welcome. Background/pagehide pauses playback, pageshow resumes.
Reduced motion shows posters without downloading video; autoplay/codec failures
fall back to the poster. Media tap or Space/Enter pauses/replays without adding
a visible playback bar. Image/video assets are loaded only for the current theme
and current explanation. Native packaging contains both themes.

## Verification

`npm run test:onboarding` exercises web/native-shell emulation, six/seven-page
capability selection, real Next taps, pointer swipe/cancel, keyboard previous,
rapid navigation, first-run cancellation/reload/resume, completion persistence,
replay, visibility interruption, autoplay failure, reduced motion, decoder source
ownership and an existing Reader's data/position/appearance/history isolation.
It checks phone, narrow, tablet, desktop and short/landscape in both themes and
pins the approved progress geometry. The original light phone welcome is compared
with PR124's saved approved PNG and matches every pixel.

Production Reader/gesture/auth/native-launch boundaries remain pinned; full
`npm test`, www packaging and exact-remote-SHA CI are required for this draft.
Browser emulation and codec metadata do not prove physical iOS/Android playback
or pen hardware acceptance. No merge, deployment or native upload is authorized.
