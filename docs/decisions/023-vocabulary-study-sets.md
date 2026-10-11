# Snapshot-backed vocabulary study sets (1.9.3)

Memory opens a single-column, compact row home (`v-memory`). The first immutable card,
`전체 단어`, opens the existing `v-vocab` screen and counts words with its existing
root grouping. User-created sets and a simple add row follow. A set opens its
captured word list in an opaque study-set sheet; creation reuses the book-selection
form. Closing or backing out of a directly opened sheet returns to the card
home. Memory search, filters, saved-Meaning editing and the general word-card
flow retain their existing ownership and behavior inside the default card.

The card home and set detail are a UI review candidate: real screenshots must
be shown to the user before main merge or TestFlight integration.

## Minimal interaction (UI revision)

The home uses existing Memory typography, thin boundaries and neutral theme
tokens. Names and word counts carry the hierarchy without descriptive copy or
decorative set icons. User-set long press, context click or keyboard context
menu opens management (rename, delete, explicit imports and excluded cards).
The all-words default is not mutable. Creation asks for the name.

Inside a set, words and meanings use the existing vocabulary visual language.
Tapping reveals the captured example; swipe must not also trigger that tap.
A left drag follows the pointer after horizontal direction lock, while vertical
scrolling keeps its native owner. The moving row gains rounded trailing corners;
a single separate action grows from a circle into a capsule behind it. A short
intentional swipe can park the action for tapping; a sufficiently deep swipe
commits, then the row exits and its space collapses. Cancellation or insufficient
distance returns the row. Exclusion affects only this set, with Undo. Keyboard
users retain an equivalent operation without persistent row action clutter.
Reduced motion removes settle animation. The primary study action remains at
the bottom, outside the scrolling list, with safe-area padding.

## Content and identity

A set captures the current saved word/definition/example/source from selected
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
