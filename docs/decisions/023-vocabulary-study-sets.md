# Snapshot-backed vocabulary study sets (1.9.3)

## Completion entry revision before the next1.9.3 build (2026-10-13)

An interrupted session keeps its frozen queue, answers and current point and
offers `이어서 학습`. The final remembered answer goes directly to one terminal
screen with `세트로 돌아가기` and `다시 시작하기`. Returning to the set or leaving
and reentering shows `학습 시작하기`, never an intermediate results-entry action.
Navigation/rereading/reload do not clear the completed session or its answers.
Only an explicit Start after completion or terminal Restart begins a new full
session, using the existing restart/storage contract; no storage migration or
new history retention policy is introduced. Previously remembered cards join
that new session again. Incomplete sessions are never reset by entry.

All Words follows the same terminal pair and entry-label distinction through
its existing separate session owner. Rapid or detached terminal actions cannot
restart twice. Source vocabulary, multi-meaning groups, CSV export, exclusions,
swipe behavior and the existing design materials are unchanged. The separately
deferred typed-test entries are hidden under its release gate.

`verify-study-completion-browser.mjs` checks both scopes in the real shipping
configuration: interruption/resume, completion/exit/reentry/reload, retained
completed answers and typed-test data, explicit full restart, repeated actions,
and phone/tablet/desktop/short layouts in both themes. Native device acceptance
is separate. Unit UI regressions exercise the same three states and stale actions.

Memory keeps its existing full wordbook (`v-vocab`) as the default entry. The
existing bottom-center pill is labeled `학습하기` and opens the single-column
set directory in one bottom sheet over `v-vocab`; no row is added between search and filters. The
first immutable `전체 단어` row opens a read-only full-vocabulary word list
with its own `학습 시작` action, followed by saved sets and a matching dashed `+ 세트 추가` row.
A selected custom set opens its captured word list as an independent full page.
Page Back reopens the directory sheet and restores its internal scroll position; closing the directory leaves the original full wordbook and scroll position intact. Whole-vocabulary study returns to this word list, whose Back restores the
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
The ellipsis circle itself is the shared material surface. It is laid out once
at the menu size, then a spring scales that shape from the 44px circle with
transform and opacity only. Width, height, radius, box-shadow, and
backdrop-filter do not change during the frames: resizing a blurred layer is
smooth on iPad and drops frames on iPhone. The filter is suspended until the
spring settles. The corner radius stays 22px. The corner button is
counter-scaled so it stays a 44px hit target while the shell scales. The
surface returns to the 44px circle on closure.
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

Editing a saved meaning does not rewrite an existing captured card.
Exclusion removes a card only from this set's active membership, with Undo.
Excluded identities remain recorded; the old excluded-screen history remains
readable without adding a fourth action to the new edit menu.
Saving a word from a book that already belongs to a set adds that word to the
set. The same word and meaning, once excluded, is not added again. Deleting a
word from Breeze Memory removes it from the set as well; an open study round
keeps its starting list until that round ends. See the book-link section below.

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

## Memory list behind 학습하기 (2026-10-14)

Opening 학습하기 lays out Breeze Memory behind the sheet. Memory lists over
100 groups now mount only the visible window, so that open no longer walks
every saved row. 전체 단어 reuses its grouped order until the saved words
change, instead of sorting the whole wordbook on every open. Saved-set and
제외한 단어 lists keep the existing 100-row window. Swipe exclusion still
animates the row that is leaving and updates that window in place. Book-link
sync rules are unchanged.

## List refresh cost (PR155 follow-up)

