# Three-card onboarding carousel

## Decision

First-run and Settings replay show one dialog with three cards.
There are no previous/next buttons and nothing advances on a timer.
The cards move on a horizontal scroll-snap track, with dots under each
card. A tap or an upward swipe on card 1 or 2 moves one card forward,
and a downward swipe moves back. That path does not wait on the video:
if `play()` rejects, the poster stays and the card still changes.
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
tied to that card index, not to an intersection ratio: `preload="none"`
left card 1 with no box until metadata arrived, a 0.6 observer never
fired, and a rejected `play()` was ignored, so the first screen stayed
on its poster and a phone could not leave it. A rejected `play()` retries
once via `load()`. There is no autoplay attribute: nothing is fetched
until a card is shown, and reduced motion fetches nothing at all — videos
stay paused and the copy and dots still carry the meaning. The clips are silent
H264 MP4s of the real production UI, the same no-reuse, no-upscale,
60fps capture rules as the former guide's media.

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
tablet/desktop must stay after the base fan/cover rules or the cap
silently stops working. The cap is the fan's own height (`100%`), not a
`100vh` slice: every card is the same height, so a viewport cap on the
cover alone was what left card 3 shorter than the video cards.

Each card carries its own dots; the dialog itself has no page
navigation. The three card 3 buttons are “바로 읽기” (the centred book),
“내 파일 넣기” (the existing PDF/EPUB/TXT importer, same handoff as
before: a successful durable import ends the guide, cancellation and
failure leave the card available), and “둘러볼게요” (home). Import and
book-open failures report on a status line inside card 3, because the
app-wide toast is routed to the home notice behind the overlay and
would never be seen here. Skip stays
a small grey link inside the card's top-right, 18px from the card's top
and right edges, on every card. It is not pinned to the viewport corner
and it does not sit in the gray margin when a card is shorter. The dialog
is one visual viewport: `#onboarding` is fixed to `visualViewport` (with
`100dvh` before that measurement), `html.onboarding-open` locks the
document, and the stage is not a scroll container. iOS Safari's toolbar
is inside that measurement, so the page does not scroll. All three cards
share one width, height and vertical position, sized so the video, dots
and copy fit. Card 3's fan flexes inside that same box. Guidance copy stays
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
play-only-the-visible-card, advance by tap and swipe-up even when
`play()` rejects, constant-speed card 2 travel is pinned by
the reviewed video file itself, dots following scroll and arrow keys,
the five-cover rest state, tap-to-centre with title/author/button
following, read/file/browse/skip/Escape paths, import
cancellation/failure/interruption, completion persistence and replay,
existing Reader isolation, reduced motion (paused, no media fetched),
visibility interruption, equal card boxes, the skip inset inside the
card, no document or stage scroll, and the phone/tablet/desktop/short
layouts in both themes with the light dialog surface. The standalone
reference page stays in the repo at `onboarding-carousel.html` so the
reviewed feel can be re-checked without the app shell. The shipping
dialog keeps that carousel, and also fits one visual viewport.

Production Reader/gesture/auth/native-launch boundaries remain pinned;
full `npm test`, www packaging and exact-remote-SHA CI are required for
this draft. Browser emulation and codec metadata do not prove physical
iOS/Android playback. No merge, deployment or native upload is
authorized.
