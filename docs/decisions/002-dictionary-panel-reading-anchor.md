# Dictionary lookup overlay

## Superseded decision

The earlier dictionary side panel changed Reader width and therefore needed Text, PDF, and EPUB source-anchor restoration around every open and close. That presentation has been removed.

## Current decision

Word lookup uses two fixed overlays outside the Reader and original-document zoom layers:

1. Tapping a word highlights that exact node and opens a compact meaning pill beside its screen rect.
2. The pill waits for or displays the result without changing Reader geometry.
3. Its chevron changes presentation for the same lookup lifetime and opens a centered detail popup without starting another AI request.
4. The popup uses a full-viewport scrim; outside tap, Escape, and Back all call the same cleanup path.

The pill prefers the space above the tapped word, falls below when necessary, and clamps to the visual viewport. For a word wrapping across lines, the anchor is the client rect containing the tap, not the union of all lines. EPUB coordinates are translated from the tapped chapter frame. PDF and EPUB scale layers never own the pill or popup.

## Removed paths

- Side-panel width and open/close layout branches.
- Mobile-only dictionary sheet, handle, and pull-to-dismiss wiring.
- Word-panel-specific Reader resize ownership and anchor restoration.
- Explicit dictionary close button.

Generic position preservation for real viewport resize, rotation, Reader mode changes, page navigation, and PDF zoom remains authoritative.

## Invariants

- Word lookup does not change Reader width, line wrapping, PDF scale, EPUB layout, or scroll position.
- The chevron never starts a second lookup, request, quota charge, count, or saved card.
- The detail popup reuses the short Korean Meaning and dictionaryapi.dev metadata; it does not load or display an AI gloss.
- A cached meaning appears immediately; pending state continues in the detail popup if it is opened early.
- Saved meanings appear immediately, including in a new sentence. No automatic reclassification hides a saved meaning. An occurrence-specific saved meaning wins; otherwise the selected saved meaning is reused. Only an explicit retry asks for a fresh contextual result.
- The pill retry sends the selected sentence with its occurrence index and up to one preceding/following sentence. Surrounding context never displaces the selected sentence. Output stays one short lexical result.
- Whole-word removal deletes the root and all its meanings; a meaning's delete button removes only that meaning. Automatic results respect deleted meanings, and explicit re-adds advance past their deletion timestamps.
- The detail popup has no duplicate wider-context action.
- The 30-second recheck cooldown follows the lexical root across Meaning selection and expression promotion.
- Expression repaint restores scroll synchronously before scroll events can dismiss the active pill.
- Expression results use the same meaning ownership rules as single words and do not overwrite manually edited meanings.
- A stale response may update cache but cannot replace or reopen a newer lookup presentation.
- The detail scrim owns its gesture so outside dismissal cannot pass through to the Reader.
- Scrolling, page navigation, zoom start, another lookup, or Reader exit closes the near-word pill without a timer.

## Verification

Static contracts cover overlay-only DOM/CSS, one lookup lifetime, stale-response cancellation, gesture ownership, and absence of the old sidebar identifiers. Browser regression covers Text/PDF/EPUB placement, viewport edges, cache/pending/failure states, detail continuation, repeated lookup, and unchanged Reader geometry.