Hidden Memory directories defer mutation and storage-event refreshes until the
view is shown or the directory is entered. Visible lists summarize card counts
and frozen-session index/queue length from the state already decoded or
successfully committed by their owner. They do not call the full-collection
`view()` once per set. Opening/reloading still reads durable storage, and all
mutation, schema, concurrent-change and commit validation remains unchanged.
The hidden host also defers its startup render; visible background Memory behind
a short creation task still refreshes without discarding typed input. Synthetic
1/10/50-set browser measurements and scope are recorded in
`docs/qa/study-sets-list-20261012/`.

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
680px reading-width cap. The stored source example is visible on the front, while the answer is concealed before tap. Horizontal
drag follows the finger, rotates slightly, returns below threshold, and exits
on an accepted swipe to expose the next card. The card owns the gesture:
`touch-action: none` so the browser does not choose a pan before the finger
commits, then the first 10px locks the axis. A horizontal lock freezes the
page scroll and follows the card; a vertical lock scrolls only when the card
overflows and calls `preventDefault` on the rest of that gesture. When the
card fits, the session body sets `overflow-y: hidden`. Vertical scroll,
cancellation, movement before reveal and repeated input cannot grade. Normal layouts show
direction text and Undo, with no visible rating buttons; keyboard/assistive
controls remain, and focus reveals their alternatives. Reduced motion preserves
the contracts without exit animation. Tests/videos are browser evidence;
physical iOS interaction still needs native QA.

The separately approved create-sheet back circle reuses the set-detail back's
theme material and reduced-transparency fallback. Preserve44px touch geometry,
32px/2.3 SVG and the existing same-dialog Back/history/close ownership. Paired
sheet captures assert material equality and actual Back returns to directory.

User follow-up removes the visible study Undo control before the next internal
build. Its engine inverse/history contract remains for data validation/tests,
but there is no visible Undo button. Repeat/remember keyboard and assistive
alternatives remain; initial progress and fresh-session semantics are unchanged.
The separately authorized list optimization was cherry-picked without changing
study gesture owners or storage validation. Its validated-session index is now
v2's distinct passed count. QA scene helpers distinguish the visible tap card
from clipped assistive controls and retain strict hidden/duplicate checks.

The final signature-color adjustment reuses the approved flow wordmark's mint
endpoint: `--brand-signature` is#AAC4C4 in light and#D7ECE8 in dark. Existing sky
brand/selection tokens stay unchanged. Only remembered/right-drag feedback uses
it, in set and all-word study. The theme-specific wash35%/20% keeps the neutral
card readable; direction text must retain4.5:1 contrast. Left/repeat, progress,
geometry, gestures, palette assets and lookup colors are unchanged.


The next internal269 build adds one isolated hands-on word-study page after
Memory inside the existing onboarding carousel. Existing pages and the Settings
replay entry remain; practice never touches saved words, set snapshots or live
study progress. Tap/left-repeat/second-tap/right-remember are required for Next;
the existing Skip and Back remain. Replay resets the examples; interrupted
first-run practice resumes through the existing progress key. Reduced motion,
keyboard and assistive alternatives preserve the exercise.

Creation now fixes the count and submit control above the safe area while only
the book field scrolls. Books sort by descending snapshot word/meaning count;
equal counts retain source order. Name remains required, zero selected/zero
snapshot cards cannot create a set, and successful or pending operations reject
stale duplicate form submissions. The visible viewport sizes only this creation
sheet when the iOS keyboard changes available height.

Mutation errors distinguish durable commit from navigation/display. Retry after
a committed mutation rereads and renders rather than reapplying creation/start;
quota failure preserves the old collection bytes and permits the original
mutation retry. Original error (including stack) stays in memory for diagnosis,
with phase/operation/count metadata and no persisted diagnostic vocabulary.
The exact v1 backup remains mandatory before migration; quota failure on either
backup or collection write preserves the original collection. Extra backup
space is a documented constraint, not waived or hidden by destructive cleanup.
Fault-injected268 reproduces the generic warning and duplicate retry risk; this
does not prove the physical phone's original exception.


Actual short-landscape review exposed the newly added practice slide's minimum
height clipping its card and overlapping its motion hint with the meaning.
Only the practice uses two columns below600px height/above600px width; existing
carousel slides keep their approved design. The card reserves a hint area and
its minimum includes the44px pause control. Short-view tests require card,
pause, Back, Next and Skip inside the viewport and no hint/meaning overlap.
The practice carousel's accessible label describes the exercise rather than a
video. Portrait fallback remains vertically scrollable for unusually short
screens, and practice gestures preserve vertical scroll ownership.

