# Three-card onboarding carousel

## Decision

First-run and Settings replay show one dialog with three cards.
There are no previous/next buttons and nothing advances on a timer.
The cards move on a horizontal scroll-snap track, with dots under each
card. A tap or an upward swipe on card 1 or 2 moves one card forward,
and a downward swipe moves back. That path does not wait on the video:
if `play()` rejects, the poster stays and the card still changes. The one
exception is a tap on the card's video while that video is paused or has
not started: the tap starts it and the card stays (see below).
Horizontal swipe and the arrow keys do the same. The dialog replaces the
former passive guide (welcome pen animation plus seven recorded scenes),
which the owner discarded on 2026-10-27 in favour of the minimum-click
carousel reviewed as the standalone `onboarding-carousel.html` page. The
former guide's record stays in git history and `docs/qa/`; this record
describes only the carousel that ships.

Card 1 plays the word-tap clip with “단어를 탭해보세요 / 단어에 딱 맞는
뜻이 나옵니다”. Card 2 plays the wordbook clip with “홈에서 북마크를
탭해보세요 / 단어장에서 학습이 가능합니다”. Card 3 is a DOM cover fan
for choosing a book. Card 2's wide clip scrolls at one constant speed
from start to end (linear, about 18.5px per frame): the earlier
decelerating glide read as stutter on real displays, and the owner asked
for the same constant feel as the flashcard swipe. The curve must not be
changed back without re-checking per-frame travel on the encoded video.
Each video carries a poster frame extracted from the video itself (tall
and wide renders, swapped at the same 768px breakpoint), so
reduced-motion users see a still instead of an empty area without any
video download.

Videos switch by viewport, not by theme: phones play the 9:16 renders,
tablets and desktops the 4:3 renders, through `<source media>` at 768px.
Only the snapped card plays; the other video stays paused. Playback is
tied to that card index. Card 1's clip is parsed inside the hidden
dialog (`display:none`). iOS WebKit (Safari and Chrome on iPhone) gives
that element no renderer, ignores `preload`, and rejects `play()` in the
same turn the dialog opens — there is no user gesture, and Low Power Mode
rejects even a muted play. Desktop Chrome accepts that call and starts
when data arrives, which is why a Windows laptop plays card 1 immediately.
The previous retry called `load()` and `play()` once more and then stopped,
so the poster stayed until a later swipe (a gesture) ran playback again.
Opening the dialog now waits until it is visible, detaches the current
video, sets `muted`, `playsinline` and `autoplay` with `preload="auto"`
while it is detached, and inserts it again. The `<source>` children move
with the element; nothing assigns `src`. That is the same playback path a
card change uses, including the card that is open at the start. A rejected
`play()` retries on `loadeddata` / `canplay`.

The open path no longer waits only on two animation frames. On a busy boot
WebKit can hold the first frames for over a second (CI measured 1.0s and
1.6s gaps while 100ms timers kept running), so `play()` first ran about
2.6s after the dialog appeared and card 1 sat on its poster for ~3s. The
open now forces layout and starts playback from a 60ms timer, with the
two-frame call kept as a backstop. The CI log prints the card 1 media
timeline (play, metadata, canplay, playing and the fetch).

On a real iPhone, card 1 could still open on WebKit's native start-playback
button (autoplay refused, e.g. Low Power Mode, or the clip not started yet),
and tapping that button jumped to card 2: the carousel owned the tap, and
the old one-shot touch unlock only ran when a `play()` rejection had been
recorded. The videos have no `controls` attribute, and `onboarding.css`
hides `::-webkit-media-controls-start-playback-button` unless `play()` was
actually refused (`data-onboard-rejected`, set only for `NotAllowedError`).
In that state the button is the hint to tap; a load failure keeps the
plain poster. Safari plays MP4 only from a server that answers byte-range
requests with 206: `python3 -m http.server` ignores `Range` and returns
200, so on Mac Safari the clip never loads there. GitHub Pages and the
test server support ranges. A tap whose target
is the current card's video, while that video is paused, ended or has not
started, is owned by the video: `startOnboardingVideoFromTap` calls
`play()` inside the gesture (capture phase, before the carousel reads the
tap) and the carousel does not advance. Pointer and touch events for one
physical tap reuse the first one's decision. Once the clip plays, a tap
advances as before; if a tap-started `play()` is refused too, the next tap
advances so the reader cannot get stuck. Swipes, and taps on the copy or
dots, always move the card.

