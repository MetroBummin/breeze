# Scribble erase and page-list edge gesture

Base: main `e3cdde0` (1.7/223), after RSS #78. Holmes #79 is untouched.
No native code, release version, schema, security settings or deployment changes.

## Instructions and ownership

Read root AGENTS.md; no ancestor/scoped AGENTS.md or local .agents/skills exist.
Read DESIGN.md, decisions 009 (ink), 003 (shared controls), 005 (notices), and
repository npm/workflow test instructions. Decision 009 and DESIGN.md are updated.

Pen settings expose an opt-in (default OFF) scribble toggle. An admitted Pencil
must produce a dense repeated scratch/loop, hold 420 ms for a visible release-to-
delete cue, then lift. Moving >4 px after confirmation cancels recognition and
saves ordinary ink. No recognition, no target or early lift also saves ordinary
ink. Interruption discards unfinished ink as before. Both stored pen and
highlighter strokes/fragments intersecting the existing eraser geometry are
removed whole in one undo/redo transaction; source PDF/text is never affected.
No saved-ink mutation or per-move scan is used for tentative recognition.

The existing original touch/pinch lifecycle feeds one navigation candidate.
A base-zoom direct finger starting <=24 CSS px from the Reader left edge and
moving right >=60 px opens the existing PDF/EPUB sidebar on release. Non-edge
horizontal PDF paging uses the same candidate. Existing pan, pinch and lookup
ownership takes precedence. Writing mode permits idle eligible fingers, never
Pencil or suppressed palm contacts. Failed/cancelled gestures do not open UI.

## Local evidence

- `npm test`: passed, including appended scribble cases, gesture ownership,
  typecheck (unchanged 34 diagnostics), structure, lookup, storage, sync egress,
  sync network and audit-hardening/security contracts.
- `node tests/verify-ready-contracts.mjs`: passed (18 operations/137 questions).
- `node --test tests/verify-reader-input-gestures.mjs`: 7/7 passed.
- `tests/verify-pdf-ink-regressions.mjs`: 37/37 passed; baseline suite together
  with PDF session regressions also passes. Includes held scratch vs normal
  circles/letters/crosshatching/advancing hatching/notes, no tentative writes, undo before save,
  redo, empty targets, movement/cancel/resize/blur/scroll/new-session cleanup.
- Installed Chromium: existing PDF ink browser suite passed (actual IDB,
  highlighter/partial eraser, tool preferences, native admission simulation,
  stylus/finger/palm/collision separation, interrupted input, zoom, rotation,
  reload, save failure/retry, document isolation).
- Installed Chromium: new reader-input-gestures browser suite passed. Includes
  hold/release/cancel/lost capture, default/persistence, circle false-positive,
  real database reopen, finger rejection, edge/paging exclusivity, vertical,
  zoom and Aa exclusions, second finger on outside controls, existing page button,
  EPUB edge opening, new book
  during confirmation, and ten responsive light/dark states.
- Installed Chromium: Breeze 1.6 page/navigation/bookmark/deletion/direction
  regressions; pinch interruption; Reader chrome motion/reversal/reduced-motion
  regressions passed.
- Screenshots: `/tmp/breeze-input-gestures/` (confirmation, EPUB panel and settings
  at 390x844, 820x1180, 1440x900, 320x568, 844x390 in both themes). Phone/settings, short dark settings,
  confirmation and EPUB opening were visually inspected. CI uploads both-engine proof.

Local browser binary is `/usr/bin/chromium`, not Playwright's pinned download.
Pinned browser downloads return network-policy 403 here; WebKit is delegated to
Integrity CI. Swift policy/SDK tests cannot run locally (`swiftc` missing) and
are delegated to the existing macOS PDF input ownership CI. Exact-head CI results
are recorded in the PR; no local success is claimed for these blocked checks.

## Limits and real-device acceptance

Synthetic fixtures do not prove a zero false-positive rate, physical Pencil
latency, palm rejection or UIKit/WKWebView event ordering. Recognition thresholds
remain conservative and the feature stays OFF until a user opts in. Complex
handwriting may resemble a scratch; the visible hold/release gate and undo limit
risk without eliminating it. Dense pages may make the once-per-hold hit test
noticeable; it never runs on normal ink moves. Safari system edge-back may win
and cancel web input; native back/security settings are unchanged.

On an actual iPad/Pencil, before release:

1. Enable the pen setting; write circles around answers, letters, underlines,
   crosshatching and rapid notes with pauses. Confirm no unexpected deletion.
2. Scratch existing pen and highlighter ink, hold for the cue, release; verify
   whole intersected strokes delete once. Undo immediately, redo, reopen PDF,
   then restart app and check the final persisted result.
3. Lift early, move after cue, leave paper, rotate, background, change book and
   interrupt with a cancelled contact. Verify no tentative deletion survives.
4. Repeat Pencil/finger/palm input and flick -> first Pencil stops inertia ->
   next Pencil edits. Check both base and enlarged PDF with tracing OFF.
5. Edge-swipe PDF/EPUB in reading and idle writing: one sidebar open, no page
   turn/lookup/ghost click. Try vertical scroll, outside edge, pinch then lift
   one finger, zoom pan, popup and cancelled swipes; verify immediate recovery.
6. Compare Safari edge-back and the native WKWebView; verify existing navigator
   button, dismissal, fresh scroll and selection/drag cleanup on phone/tablet.