A repeated real-touch recording produced trustedpointerdown/pointerup with no
compatibilityclick after an unrevealed drag. The practice now reveals on an
unmoved primary touch release inside the card, while preventing the release's
compatibilityclick from also revealing the next example. Mouse/assistive click
and keyboard remain; cancelled/vertical releases cannot grade and outside taps cannot reveal.
The browser regression deliberately drops one compatibilityclick while retaining
actual touch input; waiting alone is not treated as the gesture fix.

## Approved follow-up after 269

All Words uses the existing full-page detail family and shared vocabulary rows,
with meanings/examples readable in the list and a fixed Study Start footer. Its
list has no exclusion/deletion swipe, editable meaning, or rating write. The
original wordbook retains its editing/deletion behavior; custom-set exclusion
remains unchanged. Study Back restores the all-word detail and its scroll; detail
Back restores the originating directory or Memory.

Both learning fronts show only the already stored source example. Position
metadata selects the saved occurrence; absent metadata permits one unique
whole-token/inflection or saved phrase match. Repeated ambiguous occurrences
remain plain text. Bold text preserves every original character and uses safe
DOM text nodes. Missing source text is omitted. No lookup, AI request, vocabulary
repair, or persistence-schema change is part of this display adjustment.

The former 269 interactive lesson is superseded by a passive study video in the
same guide and Settings replay path. Next requires no practice acknowledgement.
The light/dark clips are newly captured actual learning UI with isolated authored
examples, showing tap, left repeat and right remember. Existing pause, poster,
reduced-motion, interruption and guide completion owners remain. Native playback
and physical gesture acceptance require separate device verification.

## Study quota repair (2026-10-12)

The shipped 1.9.3(269) collection, frozen queues and All Words session shared
localStorage's small quota with saved vocabulary and legacy copies. A real
Chromium quota reproduction with 5,000 meanings and overlapping sets permits an
existing session's small answer delta but rejects a new set and All Words' first
session write. This does not establish physical disk shortage or the exact
contents of the reporting iPhone.

Store each study engine's unchanged serialized schema in the `records` store of
IndexedDB `breeze-study`, version 1. Each record contains its working value and
an immutable `legacy` map holding the exact original localStorage working bytes
and every matching `.backup*` key. Migration validates the working schema,
commits the complete archive, reads it back and compares the still-present
legacy bytes before removing those matching keys from localStorage. Interrupted
cleanup retries against the same archive. Invalid, future or changed data fails
closed. Vocabulary, word-item overrides, pending journals, dormant FSRS history
and its backups remain unchanged. Nothing is uploaded or silently trimmed.

The authoritative write is one read/write IDB transaction: check the expected
serialized value and replace the working value while retaining the archive.
Resolve only on transaction completion, including abort after request success.
An older app recreating legacy keys blocks writes rather than overwriting newer
IDB state; downgrading to a localStorage-only build is not supported. Cross-tab
notifications use BroadcastChannel where available; fresh action reads and
transactional comparison enforce correctness independently of notifications.

The UI awaits reads and commits, retains retryable answers/forms on failure,
and ignores obsolete navigation completions. A post-commit display failure only
retries display. All Words validates its separate session and reports damaged
records separately from quota failures. Leaving a pending failed save still
reports the failure. The original card/snapshot/session algorithms are unchanged.

This is a study-storage repair, not a vocabulary-store redesign. A wordbook or
unrelated legacy history alone can still exhaust localStorage. Removing its
records or rewriting its persistence contract is outside this change. Exact
migration archives stay in IDB; no automatic archive pruning is introduced.

Validation: `verify-study-sets-storage.mjs` exercises migration, corruption,
interrupted copy/readback/cleanup, IDB quota/abort, stale writers, large overlapping
sets, frozen queues, exclusions and answer history. `verify-study-quota-browser.mjs`
uses real browser quota, verifies exact archive/source preservation, successful
new sets and All Words after migration, restart, abort/retry, pending-save
navigation, duplicate input and post-commit retry. Existing browser tests await
storage completion. Chromium results are not physical WKWebView verification.

