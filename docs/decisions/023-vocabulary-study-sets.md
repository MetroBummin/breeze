# Snapshot-backed vocabulary study sets (1.9.3)

Memory keeps its existing full wordbook (`v-vocab`) as the default entry. The
existing bottom-center pill is labeled `학습하기` and opens the single-column
set directory in one bottom sheet over `v-vocab`; no row is added between search and filters. The
first immutable `전체 단어` row opens the existing full-vocabulary card study
directly, followed by saved sets and a matching dashed `+ 세트 추가` row.
A selected custom set opens its captured word list as an independent full page.
Page Back reopens the directory sheet and restores its internal scroll position; closing the directory leaves the original full wordbook and scroll position intact. Whole-vocabulary study returns to the
directory when launched there, while existing direct study callers retain their
normal return target. Detail has no modal semantics, scrim, or X-close control.
Existing search, filters and saved-Meaning editing retain their ownership.

The card home and set detail are a UI review candidate: real screenshots must
be shown to the user before main merge or TestFlight integration.

## Minimal interaction (UI revision)

The home uses existing Memory typography, thin boundaries and neutral theme
tokens. Names and word counts carry the hierarchy without descriptive copy or
decorative set icons. The add row uses the same shape and size as saved sets.
A set opens on ordinary tap. Directory long press, context click and keyboard
context no longer open editing, and the hidden directory edit trigger is removed.
Editing is consolidated in the detail page's top-right circular ellipsis.
Directory rows use the same 8px gap, including the all-words and add rows;
counts use the existing small caption. The sheet fits its content, and its
44px close target is circular. The detail ellipsis has a 44px touch target and
uses paired theme materials: light translucent glass with dark ink in light mode,
and charcoal glass with bright ink in dark mode. Back is a matching 44px circle
with the same rim and elevation. Header icons share a centered 20px SVG grid,
rounded 2-unit chevron stroke and optically matched filled ellipsis dots; the
chevron is centered on the same grid rather than shifted to the left. Theme changes update both controls immediately,
including during the morph; only geometry and icon/content opacity animate. Its compact menu contains exactly Rename,
Add books and Delete set, with neutral text rows and thin separators. Excluded membership remains durable, but its count is not shown.
Book checkboxes use circular checkmarks while retaining native checkbox semantics.
The all-words default is not mutable. Creation asks for the name and source books.
The add card switches the existing open native dialog from directory to creation;
it never opens a nested sheet or navigates to a page. Back or Escape returns to
the directory. Saving also returns to that directory and focuses the new set.
Only choosing a set or all-word study leaves the sheet for a full page.
Directory/create history transitions keep the same dialog open without
close/show cycles. X dismisses the sheet hierarchy. Rename, source selection and
delete confirmation opened from the detail menu stay in the same page family;
saving or canceling returns to detail with its scroll position. Confirmed set
deletion returns directly to the directory and never changes original vocabulary. Forward into a deleted set falls back to the directory, preserving
access to all-word study and creation. Directory scroll and return-card focus
are retained independently of the vocabulary background scroll.

