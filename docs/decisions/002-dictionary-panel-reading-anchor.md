# Dictionary lookup overlay

## Superseded decision

The earlier dictionary side panel changed Reader width and therefore needed Text, PDF, and EPUB source-anchor restoration around every open and close. That presentation has been removed.

## Current decision

Word lookup uses two fixed overlays outside the Reader and original-document zoom layers:

1. Tapping a word highlights that exact node. An unresolved lookup shows a pale blue glass sheen on the word, not a covering pill.
2. A confirmed meaning (including a saved/cache hit) or terminal failure reveals the compact pill beside its screen rect without changing Reader geometry.
3. Its chevron morphs the pill into a near-word detail surface for the same lookup lifetime without starting another AI request.
4. The anchored surface leaves the Reader undimmed. Outside tap, Escape, and Back use shared cleanup; no redundant collapse button is shown. Unanchored vocabulary detail retains its modal fallback.

The pill reserves up to 420px (bounded by 70% of available height) for future detail expansion. It prefers below when that space fits, otherwise above when it fits, otherwise the larger side. It avoids the bottom controls and clamps to the visual viewport. The side is stable throughout asynchronous lookup and exposed as `data-expand-direction`; expanded detail stays on that side, up to 360px wide and 380px tall, with internal scrolling. For a word wrapping across lines, the anchor is the client rect containing the tap, not the union of all lines. EPUB coordinates are translated from the tapped chapter frame. PDF and EPUB scale layers never own the pill or popup.

## Removed paths

- Side-panel width and open/close layout branches.
- Mobile-only dictionary sheet, handle, and pull-to-dismiss wiring.
- Word-panel-specific Reader resize ownership and anchor restoration.
- Explicit dictionary close button.

Generic position preservation for real viewport resize, rotation, Reader mode changes, page navigation, and PDF zoom remains authoritative.

## Invariants

- Word lookup does not change Reader width, line wrapping, PDF scale, EPUB layout, or scroll position.
- The chevron never starts a second lookup, request, quota charge, count, or saved card.
- The detail popup reuses the short Korean Meaning and FreeDictionaryAPI.com metadata; it does not load or display an AI gloss.
- A cached/saved meaning appears immediately when motion is idle. The hidden pending pill cannot be expanded; a result or failure must arrive first. Explicit pill retry also uses the word cue while waiting, retaining the existing saved-meaning rules.
- Saved meanings appear immediately when motion is idle, including in a new sentence. No automatic reclassification hides a saved meaning. An occurrence-specific saved meaning wins; otherwise the selected saved meaning is reused. Only an explicit retry asks for a fresh contextual result.
- A fresh AI word lookup and the pill retry send the selected sentence with its occurrence index and up to one preceding/following sentence. Surrounding context never displaces the selected sentence. Saved meanings still appear immediately without automatic reclassification. Output stays one short lexical result whose Korean meaning is the selected unit's natural translation in context.
- During the first lookup of a new word, a successful retry replaces the initial AI meaning in the same root card. For an already saved word or expression, its existing meaning remains and retries replace one candidate slot; an unsuccessful retry leaves the last successful result intact.
- The bundled Homeward Bound Text book can answer a reviewed occurrence locally when its chapter paragraphs exactly match the bundled source. An unsaved local hit uses the word sheen for about one second and skips the dictionary metadata and AI requests. Previously saved meanings still appear immediately; Retry deliberately enters the existing AI lookup path. The local fixture never bulk-creates Wordbook items.
- Whole-word removal deletes the root and all its meanings; a meaning's delete button removes only that meaning. Automatic results respect deleted meanings, and explicit re-adds advance past their deletion timestamps.
- The detail popup has no duplicate wider-context action.
- The 30-second recheck cooldown follows the lexical root across Meaning selection and expression promotion.
- Expression promotion updates token metadata and paint in place. One token remains one span before and after recognition, including contiguous and discontinuous expressions. It never rebuilds paragraphs, changes text nodes, or writes scroll position.
- Expression results use the same meaning ownership rules as single words and do not overwrite manually edited meanings.
- A stale response may update cache but cannot replace or reopen a newer lookup presentation.
- Outside dismissal owns its gesture so it cannot pass through to the Reader.
- User scrolling hides a mini pill while preserving its lookup and result. Results save immediately; presentation waits until 250ms after the last user scroll, including momentum events. At idle, the live target is checked and the pill is placed before reveal; an off-screen target closes silently with the successful meaning retained. A scroll during the reveal frame or immediately after reveal returns the mini pill to hidden presentation. A pill continuously shown for at least 750ms is dismissed by the next user motion and never automatically returns. Shorter reveals return to READY and wait for idle. Leaving the viewport permanently ends presentation, even during LOOKING_UP; its request may still finish and save. Expanded detail still closes on scroll. Actual programmatic motion also delays mini presentation but does not count as a user dismissal; duplicate scroll events at the same position do not reset idle. Another word, page/mode change, zoom start, outside dismissal or Reader exit ends the lifetime and cancels deferred presentation.