## Post-270 gesture presentation follow-up

All Words must opt into the same `.vocabulary-rows` list scope as custom sets;
its readonly handlers and source records remain unchanged. Only set-detail
ellipsis receives a 2.3px filled-dot optical correction within its existing
24px frame and 44px shell.

Both study flows share one direct-drag/spring/exit presentation owner. Recent
release velocity projects intent only after 36px horizontal travel; opposite
release trajectories cancel. Re-grabbing a spring retains its live position.
An accepted card remains offscreen until its exit and durable write finish;
next content has no inherited return transform or second underlay text layer.
The original queue, token, failure/retry and Again/no-progress rules still own
state. Different row exclusions released during a pending write wait in order,
retain their view owner and read fresh state; duplicate pending-row input cannot
commit twice. Existing Undo/neighbor pointer ownership survives collapse.
See `docs/reviews/breeze-post270-gestures/` for shipped-source reproduction,
actual timed motion frames, browser regressions and native limitations.

## Build271 followup: large All Words and modal scroll ownership

All Words retains the shared read-only vocabulary renderer and full study scope, but lists over 100 groups mount a measured viewport with overscan. Offscreen spacers preserve scroll geometry; visible rows retain original ordinals, multiple meanings, expansion and keyboard traversal. Leaving this page releases its DOM and observers. Simple-session membership validation uses Sets with unchanged validation rules and serialized history. Vocabulary, migration, sync, exclusions and limits are unchanged.

The directory/create modal owns the document scroll while open, keeps its lists independently scrollable, and restores the exact document position when dismissed. Transitions to a full page release this ownership before the page scrolls. This ownership is separate from other overlays' CSS classes and styles. The background wordbook is hidden before native dialog focus restoration to avoid laying out thousands of hidden-bound rows during navigation.

Evidence, before/after measurements and physical-device limitations: [build271 followup review](../reviews/breeze-post271-allwords/README.md).

## Custom sets share the All Words window

전체 단어 and a saved set's word list, including its excluded-word list, now share one mounting path. Lists of 100 words or fewer still mount every row. Longer lists mount the measured viewport plus overscan; spacers keep scroll height, ordinals, and keyboard reach. 전체 단어 meanings and stars stay read-only; its left-swipe removal is defined below. A saved set keeps swipe exclusion, stars, and undo. Removing a card updates that same window, including a second row already leaving, without rebuilding every offscreen word. The shared limit is the one introduced for large 전체 단어 lists in PR #159 (`bf1b5f90`). PR #168 only stopped that window from remeasuring rows while the mounted range stayed put.

## Typed test entry (2026-10-13)

All Words and set detail add an independent **단어 테스트** action beside study.
The test captures precisely the selected active scope, keeps empty scopes empty,
and uses a separate full page and IndexedDB database. Existing set snapshots and
excluded cards remain unchanged. See [typed vocabulary tests](031-vocabulary-test.md)
for unique-word counts, multi-meaning representatives, persistence and batching.

## Representative word cards for new study sessions (2026-10-13)

New study sessions and detail lists use `BreezeStudySets.groupedCards(setOrCards)`
to project one representative per word. Optional captured roots identify a base
record and its senses; legacy snapshots fall back to exact saved expression text
(NFC, trimmed, whitespace collapsed, case preserved). No guessed stemming merges
unrelated spellings or phrases. Set tests use the same helper and active exclusion
scope. Source `set.cards` remains one record per saved meaning, with its original
word, definition, example, source, identity and star status.

A representative preserves its first member identity and freezes `group`,
`acceptedMeanings` and the complete original `senses` array. Multi-meaning recall
shows the word alone on the front; reveal numbers every saved meaning on separate
lines. Single-meaning examples pass the same conservative saved-English-source
check as typed tests. No definition is placed in the hidden front or its ARIA
label. The list groups meanings under one word. A grouped exclusion/restore applies
atomically to every represented member; its star chip changes only the
representative's snapshot star, preserving the other saved stars and all original
vocabulary records.