All of this covers every video card (1 and 2; card 3 is the cover fan and
has no video). Card 2 was the one TestFlight 1.9.9 (build 361) still showed
with the play button some of the time. It never autoplays from the
attribute: it is paused at open, and `pause()` clears the element's
can-autoplay flag, so its only start is the `play()` a scroll event issues
in the middle of the swipe. If WebKit refuses that call while the card is
still moving and its load events have already passed, nothing asked again.
The carousel now asks the card in view once more when it comes to rest
(`scrollend`, with a 140ms quiet-scroll fallback), and the retries also run
on `loadedmetadata` and `canplaythrough`. A playing clip is left alone.
Card 2 stays unloaded until it is the card in view. Reduced motion fetches
nothing at all — videos stay paused and the copy and dots still carry the
meaning. The clips are silent H264 MP4s of the real production UI, the
same no-reuse, no-upscale, 60fps capture rules as the former guide's media.

Card 3 shows five covers at rest: one main cover in the centre and two
on each side, sized 1 / 0.82 / 0.66, each further pair behind the one
before it. There are no arrows. Tapping a visible sliver of a side cover
centres it; the strip wraps infinitely through five copies of the same
seven books, and the title, author and read button follow the centred
book. The centred book starts on Alice. The seven books are the bundled
long reads (Gatsby, Alice, the four Holmes stories and Hound), opened
through the existing long-read import, so a saved copy is reused and a
new one opens in the Reader. The fan's layout boxes are never
transformed — only the images inside move and scale — because Chrome
snaps to transformed boxes and the snap points would drift. The
media-query block that widens the card and caps cover height on
tablet/desktop must stay after the base fan rule or the cap silently
stops working. The cap is the fan's own height, not a `100vh` slice:
every card is the same height, so a viewport cap on the cover alone was
what left card 3 shorter than the video cards.

Every cover, centre and peeking, is 2:3. Its size is one length,
`--cover-h = min(0.84 × fan width, fan height − 52px)` (0.87 at 768px and
up), and the box is `width: --cover-h × 2/3; aspect-ratio: 2/3;
height: auto`. TestFlight 1.9.9 (build 361) showed tall, narrow covers
with their titles cut off. The cause was the phone layout from #289
setting `--cw: 100%`. A `%` inside a custom property resolves where it is
used, so the same `--cover-h` meant 84% of the fan's *height* in `height`
but 84% of its *width* in `flex-basis`, the overlap margin and the
padding. At 390×844 that made a 122×427 box (0.29 instead of 0.67), and
`object-fit: cover` cropped the art to fit it. Tablet and desktop were
off too (0.84 and 0.73), because the `100%` height cap had the same
mismatch. iOS 15 has no container query units, so `buildOnboardingFan`
writes the card's content width and the fan's height as `--fan-w` /
`--fan-h` px (ResizeObserver plus `resize`), and the CSS uses only those
lengths. The cover width is capped at 0.56 × the card width, and the
outer pair sits 1.66 cover widths across, so five covers fit even at
320px without squeezing. They get smaller, not narrower, and the
existing edge fade still hides any cover that would cross the card
edge.

The depth layout reads every slot's fractional box
(`getBoundingClientRect`) before writing, and the step is the strip's
mean spacing. `offsetLeft` rounds to whole pixels; with small covers (a
short landscape card) that error let the ±3rd cover in and seven showed
at rest. Scaling one slot's offset by its index instead overshot the
other way in WebKit and left three. At rest there are five covers, all
2:3. All three cards are one box
(`.onboard-card { height: 100% }` in one stretched track); there is no
card-specific height. Measured identical in Chromium and WebKit at
390×844, 768×1024, 1440×900, 1920×1080 and 1920×1113, at open and after
landing on card 3.

