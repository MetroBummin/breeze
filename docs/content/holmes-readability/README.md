# Five Holmes works: paragraph readability audit

Base: main `e7b61d5304d20d639d45fc8dd23116db5d6446e5`. Scope is the five active Holmes catalog works, not Backrooms or PDF. No author wording, quotation punctuation, modernization, story order, asset bytes, saved book ID, `paras` index, fingerprint, progress model, or illustration anchor changes.

| Work | Stored blocks | Restored source p/br breaks | Editorial display breaks | Changed blocks |
| --- | ---: | ---: | ---: | ---: |
| The Adventure of the Speckled Band | 251 | 0 | 5 | 2 |
| A Scandal in Bohemia | 261 | 1 | 1 | 2 |
| The Red-Headed League | 218 | 0 | 1 | 1 |
| The Final Problem | 123 | 17 | 4 | 18 |
| The Hound of the Baskervilles | 1328 | 167 | 27 | 174 |

## Findings and source evidence

Official HTML retrieved 2026-10-08 (full file SHA-256 in `sources.json`):

- [Adventures #1661](https://www.gutenberg.org/cache/epub/1661/pg1661-images.html): Speckled Band and Red-Headed League already preserve prose/dialogue paragraph boundaries. Bohemia collapses the letter's salutation/signature lines into one block: “Very truly yours” and Irene Norton's signature are separate source lines. Existing I/II/III headings remain.
- [Memoirs #834, Final Problem](https://www.gutenberg.org/cache/epub/834/pg834-images.html#chap12): 16 stored blocks contain 17 source divisions. Collapsed prose, speech transitions and the farewell signature explain the long runs. The opening account and successive attacks remain intrinsically long after restoring source divisions; four additional display pauses are separately documented.
- [Hound #2852](https://www.gutenberg.org/cache/epub/2852/pg2852-images.html): 164 stored blocks contain 167 p/br divisions. At stored index 14, Watson's question ending “back of your head” and Holmes's “I have, at least” are distinct source paragraphs. The legend contains indented original paragraphs encoded with `br`; the newspaper and report material also uses source line structure. Preserve the fifteen chapter headings, dedication, contents and ending.

The extractor compares complete whitespace/italic-delimiter-normalized character sequences, normalizes straight/curly quotes, em-dash/double-hyphen and the older Speckled Band currency convention, then locates source prose p/br boundaries within each original baseline block (line breaks within chapter headings are deliberately excluded). The already logged modernization is replayed on each source-confirmed run; joined runs must exactly equal the bundled adapted block. `source-paragraphs.json` stores these source-confirmed runs **in existing adapted spelling**, not a new raw-source edition. Raw-source file hashes are provenance of downloaded HTML, not hashes of these adapted runs.

Two Speckled Band currency-bearing baseline blocks (zero-based 24/114) do not match the strict concatenation locator because the older baseline places “pounds” after the quantity; the corresponding official paragraphs were inspected and no new source boundary was assigned. Hound's subtitle, compound contents and THE END are outside the extractor's p/h1/h2/h3 set; the existing exact-text heading/frontmatter renderer handles them. No unmatched text is replaced or omitted.

## Editorial decisions

`editorial-breaks.json` lists every extra pause, with zero-based saved paragraph index, unique exact next-text locator and reason. These are readability subdivisions **inside** original paragraphs, not claims about Doyle's original paragraphing. They separate setting/action/help in Helen's long account, stages of Holmes's deductions, the staged quarrel/intervention in Bohemia, the invitation to Wilson, Watson's reasons for writing and successive attacks in Final Problem, and distinct evidence/action/report stages in Hound. No generic sentence-count/length splitter runs in the app. Quotation marks are not added, so a display break never invents a new speech or narrator.

`boundaries.json` separates source and editorial cuts. `scripts/library/holmes-layout.js` contains only lengths, fingerprints and character offsets; it refuses altered/custom paragraphs or rendered alternative text. One existing `[data-pi]` block contains display spans separated by the original space. This preserves textContent/DOM-range offsets and the existing sentence/word lookup coordinate. Lazy word hydration and dehydration preserve the display spans. Existing saved copies acquire presentation on render; no data migration or startup book rewrite is needed.

The Reader still uses its established custom word/sentence selection. Native OS text selection remains disabled by the existing policy; DOM Range and `textSentencePartAt` regression checks cover exact text and context in the new nested spans.

## Layout, coverage and cache verification

The whole-story browser audit traverses **all 2,181 saved blocks**, checks exact text in order before/after word hydration, verifies every subdivision and gap, checks horizontal clipping and reachability, and opens the last changed paragraph offline after real IDB reload. Phone 390×844, tablet 820×1180, desktop 1440×900, short phone 320×568 and landscape 844×390 are checked in light/dark in Chromium and WebKit. Representative screenshots show identical books and coordinates with display subdivisions toggled before/after; this isolates the paragraph presentation. Existing illustration tests independently verify all 50 decoded scenes and their after-passage placement, all chapter headings and previous offline anchors.

The Chromium cache regression starts from the real e7b61d5 shell, imports the five stories, saves late positions, installs the new complete stamped shell while keeping the old active Reader, closes the old client, then opens the new shell cold offline. It checks the new module and the same five books, covers, fingerprints and positions. Playwright does not support WebKit service-worker lifecycle automation; WebKit IDB/offline-reader checks run separately. Browser evidence is not physical iPhone/iPad gesture or performance evidence.

Reproduce:

```sh
node tools/build-holmes-layout.mjs
node --test tests/verify-holmes-readability.mjs
node tests/verify-holmes-readability-browser.mjs
BREEZE_HOLMES_BASELINE=/path/to/clean/e7b61d5 node tests/verify-holmes-readability-cache-browser.mjs
node tools/audit-holmes-layout-sources.mjs /path/to/downloaded/1661-834-2852-html
npm run test:holmes
npm test
```

Screens and structured observations: `/tmp/breeze-holmes-readability-proof/`; existing illustrations: `/tmp/breeze-holmes-integration-proof/`. Final run evidence and exact commit are in the PR. No merge, deployment or native build/upload is part of this change.
