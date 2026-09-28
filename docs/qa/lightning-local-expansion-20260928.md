# Lightning additive 40K dictionary: Codex handoff

## What is complete

The original PR #45 10K pack is unchanged. This adds 30,000 disjoint headwords:
1,828 from the remaining Korean Wiktionary English entries, 570 from explicit
English Wiktionary Korean translations, and 27,602 lower-confidence Kengdic
fallback headwords. Total 40,000 / 56,255 Korean translations (deduped, <=3/POS).

Do not conflate **coverage** with **quality**: only 11,729 combined headwords have
source-backed POS; 28,271 have unknown POS only. Kengdic has no sense-level POS.
A source-spelling cross-check does not make its translations reviewed or frequent.
The experimental fallback is intentionally disabled unless explicitly requested.

## Integration boundary: preserve the user's working prototype

The earlier successful 400-entry Local-first Reader remains in Codex's local
worktree, not in the remote source available here. This change does NOT wire the
new data into that Reader. Do not reset, replace or rewrite that worktree.
Main, PR #44, AI prefetch, Supabase, quotas, iOS versions and releases are unchanged.

Add `local-lexicon.js` and `local-lexicon-packs.js` to the preserved local experiment,
then preload outside tap handling, e.g. when enabling the experimental switch:

```js
const lexicon = await BreezeLocalLexiconPacks.load(
  'assets/dictionaries/en-ko-expansion/manifest.json',
  {
    allowExperimentalFallback: true, // explicit 40K test; false/default = 12,398
    lemmaCandidates: BreezeLexical.lemmaCands,
    signal: experimentAbortController.signal
  }
);
// The following is synchronous and does not read disk or call the network.
const preview = lexicon.lookup({sentence, clicked, clickedIndex, cands});
```

Keep saved/manual Meaning and exact contextual-cache priority ABOVE this local
resolver. Its result is provisional: never write `preview.ko` to saved words,
resolved flags or contextual AI cache. Continue existing AI refinement; explicit
Retry bypasses local preview. Preserve tombstones, expression promotion, late
response guards and the current ~200ms refinement animation. Do not wake prefetch.

If dictionaries fail to load/checksum, keep ordinary AI lookup working. Do not
block Reader opening, and do not parse a 3.4MB JSON collection on the first tap.
Respect the toggle generation when a preload completes after OFF/account/book
changes. The loader resolves assets only on the manifest's origin.

A result includes `pack`, `license`, `sourceUrl` and `quality`; use these in the
existing detailed attribution area, not extra labels in the compact pill. Keep
CC and MPL assets as separate files. The Kengdic original is a tabular source,
so its per-row source IDs are in the separate provenance file. Do not display an
English Wiktionary URL as the source of a Korean Kengdic translation.

## Safe comparison

- Wiktionary-only: 12,398 headwords, experimental fallback OFF.
- Extended: 40,000 headwords, experimental fallback ON.
- `lexicon.stats()` separates experimentalHits and pack-local hits/misses/POS.
- Compare on natural user taps, NOT a test list selected to be in the dictionary.
- Observe wrong provisional meanings and default/POS misses, not just hit rate.
- Do not claim 98–99% coverage merely from the number of headwords.

## Local verification completed

- Original 26 Node tests and 18 new expansion Node tests passed locally (44 total).
- Each of the 42,135 new translations was traced to its exact acquired source
  row/index; old 10K dictionary hash remains identical. No generated meanings.
- Exhaustive raw-headword tests call every one of the 40K entries twice; separate
  tests use actual Breeze lemma candidates and preserve all existing 10K results.
- No tap-time network, wrong-source attribution, duplicate keys, mixed data license
  labeling, corrupted assets, or accidental default activation in contract checks.
- Node benchmark (Linux, not iPhone): parse ~52ms, initialize ~141ms, lookup p50
  ~0.0078ms / p95 ~0.0194ms; post-GC heap delta ~30MB including headword list.
  Raw JSON total 3,404,212 bytes; gzip total 772,208 bytes. Provenance is additional.

Browser harness is provided in `tests/verify-lexicon-expansion-browser.py`.
Local Chromium navigation was blocked by the environment
(`net::ERR_BLOCKED_BY_ADMINISTRATOR`); WebKit binary is absent. No browser tap,
Reader integration, actual AI refinement, EPUB/PDF or physical-device pass is
claimed. The standalone page is a local dictionary demo, not a simulated AI demo.

```sh
python3 -m http.server 4184 --bind 127.0.0.1
# open /experiments/lightning-expanded/ ; check the experimental box for all 40K
```

Before any merge/release, test actual iPhone/iPad/Safari memory, first-use loading,
normal/unknown-POS words, multiple occurrences, inflections, saved/cache priority,
AI error, quick taps, Retry, expression changes and dormant prefetch. Translation
quality and source licensing/distribution obligations need review; the larger
fallback pack is not a production-quality upgrade solely because it is larger.
