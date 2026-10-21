# Passive onboarding carousel

## Decision

The approved PR124 welcome is selectively preserved: flow wordmark proportions and palette,
‘브리즈에 오신 걸 환영해요’, ‘막힘없이 읽는 새로운 방법.’ and ‘시작하기’.
Fresh sessions always show it first; replay also starts there. The first welcome
draws one open hand-authored centerline following the Breeze flow lettering.
The visible stroke replaces the broad image mask, which exposed disconnected
future ink near letter crossings. The same centerline renders the static welcome.
Its connected cursive loops and joins replace six independent letter starts.
The first glyph retains the brand's single-bowl looped b form, rather than
redesigning it as a textbook two-bowl capital B. Its entry climbs the right
side of the ascender loop, turns left at the top and descends the stem, then
rises through the bowl and exits over the existing lower curve into r.
This reverses the rejected ascender direction and removes its extra upper-bowl
circuit. The short lower-curve retrace is intentional connected handwriting.
The 2026-10-09 user-requested b-to-r repair keeps that entire b retrace and the
original r entry/later letters. Only the two quadratic exit segments become one
cubic segment with the same endpoints. Its first handle follows the incoming
b tangent; its last handle preserves the former r-entry tangent. This removes
the approximately 36-degree exit turn without redrawing any letter or changing
the original cursive brand asset. The original stored wordmark and actual app
middle/final frames are shown together in ../qa/welcome-join-20261009/README.md.
Writing, hold, caption timing/easing and all welcome session behavior stay unchanged.
Formation references: [Dynamilis](https://dynamilis.com/handwriting/cursive/b)
and [Scribble](https://scribble.app/cursive/b); school capital B differs and
Scribble explicitly lifts before the next letter. This brand adaptation keeps
the required connected hand instead of claiming one universal B form.
A single inherited pen timeline traverses its geometric length
with one linear envelope, without resetting speed per letter.
The pen writes for 3.8s, holds the complete word for 750ms, then
shows the existing caption, note and Start button together over 900ms (opacity
and 8px translation). Total: 4.65s. This replaces the rejected 2s preview.
No Apple glyph, logo, font, path or shader is included in the app.

The welcome viewBox carries 20 units of padding on every side. The authored
centerline itself reaches the old viewBox edges and its 26-unit stroke was
clipped by up to ~3 units at the first letter's extremes; the letterforms and
centerline are unchanged.

The 750ms hold follows the installed Apple macOS HelloMetrics writeInHold
runtime value. A 2026-10-21 frame analysis of recorded macOS setup-assistant
hello cycles has since measured the Apple pen directly: normalized progress
stays within ±0.04 of linear and writing time scales with path length
(correlation 0.95). The timeline now follows that measurement — linear easing
at a comparable pen speed (Apple writes 5–7 letter words in 2.5–2.9s).
Owner review of the first cut found the measured 3.0s write too fast in
context, so the write is 3.8s; the envelope stays linear.

A tap anywhere completes the reveal immediately and consumes that tap without
navigating. The independent `breeze.onboarding.welcome-seen` marker is set on
first entry (including reduced motion), so cancellation/reload and Settings
replay show the static welcome. Reduced motion, backgrounding, leaving welcome
and cancellation finish/cancel the same session timer; replay never waits.
Existing guide completion/progress keys and the rest of the carousel are unchanged. Interrupted first
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
high-resolution JPEG poster. The approved 2026-10-08 refresh renders one new
production frame at each 1/30s timeline sample, without old-video input, pixel
upscaling or duplicated motion frames. The 2026-10-21 refresh supersedes the
sampling rate: one new production frame at each 1/60s timeline sample, encoded
at 60fps under the same no-reuse, no-upscale and no-duplicated-frame rules. Phone UI clips are captured at device
scale2; the existing 820×1180 PDF viewport is encoded directly at its native
resolution instead of the former 410×590 downsample. Encoding preserves each
source frame once at60fps with adequate bitrate and fast-start metadata.
Word/sentence clips contain a single authored sentence and the real
result surfaces, cropped at capture time. Settings/PDF/Home retain their actual
controls to teach their locations. No user, student or private document is used.
Capture response fixtures supply authored Korean meanings and explanations;
no AI request, auth change, quota charge or durable user-data write is performed
by the guide. The film is not a simulated interactive Reader.

Selected layout 1 retains media above caption and compact centered progress.
Explanation pages now expose two concise 52px Previous/Next buttons. Seven progress marks occupy exactly 96px (5px dot,
18px active mark, 8px gaps), matching the selected original. Dots are indicators,
not seven 44px buttons. Previous/Next, horizontal swipe over media or captions, and keyboard arrows own
navigation. Swipe returns from the first explanation to welcome and clamps at
both ends. The final non-video page offers “책 넣기” and “건너뛰기”. Every page
except the welcome also offers Skip in a visually minimal form (13px, muted);
the welcome keeps only the wordmark and its start button (owner review).
On the study page Skip advances to the final import page, and on every other
page it ends the guide like the final page's Skip. Above the final page's
prompt, a decorative shelf reuses the landing carousel mechanism — the same
book/article cards in two identical sets on one 30s linear loop with edge
fade and no pointer input. In the shelf the cards show covers only — the
author/title/source lines are hidden there because at shelf size they sit on
top of the cover art and collide with it. Escape/browser Back cancels
without recording completion; returning from Settings replays from welcome.

The overlay never opens a book or changes its appearance, scroll, words, sync,
cache or history. Existing Reader and dialog controls become inert during the
guide and restore their exact previous inert state on exit. External navigation
cancels the guide rather than covering the newly opened view. Startup does not
render/feed-fetch hidden Home beneath the welcome. Explicit Skip or a successful durable book import reveals the prior
view through its existing renderer and persists the original ‘done’ marker.
The final file picker accepts PDF/EPUB/TXT and calls the existing `importFile`
owner with a session AbortSignal. Picker cancellation and import failure leave
the final page available for retry or Previous. Back, Skip, cancellation, replay
and external navigation abort pending preparation and invalidate its completion
callback. The importer owns durable commits; the guide does not roll back a
book already committed. An interrupted fresh final page resumes on reload.
Settings replay always starts from welcome and does not replace existing data.

Only the visible video plays. While a scene plays, the next scene's video also
receives a source and loads (primed), so a forward turn starts without the
load hitch; navigation pauses and unloads every video beyond the active and
next scenes, and priming stops in poster-only states (reduced motion, paused,
hidden). Session cancellation invalidates outstanding play promises. Nothing
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
pins the approved progress geometry. The welcome preserves PR124's layout, copy and materials; its flow lettering
uses the connected centerline candidate to avoid wide-mask leakage.
Actual intermediate pen progress, delayed caption and completed-word hold are
checked along with tap completion, close/restart/reload and live reduced motion.

Production Reader/gesture/auth/native-launch boundaries remain pinned; full
`npm test`, www packaging and exact-remote-SHA CI are required for this draft.
Browser emulation and codec metadata do not prove physical iOS/Android playback
or pen hardware acceptance. No merge, deployment or native upload is authorized.

## Independent Settings authentication

Settings social login is documented in [016](016-social-auth.md). Its request/session owner remains independent of the passive guide. The integration boundary verifies both approved scopes.

## Welcome timeline ownership correction

The welcome's CSS animations own writing3800ms, hold750ms and caption fade900ms.
The former JS wall timer could remove those animations before a delayed WebKit
animation timeline reached pen===1. Complete on the actual next-caption
`onboard-welcome-copy` animationend instead, guarded by the current session and
welcome state. Existing abort/skip/hidden/reduced-motion paths still finish
explicitly. CSS durations, continuous stroke, exact pen===1, hold and30s test
limits remain unchanged. Chromium passed the strict full suite; exact-head
WebKit CI is required, not substituted by local Chromium evidence.


## Study media follow-up after 269

The appended study page now uses the same passive video/poster path as existing
features, superseding the 269 required interactive practice. Next is immediately
available; its Skip reaches the existing final import page. Settings replay and
first-run interruption/resume retain the same owner and progress key. Examples
in the media are isolated authored data captured from the real production card
UI, with no AI/network lookup or changes to live vocabulary/study data. Muted
inline loop playback, tap pause, reduced-motion poster and playback-error poster
are shared with prior slides. No physical iOS playback claim follows from browser
verification. The 2026-10-21 refresh re-renders the study media with the same
stepped 1/60s method as the other scenes (780×1280 at deviceScaleFactor 2,
60fps), replacing the earlier real-time 30fps recording.
