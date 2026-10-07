# Selected Home bookmark

User selects simplified candidate 1. The exact bookmark path is inline in the
existing nav-vocab button. Home shows a neutral 21px/1.5px outline, no label.
The Breeze Memory name, tooltip, click handler and 42px shared glass geometry
remain intact. Source span remains visually hidden on Home and supplies text
elsewhere. No auth, vocabulary, sentence extraction or release changes.

Local validation: full npm test, existing Home control/Reader parity at five
sizes and both themes, Wordbook search/sort/filter/edit/add/export/navigation,
ten actual final light/dark layouts with keyboard entry/return and accessible
name/tooltip, responsive brand/fallback checks, www packaging and structure.
Screenshot references are in bookmark-library-images.json.

Earlier head 09b8718 Integrity run 37641053988 failed WebKit Holmes offline
late-anchor restoration (Red-headed League), before bookmark selection. The
Chromium five works and first two WebKit works passed. Old logs did not record
actual restored coordinates, so cause is unconfirmed; later browser steps were
skipped. The assertion remains strict; diagnostic coordinates, font/image
state and failure screenshot were added without changing Reader behavior.
Exact new-head CI must be checked independently before claiming full success.
Native installation and physical phone testing are not performed locally.