A remembered answer completes one word and its frozen member meanings; Repeat
requeues that same representative without progress and Undo restores it. The view
exposes `rememberedMeaningIds` and `pendingMeaningIds` for member-level coverage,
but progress counts representatives. Neither assessment changes saved stars or
vocabulary. Existing sessions without representative metadata keep their queue,
response history, denominator and resume point until explicit restart. All new
metadata survives strict normalization; malformed or nested representatives are
refused rather than partially salvaged. There is no database/schema migration.

## Direction cues for revealed cards

All Words and saved-set study now keep `← 다시 보기` and `알아요 →` visible below
a revealed card, with at least 44 px tap targets and keyboard activation. Before
reveal they cannot grade. Shared drag thresholds and repeat/remember ownership
are unchanged; the larger text cue appears during a subthreshold drag so color
is not the only signal. Left moves the word to the queue's end without progress,
right completes it, and canceled short movement records nothing. Reduced-motion
continues using the existing motion owner. The direction UI is a separate commit
from the typed test. `verify-study-direction-browser.mjs` records actual app
interaction and covers both paths, repeat return, label taps and reduced motion.

## Word-only display hold (2026-10-14 KST)

The owner requested that word learning and word tests show words and meanings
only until the example algorithm is reliable. Memory, All Words, saved-set lists,
word detail and both study cards therefore omit examples, including accessible
card labels. The retained typed-test prototype also omits example prompts and
sends an empty example field to its optional grader. The prototype remains
disabled in 1.9.3; this change does not approve enabling it.

Stored examples, source metadata, captured card manifests, answers, study history
and CSV examples remain intact. Reader original text, sentence interpretation and
easy explanation remain available. The example extraction/highlight helpers and
their algorithm tests are retained for later evaluation, but successful evaluation
cannot reenable UI presentation: restoring it requires the owner's explicit
subsequent decision and a separate implementation change.

`verify-word-only-browser.mjs` checks display policy independently of a valid
algorithm result, source metadata, CSV/data retention and 20 light/dark layouts.
Existing completion/reentry and explicitly opted-in prototype tests retain their
previous state/history contracts. Browser evidence does not prove native iOS QA.

## Book sets follow later saves (2026-10-14)

A set made from one or more books stays linked to those books. Saving a word
from one of those books adds the word to every such set. No **새 단어 가져오기**
action remains. `책 추가` still captures the newly chosen books at that moment.

The link adds only a word and meaning the set has not seen. Removing a word
from the set keeps it in Breeze Memory and records the exclusion, so saving
that same word again from the same book does not put it back. Deleting the
word from Breeze Memory removes that captured card from the set. While
**학습 시작하기** is in progress, the round keeps the list it started with,
including a word deleted from Memory during the round. After the round, the
set list omits it, and the next **학습 시작하기** uses the updated count.
Words saved during a round appear in the set immediately and join the following
round, not the one already started.

Existing sets, captured cards, exclusions and unfinished rounds stay as they
were. Nothing is rebuilt or discarded on update. The shared 100-word window
still mounts the set list. Cloud vocabulary sync is unchanged.

## Word-row swipe release (2026-10-14)

A saved set's left swipe still excludes only that set. The finger now meets
resistance after the commit line instead of a hard edge. Releasing uses the
existing spring, so a committed row carries its speed and settles past the
edge before the row below closes the gap. The remove control keeps the existing
pill: a muted rounded button and a small red minus, growing by its own width
from a circle into a capsule. The same control is used on 전체 단어. Crossing
the commit line taps once, and the removal taps once more, through the iPhone
haptic plugin when it is present. A right swipe still does not act. The same
left swipe on 전체 단어 deletes that saved word, tombstone
included, so a book-linked set drops it and does not take it back. That screen
reuses the set's existing undo notice and 실행 취소 button, and hides the
notice after a few seconds. Meanings stay read-only and stars do not write.
The wordbook shown on entering 단어장 (`v-vocab`, the list headed 전체 N단어) uses that same left swipe to remove the saved word, tombstone included, with the same undo. Expanding a row still deletes one meaning. Stars and meaning edits stay on that screen.
Lists over 100 words remove the row from the same window without measuring
every remaining row.