Each card carries its own dots; the dialog itself has no page
navigation. The three card 3 buttons are “바로 읽기” (the centred book),
“내 파일 넣기” (the existing PDF/EPUB/TXT importer, same handoff as
before: a successful durable import ends the guide, cancellation and
failure leave the card available), and “둘러볼게요” (home). Import and
book-open failures report on a status line inside card 3, because the
app-wide toast is routed to the home notice behind the overlay and
would never be seen here. Below 768px the onboarding fills the screen
edge to edge: no rounded card, shadow or outer margin, and the background
is the Home background `#F2F2F7`. Safe-area insets (`env(safe-area-inset-*)`)
pad the copy and the controls. Skip is a small grey link at the top right
of that screen, 18px below the safe area and 18px in from the right, on
every screen. At 768px and above the inset white card is unchanged, and
Skip sits inside that card, 18px from its top and right edges, not in the
gray margin. The dialog is one visual viewport: `#onboarding` is fixed to
`visualViewport` (with `100dvh` before that measurement),
`html.onboarding-open` locks the document, and the stage is not a scroll
container. iOS Safari's toolbar is inside that measurement, so the page
does not scroll. All three screens share one width, height and vertical
position. Card 3's fan flexes inside that same box. Guidance copy stays
polite (존댓말), there is no focus outline, and the dialog surface is
the home background `#F2F2F7` in light mode.

The carousel surface stays light in both themes. The standalone page is
light-only, and forcing the dialog light keeps copy, the video hairline
and the dots readable without a second set of values; the rest of the
app is unaffected because the dialog is a full-screen overlay.

The completion key `breeze.onboarding.v1` remains authoritative: readers
who finished the former guide never see the carousel, and readers with
existing local books, vocabulary, tombstones or positions are not
interrupted. There is no per-page resume: an interrupted run reopens on
the first card, and a stale progress marker from the former guide is
removed on open. Settings replay always starts on the first card and
does not replace existing data. Escape and browser Back cancel without
recording completion; explicit Skip, a book choice, a successful import
or Browse records completion. External navigation ends the guide. The
first-party funnel events survive the carousel: moving to a later card
reports `onboarding_step_complete` for the card left behind (steps
`word`, `study`, `books`), Skip reports `onboarding_step_skip`, and a
book choice, a successful import or Browse reports
`onboarding_step_complete` with step `finish` alongside the choice
event. Escape and browser Back report nothing. The
guide never opens a book or changes appearance, scroll, words, sync,
cache or history while it is open: the views behind it are inert and
restore their exact previous state on exit.

## Verification

`npm run test:onboarding` exercises the carousel dialog: three cards
and per-card dots, exact card copy, video source switching and
play-only-the-visible-card, card 1's `currentTime` advancing on open
with no interaction (a phone is inside about 1.5s; the check allows
2.5s for a slow runner and then requires the clock to keep moving), a Low Power-style `play()`
rejection where a real touchscreen tap on card 1's video starts it and
stays on card 1 (the next tap advances), no `controls` attribute and, on
WebKit, the hidden start-playback button, the same refusal and tap on
card 2, card 2 playing once the carousel settles after a refused mid-swipe
`play()`, advance by tap and swipe-up
even when `play()` rejects, constant-speed card 2 travel is pinned by
the reviewed video file itself, dots following scroll and arrow keys,
the five-cover rest state, every visible cover at 2:3 at each layout size
and on the iPhone profile, tap-to-centre with title/author/button
following, read/file/browse/skip/Escape paths, import
cancellation/failure/interruption, completion persistence and replay,
existing Reader isolation, reduced motion (paused, no media fetched),
visibility interruption, equal screen boxes, the skip inset, no document
or stage scroll, full-bleed phone layout under 768px, the card layout at
768px and above, and the phone/tablet/desktop/short layouts in both
themes with the light dialog surface. WebKit runs the playback check
with Playwright's iPhone 13 profile. The standalone reference page stays
in the repo at `onboarding-carousel.html` so the reviewed feel can be
re-checked without the app shell. The shipping dialog keeps that
carousel, and also fits one visual viewport.

Production Reader/gesture/auth/native-launch boundaries remain pinned;
full `npm test` stays green. Browser emulation, including an iPhone
device profile, does not prove a physical iPhone. This playback and
phone-layout change ships with the site that deploys from main. No
native upload is part of it.