Inside a set, `createVocabularyGroup` adapts captured cards to the exact
`vocabGroupMarkup`, `bindVocabularyGroupToggle` and `vocabMoreHtml` functions
also used by `renderVocab`. The shared `.vocabulary-rows` scope receives the
existing wordbook.css and surfaces.css row typography, meanings and star chips;
there is no parallel set-word renderer. Snapshot meanings are read-only, and
star taps update only the captured card. Legacy set cards without a captured
status default to one star; new cards capture their source status.
A small leading ordinal follows current visible list order and is recalculated
after exclusion or Undo without taking away ordinary word width.
Tapping reveals the captured example; swipe must not also trigger that tap.
A left drag follows the pointer after horizontal direction lock, while vertical
scrolling keeps its native owner. The moving row gains rounded trailing corners;
a single separate action grows from a circle into a capsule behind it. A short
intentional swipe can park the action for tapping; a sufficiently deep swipe
commits, then the row exits and its space collapses. Cancellation or insufficient
distance returns the row. Exclusion affects only this set, with Undo. Keyboard
users retain an equivalent operation without persistent row action clutter.
The ellipsis circle itself is the shared material surface: its actual width,
height and radius grow into the menu, then return to the same circle on closure.
The inner button and menu have transparent backgrounds; no separate visible
button remains over the expanded menu. Dots fade out while it grows and unscaled
action text fades in after expansion, following the existing Breeze pill morph
behavior. Word DOM and scroll position remain unchanged. A new toggle snapshots
the current geometry before canceling the prior animation; epoch ownership
prevents stale completion from reopening a dismissed menu. Actions cannot be
activated during shell expansion. Back and Escape dismiss it first; outside tap owns dismissal without
opening the word beneath it. Outside native scroll closes the menu while
retaining native scrolling. Keyboard arrows, Home and End move menu focus,
Escape restores ellipsis focus, and reduced motion settles immediately. Old
menu history entries fall back to detail.

Touch implicitly captures to the hit child. Its bubbling capture-loss during
transfer to the row does not cancel that row's drag; only loss of the row's own
active capture does. Undo owns its release click and the next pointerdown starts a new interaction. Undo appears as soon as exclusion commits, without waiting for
row removal. Collapse never replaces its active touch target. Undo owns a
stationary touch release directly because browsers can omit the compatibility
click during surrounding animation; cancellation, moved or outside release does
not restore a card. Mouse and keyboard continue to use click.
Reduced motion removes settle animation. The primary study action remains at
the bottom, outside the scrolling list, with safe-area padding. Set learning
stays in the same page navigation family; create/management remain short tasks.

## Content and identity

A set captures the current saved word/definition/example/source/status from selected
books. It does not own or modify source vocabulary. The same exact saved word
and contextual definition appear once across selected books; spelling alone
never merges different definitions. The stored identity is independent of a
source's book label, example, record key, or timestamp. Conservative exact
matching avoids silently merging differing saved content.

Source deletion or editing cannot erase or rewrite an existing captured card.
Exclusion removes a card only from this set's active membership, with Undo.
Excluded identities remain recorded; the old excluded-screen history remains
readable without adding a fourth action to the new edit menu.
`새 단어 가져오기 · N개` is an explicit action in the set detail footer,
shown only when unseen eligible words are available. A tap imports them directly;
repeated activation cannot duplicate snapshots. It is never automatic synchronization;
it adds only unseen, non-excluded identities. No automatic import prompt or
synchronization toggle is introduced.

`책 추가` explicitly extends a set with selected additional source titles and
captures only unseen, non-excluded identities from those new titles. It never
rewrites captured cards, exclusions, source vocabulary, or an active learning
queue. A previously selected title cannot be added twice.

Book selection uses the existing vocabulary `book` title field, as Memory's
filter does. Vocabulary currently lacks a durable source-book ID. Two distinct
books with an identical title therefore share a selection scope; renaming a
book does not silently retarget existing set sources. A new source identity
migration is outside this MVP.

## Learning and persistence

Learning is a reveal + `기억나요` / `다시 볼래요` loop. Each round freezes its
own queue and denominator. Retry rounds include only that round's repeat cards.
Imports and membership changes apply to a newly started session; an existing
round's captured cards and progress remain stable. No paid AI request, network
lookup, scheduling algorithm, classroom, public sharing, or analytics is added.

Device-local `breeze.study-sets.v1` stores the versioned set list, captured cards,
excluded identities and round progress as one atomic localStorage value. It
never changes legacy vocabulary/review keys or cloud payloads. Missing storage
starts empty. Malformed or future-version data blocks mutation rather than
resetting a user's sets. Every action reads the latest durable state, validates
it, and commits before advancing the UI; failed writes leave the action
retryable. A changed value between read and commit is rejected. This check is
not transactional cross-tab compare-and-swap; concurrent browser writers have
the same underlying localStorage limitation as existing local review.