## Verification

Static contracts cover overlay-only DOM/CSS, one lookup lifetime, stale-response cancellation, gesture ownership, and absence of the old sidebar identifiers. Browser regression covers Text/PDF/EPUB placement, viewport edges, cache/pending/failure states, detail continuation, repeated lookup, and unchanged Reader geometry.

## English metadata

English definitions come only from FreeDictionaryAPI.com. Metadata has its own loading state and word-level request/cache, independent of contextual AI. Saved cards with missing definitions can refill. Successful responses cache for 30 days, explicit 404 for one day; transport failures are retryable and never cached as missing. Each network attempt times out after 3.5 seconds. At most two lexical forms are tried, and expressions never fall back to a component word. Stale responses may populate cache but cannot mutate a replaced/deleted card or reopen a lookup.

Frequent whole-word deletion and pronunciation share the title action pill. Meaning uses an unfilled neutral surface, with small subtly colored selected stars. The visible body-highlight toggle preserves saved vocabulary and controls the lexical root across its meanings. The card scrolls internally with its scrollbar hidden.

The heading scrolls with the card. Word management disclosure and manual meaning input have been removed. The body-highlight switch has a 44px touch area. Failed English lookup uses an accessible retry icon. English entries include visible Wiktionary/provider/license attribution. Provider cache v2 bypasses stale negative cache and retry cooldown from the previous endpoint.

## Non-covering pending feedback and local diagnostics (2026-09-28)

The cue uses a single shared CSS definition for Text/PDF/EPUB, with a persistent
pale blue wash, a soft inset edge and a brighter moving glass reflection. The
same theme palette applies inside EPUB's isolated document. Dark mode uses a
slightly brighter blue wash (102,170,239 at 24%); light stays at 74,151,235 at 22%.
The moving reflection, timing and geometry remain the same. It
changes no word dimensions, hit boxes, paragraph structure or scroll position.
Reduced motion has a static tint. A polite off-screen status announces loading
and completion without exposing a blank/pending popup. Original-format repeat
hits transfer the cue to their newly created marker without another request.

The normal lookup lifetime still owns cancellation. User scroll no longer ends
a mini lookup: the word cue may move off-screen while the one request
continues, and a ready result waits for 250ms of scroll idle before presentation.
Another target, page/zoom/mode changes and exit still clear the cue and cancel
deferred presentation; stale replies cannot reopen a pill. Reveal
recomputes the live word rect. If that word is outside the Reader viewport,
a successful meaning remains saved but no pill is shown. Existing timeout, quota/auth handling and explicit retry behavior are
unchanged; this PR does not add potentially billable automatic AI retries.
No general provisional local dictionary/Lightning path is added. Reviewed book
fixtures and confirmed stored meanings remain supported.

`breezeLookupSummary()` returns at most 240 in-memory events on this device,
cleared by app reload or `breezeLookupReset()`. Nothing is sent to a server or
persisted to disk. Events contain only format, outcome, source category, elapsed
milliseconds and counts. No word, sentence, book, account or device identifier is
recorded. `lookup` latency is tap-to-presentation readiness (not exact paint);
`request` latency includes auth/transport but excludes cache writes/presentation
delay. Immediate saved/cache hits are reported separately from AI requests.
Ready p50/p95 exclude failures/dismissals; failure and dismissal counts remain
visible. Repeat-tap rate is repeat taps / (lookup openings + repeat taps).
Pending-switch rate is pending openings switched to another target / openings
that entered pending. These describe the retained local sample, not all users.
Manual retries keep the original opening's first-outcome metric but have their
own request timings. Low sample counts and cancellations must not be interpreted
as direct proof of dissatisfaction.

## Result arrival (2026-09-29)

A ready result uses the normal glass mini-pill appearance with no arrival color,
reflection or accent animation. The pending word shimmer and scroll-idle reveal
rules remain unchanged.

## Scroll-safe word occurrence ownership (2026-09-29)

A repeated tap is identified by its source occurrence, never its old screen rect:
Text keeps its span identity, PDF keeps page identity and page-relative glyph box,
and EPUB keeps the source Range endpoints. Replacement display markers inherit
the same pending request. A different occurrence of an unresolved word retires
the previous provisional record before selecting the new/saved-word path.

## Immediate saved meanings (2026-09-29)

The 750ms reveal protection applies only after pending feedback in this opening.
An immediately available saved meaning closes on the next user scroll or same-word
retap and never returns on idle. Other-word taps still switch targets; mini-pill
controls retain their existing retry/detail actions. Programmatic motion remains
non-dismissive. Closing presentation never deletes the saved meaning.
