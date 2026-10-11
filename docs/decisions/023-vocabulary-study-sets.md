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
decorative set icons. The add row uses the same shape and size as saved sets. User-set long press, context click or keyboard context
menu opens management (rename, add source books, delete, explicit imports and excluded cards).
Directory rows use the same 8px gap, including the all-words and add rows;
counts use the existing small caption. The sheet fits its content, and its
44px close target is circular. Management uses neutral text rows.
The all-words default is not mutable. Creation asks for the name and source books.
The add card switches the existing open native dialog from directory to creation;
it never opens a nested sheet or navigates to a page. Back or Escape returns to
the directory. Saving also returns to that directory and focuses the new set.
Only choosing a set or all-word study leaves the sheet for a full page.
Internal directory/create/manage history transitions keep the same dialog open
without close/show cycles. X dismisses the entire sheet hierarchy. Renaming
returns to its existing management frame, and deletion returns directly to the
directory. Forward into a deleted set falls back to the directory, preserving
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
Touch implicitly captures to the hit child. Its bubbling capture-loss during
transfer to the row does not cancel that row's drag; only loss of the row's own
active capture does. Long press owns its release click even when management
replaces the original button under the finger. The next pointerdown starts a
new interaction.
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
Exclusion removes a card only from this set's active membership, with Undo and
an excluded-card list for restoration. Excluded identities remain recorded.
`새 단어 N개 가져오기` is an explicit action, never automatic synchronization;
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
Undo after removal settles, word examples, long press, rename and adding books.
It also verifies persistence, exclusions, deduplication and unchanged global
vocabulary, plus ten light/dark layouts. Native scrolling is checked separately
at the end to isolate its inertia from subsequent tap checks. This is browser
evidence, not actual iOS interaction coverage or an immediate-during-animation
Undo guarantee. Review screenshots remain web previews. A new native build
requires user review; historical build 266 retains its existing boundary.