The captured content supports offline study without the original book or
vocabulary record. Storage lifecycle remains the same as other local app data:
clearing the app/browser's data removes these sets; cloud backup is not implied.

## Verification

Domain tests cover immutable CRUD, duplicate meanings, exclusions/restoration,
explicit imports, deleted sources, persistence reload, stable active rounds,
repeated answer tokens, unsupported schemas and storage failure. Browser tests
exercise creation, selection counts, exclusion/Undo/restoration, offline review,
Back/Forward, keyboard closure and responsive light/dark layouts. Native iOS
safe-area and keyboard behavior are separate from browser verification.

## Follow-up review evidence after build 266

`verify-study-sets-touch-browser.mjs` uses trusted Chromium CDP touchscreen
input for capture transfer, finger-follow, cancellation, parked and deep swipe,
immediate Undo, a touch held across collapse, canceled/moved Undo, word examples,
ellipsis morph interruptions, outside dismissal, Back, keyboard focus, reduced
motion, long-press remnants, rename, adding books and repeated direct imports.
It also verifies persistence, exclusions, deduplication and unchanged global
vocabulary, plus ten light/dark layouts. Native scrolling is checked separately
at the end to isolate its inertia from subsequent tap checks. This is browser
evidence, not actual iOS interaction coverage. Review screenshots remain web previews. A new native build
requires user review; historical build 266 retains its existing boundary.

Shared-surface review evidence is in `docs/reviews/breeze-193-shared-morph/`.
Closed, real mid-animation and open frames are captured from trusted touch input,
without seeking or replacing animation frames. The private reference image
could not be downloaded through Library, so its pixels were not inspected;
material choices use the parent’s charcoal/rim/white-icon description. The
private reference image is not committed or published.

PR155 icon-family follow-up shares the reviewed general 20px/2-unit outline
tokens for sheet close/add and compound vocabulary return controls. Icon-only
back roles use the reviewed 32px/2.3 chevron; filled edit/menu dots use the shared
1.6-unit radius. These optics supersede the older 20px back-grid description
above only in this review branch. Preserve button boxes, semantics, sheet/page
navigation, gesture owners and vocabulary data. User review is required before
a new native build; no historical release boundary is updated by this draft.

## Session recall revision (PR155, pending final review)

Tap reveals the saved answer. After reveal, a right swipe means 기억나요 and
left means 다시 볼게요. Only a distinct remembered card increments progress:
passed cards / frozen initial cards. Repeat moves to the pending tail without
incrementing; a final repeated card stays active. This is session recall, never
permanent mastery or exclusion from a later session. Fresh study includes every
active captured card again; no long-term scheduler is enabled.

The v2 collection retains a unique frozen queue and replays answer history to
derive pending order. A monotonic serial rejects obsolete/duplicate callbacks,
including after Undo. Undo reverses the last response/order/progress and conceals
the answer. v1 inventory and answers migrate deterministically; legacy repeats
become pending. The first write preserves exact v1 bytes at
`breeze.study-sets.v1.backup-v1`. Backup or collection write failure leaves the
original intact and the revealed answer retryable. Corruption/future formats
remain blocked. Added/excluded inventory does not change an active denominator.

The study page uses a large central card and available safe-area height with a
680px reading-width cap. Answer/example are concealed before tap. Horizontal
drag follows the finger, rotates slightly, returns below threshold, and exits
on an accepted swipe to expose the next card. Vertical scroll, cancellation,
movement before reveal and repeated input cannot grade. Normal layouts show
direction text and Undo, with no visible rating buttons; keyboard/assistive
controls remain, and focus reveals their alternatives. Reduced motion preserves
the contracts without exit animation. Tests/videos are browser evidence;
physical iOS interaction still needs native QA.

The separately approved create-sheet back circle reuses the set-detail back's
theme material and reduced-transparency fallback. Preserve44px touch geometry,
32px/2.3 SVG and the existing same-dialog Back/history/close ownership. Paired
sheet captures assert material equality and actual Back returns to directory.
