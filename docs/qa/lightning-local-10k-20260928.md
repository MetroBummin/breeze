# Lightning local 10K — 2026-09-28

## Scope

Add a licensed 10K dataset, reproducible builder, provenance, isolated deterministic lookup/POS module, tests and standalone demo. Reader entrypoint, the 400-word experiment, #44, Supabase, quotas, prefetch flags, iOS builds and main are unchanged.

The conversation's 400-word local-first code was **not present in the remote branches inspected**. Do not overwrite that local/unpushed work or claim its UI was integrated/tested. These additive files are for narrow integration into the existing local experiment.

## Integration contract for Codex

1. Preserve the local-first worktree and keep sentence prefetch dormant. Load `scripts/dictionary/local-lexicon.js` after `modules/lexical/core.js`.
2. Preload `assets/dictionaries/en-ko-10k/dictionary.json` at Lightning enable/idle, never await network/disk/JSON parsing inside a tap. Failed or unfinished load must retain ordinary AI lookup.
3. Pass the existing occurrence's `{sentence,clicked,clickedIndex,cands}`. Same tokenization pattern, repeated spellings distinguished by index.
4. Preserve saved/manual meaning → exact contextual cache → local preview → ordinary AI. Local hits MUST NOT skip the AI request, become `word.ko`, saved meaning, or contextual AI cache entries.
5. Render only `result.ko` provisionally using the existing 400-word pill/lifecycle and 200ms refinement effect. AI remains final, with existing expression promotion, cleanup, deletion and stale-response rules.
6. Retry bypasses local. Preserve the original reviewed 400 entries explicitly where appropriate; this dataset is NOT a verified superset of that unseen list.
7. Keep dataset attribution/license accessible in settings/about and distribute its source/provenance notice.

```js
// Enable/idle only, NOT the tap handler:
let localLexicon = null;
try {
  localLexicon = await BreezeLocalLexicon.load(
    'assets/dictionaries/en-ko-10k/dictionary.json?v=<dictionarySha256>',
    {expectedSha256:'<dictionarySha256 from manifest.json>'}
  );
} catch (error) { /* ordinary AI remains available */ }
// Once per eligible new opening AFTER saved/cache precedence:
const provisional = localLexicon?.lookup(currentOccurrence) || null;
// Render only. Never applyLook(provisional), createMeaning(...) or saveWords().
```

Use the existing stamp/build mechanism when adding imports. No unrelated Reader geometry, CSS, backend or vocabulary-schema changes are needed.

## POS limits

No server/ML dependency or contextual sense disambiguation. Deterministic rules cover subject/auxiliary, determiner, explicit infinitive, intensifier and progressive cues; unique source POS can be reused. Ambiguous POS uses default. Competing lemmas do not assert a POS-specific answer. Capitalized mid-sentence names/acronyms are skipped rather than mapped to lowercased common nouns.

`They record a record.` checks verb index 1 and noun index 3. Inflections reuse the existing lexical candidate helper. `The light box...` and competing `saw/see` lemmas abstain. Rules are incomplete; **deterministic is not a POS accuracy claim**. No within-POS WSD is attempted.

`posMatched` counts routing, not accuracy. Call once per eligible tap, not each render. This isolated module does not measure actual AI latency or local-to-AI change rates; retain those counters in the 400-word adapter.

## Verification

- 26 Node checks passed locally: all 10,000 lookups twice, sync/deterministic/read-only output, every sense's provenance reference, input validation, repeated occurrence, inflection, POS fallback and no tap-time network.
- Source verifier traced all 14,120 senses to actual pinned source rows and explicit POS/category metadata.
- Node/Linux CPU benchmark included; NOT iPhone tap-to-paint, retained memory or Reader latency.
- Local Chromium navigation was blocked by `net::ERR_BLOCKED_BY_ADMINISTRATOR`; no successful local browser/physical-device UI test is claimed.
- No live AI requests/provider changes. Reader saved/cache/Retry behavior needs integration testing in Codex's existing local branch.

## Demo

```sh
python3 -m http.server 4184 --bind 127.0.0.1
# http://127.0.0.1:4184/experiments/lightning-10k/
```

Local-only preview and rule debug. No AI calls, sentence prefetch, Wordbook writes or simulated successful refinement. Check repeated `record`, inflections, a miss and source attribution. Separately verify the actual Reader with its preserved local-first adapter.
