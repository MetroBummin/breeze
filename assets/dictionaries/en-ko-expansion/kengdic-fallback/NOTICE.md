# Kengdic fallback data notice

Copyright: Joe Speigle and Kengdic contributors.
Original: https://github.com/garfieldnate/kengdic
Snapshot: 793de2369c9a98b944154eb4695d26854d2de59b

This Source Code Form is subject to the terms of the Mozilla Public License,
v. 2.0. If a copy of the MPL was not distributed with this file, You can obtain
one at https://mozilla.org/MPL/2.0/.

The upstream README explicitly offers MPL 2.0 or LGPL 2.0 or later; this adaptation
uses the MPL 2.0 option. We do not adopt the inconsistent CC label found in the
upstream datapackage.json. Original notice:
https://github.com/garfieldnate/kengdic/blob/793de2369c9a98b944154eb4695d26854d2de59b/README.md

Modifications: reverse exact single-word English gloss/Korean fields into a
lookup map, normalize whitespace, reject unsuitable/duplicate rows, cap three
translations, preserve UNKNOWN POS and source records. No AI translations.
Dictionary JSON, the Kengdic-derived fields of provenance, and adaptations remain
MPL 2.0. Rebuild/filter source code: tools/build-lightning-expansion.py. JSON is
provided in readable source form, not only a compiled application bundle.

English-lemma metadata is stored separately in ../en-lemma-evidence.jsonl.gz,
attributed to English Wiktionary contributors / Kaikki, CC BY-SA 4.0. The numeric
`englishLemmaLine` in the MPL provenance references that independently licensed
file. It checks headword existence, not Korean sense POS. See
https://creativecommons.org/licenses/by-sa/4.0/ . Do not merge the CC evidence into
this MPL data file or relabel either source.

No warranty of correctness. Upstream explicitly reports dirty translations.
This experimental fallback is opt-in and is not production-approved.