## Saved-set recall test (2026-10-14)

A saved set's detail now has two equal-width actions in one row. **학습** stays the primary study action, including `이어서 학습 · n/m` while a round is open and a fresh start after a finished round. **테스트** is the secondary action and opens setup, not the questions. Where earlier notes say that set button reads **학습 시작하기**, the set detail now reads **학습**. All Words keeps a single **학습 시작하기** and does not offer this test.

Setup offers a slider from 1 to the set's grouped word count, defaulting to every word, then **테스트 시작**, then a compact list of this set's past results (date, word count, and score as `n점`). Records live in `localStorage` under `breeze.study-set-tests.v1`, newest first, capped at 40. A damaged or newer store is left untouched. Leaving before any answer is saved does not write a record. Choosing **나가기** keeps only the answers already submitted, grades those, and saves that shorter result.

The test draws that many grouped words in random order. The card shows the English word only. The answer field sits directly under that card, in the upper part of the page. There is no on-screen submit control. Return on the system keyboard submits the current answer (`enterkeyhint=done`). The same text field stays mounted so the keyboard can remain up. While the keyboard is open, the test page follows `visualViewport` and keeps the field in the visible area without scrolling the page. The page back button and the system back gesture, only while a test is in progress, ask **정말 제출하고 나가시겠습니까?** with **취소** and **나가기**. Cancel stays on the same card. Leave grades and saves the answers already submitted, then shows that result. During the test, iOS enables the web view's back gesture and turns it off again on any other screen. Setup shows the chosen count over the set total, a thick accent slider, and shortcuts for 10, 20, 50, and the full set when those counts are smaller than the set. A blank answer is incorrect at once. An exact normalized match against any saved meaning is correct at once. Anything else is graded leniently in the background, ten submitted answers at a time, without blocking typing. Each batch uses the dictionary's existing OpenRouter DeepSeek model and asks only for `{"ok":[1,0]}`, with no explanation. A synonym or near-synonym of the same thing counts as correct, including a more formal, broader, shorter, or more specific everyday word, such as 책 and 도서, or 개 and 강아지. A different kind of thing that is only related, such as 학교 and 학원, counts as wrong. Under the small progress count, a compact row shows a green dot with the number correct and a red dot with the number wrong. A gray dot, softly pulsing, shows how many answers are still being graded and disappears at zero. When a batch resolves, those counts ease into the green and red numbers. The score row replaces any top toast; the test does not show one. A trailing remainder under ten updates the same row and the result. Offline or failed grading retries, then treats a non-exact answer as incorrect. While answers are still being graded, the result is a spinner and a progress bar labeled 채점 중, and the same record is already stored as 채점 중. Leaving that screen does not cancel grading. The stored row stays 채점 중, including after the page is opened again, until the background grade replaces it with `n점`. The result then shows that score, the missed words with the typed answer beside each saved meaning, and **틀린 단어만 다시**.

This path does not enable the separate self-check vocabulary test, its IndexedDB session, or the jev receipt grader. Those gates stay false.


## Account ownership and incremental persistence (2026-10-15)

[Account learning ownership](033-account-learning-data.md) supersedes the earlier
local-only boundary. Original unscoped records stay quarantined and unchanged
until explicit ownership confirmation. Scoped IndexedDB stores a checkpoint,
per-set overrides and a small CAS revision; word changes update related sets
only. Existing score summaries are preserved across devices, including unions
with more than forty extant summaries; no missing answers are reconstructed.
Concurrent frozen sessions remain intact in archives. Cloud session projection
is deterministic while the local current session stays on its original branch.
