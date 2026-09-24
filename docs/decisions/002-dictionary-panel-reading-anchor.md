# Dictionary lookup overlay

## Superseded decision

The earlier dictionary side panel changed Reader width and therefore needed Text, PDF, and EPUB source-anchor restoration around every open and close. That presentation has been removed.

## Current decision

Word lookup uses two fixed overlays outside the Reader and original-document zoom layers:

1. Tapping a word highlights that exact node and opens a compact meaning pill beside its screen rect.
2. The pill waits for or displays the result without changing Reader geometry.
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
- A cached meaning appears immediately; pending state continues in the detail popup if it is opened early.
- Saved meanings appear immediately, including in a new sentence. No automatic reclassification hides a saved meaning. An occurrence-specific saved meaning wins; otherwise the selected saved meaning is reused. Only an explicit retry asks for a fresh contextual result.
- The pill retry sends the selected sentence with its occurrence index and up to one preceding/following sentence. Surrounding context never displaces the selected sentence. Output stays one short lexical result.
- The bundled Homeward Bound Text book can answer a reviewed occurrence locally when its chapter paragraphs exactly match the bundled source. An unsaved local hit uses the existing pending pill for about one second and skips the dictionary metadata and AI requests. Previously saved meanings still appear immediately; Retry deliberately enters the existing AI lookup path. The local fixture never bulk-creates Wordbook items.
- Whole-word removal deletes the root and all its meanings; a meaning's delete button removes only that meaning. Automatic results respect deleted meanings, and explicit re-adds advance past their deletion timestamps.
- The detail popup has no duplicate wider-context action.
- The 30-second recheck cooldown follows the lexical root across Meaning selection and expression promotion.
- Expression promotion updates token metadata and paint in place. One token remains one span before and after recognition, including contiguous and discontinuous expressions. It never rebuilds paragraphs, changes text nodes, or writes scroll position.
- Expression results use the same meaning ownership rules as single words and do not overwrite manually edited meanings.
- A stale response may update cache but cannot replace or reopen a newer lookup presentation.
- Outside dismissal owns its gesture so it cannot pass through to the Reader.
- Scrolling, page navigation, zoom start, another lookup, or Reader exit closes either anchored presentation without a timer.

## Verification

Static contracts cover overlay-only DOM/CSS, one lookup lifetime, stale-response cancellation, gesture ownership, and absence of the old sidebar identifiers. Browser regression covers Text/PDF/EPUB placement, viewport edges, cache/pending/failure states, detail continuation, repeated lookup, and unchanged Reader geometry.

## English metadata

English definitions come only from FreeDictionaryAPI.com. Metadata has its own loading state and word-level request/cache, independent of contextual AI. Saved cards with missing definitions can refill. Successful responses cache for 30 days, explicit 404 for one day; transport failures are retryable and never cached as missing. Each network attempt times out after 3.5 seconds. At most two lexical forms are tried, and expressions never fall back to a component word. Stale responses may populate cache but cannot mutate a replaced/deleted card or reopen a lookup.

Frequent whole-word deletion and pronunciation share the title action pill. Meaning uses an unfilled neutral surface, with small subtly colored selected stars. The visible body-highlight toggle preserves saved vocabulary and controls the lexical root across its meanings. The card scrolls internally with its scrollbar hidden.

The heading scrolls with the card. Word management disclosure and manual meaning input have been removed. The body-highlight switch has a 44px touch area. Failed English lookup uses an accessible retry icon. English entries include visible Wiktionary/provider/license attribution. Provider cache v2 bypasses stale negative cache and retry cooldown from the previous endpoint.
