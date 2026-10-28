# Three-card onboarding carousel

## Decision

First-run and Settings replay show one dialog with three cards.
There are no previous/next buttons and nothing advances on a timer.
The cards move on a horizontal scroll-snap track, with dots under each
card. A tap or an upward swipe on card 1 or 2 moves one card forward,
and a downward swipe moves back. A tap always advances: cards 1 and 2
are animated-WebP `<img>` that loop on their own, so there is no video
to start and no tap-to-play exception.
Horizontal swipe and the arrow keys do the same. The dialog replaces the
former passive guide (welcome pen animation plus seven recorded scenes),
which the owner discarded on 2026-10-27 in favour of the minimum-click
carousel reviewed as the standalone `onboarding-carousel.html` page. The
former guide's record stays in git history and `docs/qa/`; this record
describes only the carousel that ships.

Card 1 shows the word-tap animation with “단어를 탭해보세요 / 단어에 딱 맞는
뜻이 나옵니다”. Card 2 shows the wordbook animation with “홈에서 북마크를
탭해보세요 / 단어장에서 학습이 가능합니다”. Card 3 is a DOM cover fan
for choosing a book. Cards 1 and 2 are animated WebP (`card1.webp` /
`card2.webp` and their `-wide` variants) rendered as a plain `<img>`:
60fps, infinite loop, and always starting from frame 0. An `<img>` needs
no autoplay, no `NotAllowedError` handling, no poster fallback, no
`<video>` element and no play button, so the whole video-playback
subsystem (`presentOnboardingVideo`, `playOnboardingVideo`,
`stopOnboardingVideo`, `startOnboardingVideoFromTap`,
`syncOnboardingVideoPosters`, the `IntersectionObserver` play/pause on the
standalone page, and the `::-webkit-media-controls-start-playback-button`
hide rule) was deleted rather than worked around — the best part is no
part. The animations are the real production UI, the same no-reuse,
no-upscale, 60fps capture rules as the former guide's media.

The media switches by viewport, not by theme: phones show the 9:16
render, tablets and desktops the 4:3 render, through a
`<picture><source media="(min-width: 768px)">` at the same 768px
breakpoint with the phone render as the `<img src>` default. There are no
dark variants of these cards: the onboarding surface is forced light in
both themes (see below and `DESIGN.md`), so there is no `card1-dark.webp`.
`object-fit: cover` keeps the 9:16 / 4:3 framing, and the inset hairline
box-shadow keeps card 1's mostly-white frame readable on the white card.

Reduced motion: an animated WebP still animates, and there is no API to
pause a looping animated image. The former first-frame / empty-area and
play-button concerns no longer apply because there is no autoplay to
refuse and no play button to paint; the dialog keeps its
`prefers-reduced-motion` handling for scroll behaviour (the carousel and
fan jump instead of smooth-scrolling), and the copy and dots still carry
the meaning. Keeping the looping WebP is the minimal choice; no extra
part is added to freeze it.

This was the TestFlight 1.9.9 (build 361) issue: on a real iPhone the
card videos sometimes opened on WebKit's native start-playback button, or
did not start from the first frame, and a tap on that button jumped to the
next card. An animated `<img>` removes the whole cause — there is no
`<video>` to refuse, no frame to force, and nothing to hide — so every
card simply loops and a tap always advances.

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
what left card 3 shorter than the media cards.

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
other way in WebKit and left three. When the fan's size changes after
open (fonts arriving, rotation), the book that was centred is centred
again: Chromium re-snaps the strip by itself, WebKit does not, and its
strip was left off centre with three covers on one side. At rest there
are five covers, all 2:3. All three cards are one box
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
edge to edge: no rounded card, shadow or outer margin. The card is the
same white on every screen, the white of the card media, so the media
area and the dots and copy under it show no seam (phones used to paint
the card and media `#F2F2F7` under white frames, which drew a line under
the media). Safe-area insets (`env(safe-area-inset-*)`)
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
polite (존댓말), there is no focus outline, and the margin around the
card at 768px and up is the home background `#F2F2F7`.

The carousel surface stays light in both themes. The standalone page is
light-only, and forcing the dialog light keeps copy, the media hairline
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
and per-card dots, exact card copy, cards 1 and 2 rendering an animated
`<img>` (inside a `<picture>`) whose resolved source is the expected
per-breakpoint WebP — `card1.webp` / `card2.webp` on the phone profile and
the `-wide` variants through the `<source media="(min-width: 768px)">` at
and above 768px — with no `<video>`, no autoplay attribute and no native
controls anywhere in the dialog, a tap and a swipe-up each advancing the
card (no video tap carve-out), the three cards staying equal height,
dots following scroll and arrow keys,
the five-cover rest state, every visible cover at 2:3 at each layout size
and on the iPhone profile, tap-to-centre with title/author/button
following, read/file/browse/skip/Escape paths, import
cancellation/failure/interruption, completion persistence and replay,
existing Reader isolation, reduced motion (the `<img>` is present and the
dialog still advances), visibility interruption, equal screen boxes, the
skip inset, no document
or stage scroll, full-bleed phone layout under 768px, the card layout at
768px and above, and the phone/tablet/desktop/short layouts in both
themes with the light dialog surface. WebKit runs the structure check
with Playwright's iPhone 13 profile. The standalone reference page stays
in the repo at `onboarding-carousel.html` so the reviewed feel can be
re-checked without the app shell. The shipping dialog keeps that
carousel, and also fits one visual viewport.

Production Reader/gesture/auth/native-launch boundaries remain pinned;
full `npm test` stays green. Browser emulation, including an iPhone
device profile, does not prove a physical iPhone. This media and
phone-layout change ships with the site that deploys from main. No
native upload is part of it.
