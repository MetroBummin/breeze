# Remote classics

Bundled Long Reads stay in the app. Books added here are fetched from a public
catalog, so another classic does not increase the app download.

The app requests one manifest:

`https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/catalog.json`

That URL is the default in `scripts/library/remote-classics.js`. Set
`BREEZE_CONFIG.CLASSICS_CATALOG_URL` to another https URL, or to `""`, to point
elsewhere or turn the fetch off. A failed fetch keeps the last cached manifest.
With no cache, Home and the library show the bundled books only.

## Pride and Prejudice

Reading text: `pride-and-prejudice/book.txt`

Source: [Project Gutenberg eBook #1342](https://www.gutenberg.org/ebooks/1342),
plain text retrieved 2026-10-18 from
<https://www.gutenberg.org/cache/epub/1342/pg1342.txt>
(the file Project Gutenberg updated on 2026-09-01). The underlying novel is
public domain in the United States. This is not worldwide clearance, and the
file is not a Project Gutenberg branded edition. Gutenberg’s
[license explanation](https://www.gutenberg.org/policy/license.html) separates
the text from the Gutenberg trademark. The trademark and the ebook license
boilerplate stay out of the reader. The preview and the reader attribution
link the Gutenberg catalog page.

The current Gutenberg file is a transcription of the 1894 George Allen edition
and includes Hugh Thomson illustration captions. Those captions are not in the
reading text, and no chapter illustration is shipped. Also omitted: the
Gutenberg header and footer, title pages, George Saintsbury’s preface, the
illustration list, and the Chiswick Press colophon. What remains starts at
Chapter 1 (“It is a truth universally acknowledged…”) and ends with Chapter 61
(“…the means of uniting them.”). Wrapped lines are joined into paragraphs.
Italic underscores and `M^{r.}` style markers are removed. Proofreader notes
around letters are removed. Chapter labels are `Chapter 1` through `Chapter 61`.
The prose itself is Austen’s, not a modernization.

SHA-256 of `pride-and-prejudice/book.txt`:
`e697ed5afdaa7762e1b45913cef3b8838932414c7ce4f6acfd36f1597ce4e1de`

61 chapters, 2121 paragraphs, 121,669 whitespace-delimited words, 693,618 bytes.

The reading text is a Breeze Original: the same plain-text chapter format as
the Sherlock long reads, not an EPUB. Each chapter is its own `Chapter N`
paragraph. Dialogue uses curly quotes. Gutenberg’s `--` dashes are em dashes,
and a blanked name such as the regiment is a two-em dash (`——shire`). Three
leftover printer marks (`RIGHT` before a letter’s date) are removed. Austen’s
wording is not modernized. There are no in-chapter illustrations.

## Cover

Original Breeze cover art. No film or television stills. One file replaces it.

| | |
| --- | --- |
| Object path | `classics/pride-and-prejudice/cover.webp` |
| Public URL | `https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/pride-and-prejudice/cover.webp` |
| Format | WebP (VP8) |
| Dimensions | 768 × 1152 |
| Size | 166,570 bytes |

Upload a replacement to the same path, same format, and same dimensions. The
catalog URL can stay. The upload script sends
`cache-control: public, max-age=300` for the cover, so a replacement can lag
by about five minutes.

Until that object exists, a card whose image fails to load keeps the existing
text-only book card.

## Deploy (needs approval)

Do not run `--apply` until the owner says to. Nothing in this folder is
uploaded by tests or by the app build. The Supabase CLI config in this repo
points at a different project. This script refuses any host other than
`hrtfhojbhqvaoiulspto`.

1. Confirm the project is `hrtfhojbhqvaoiulspto`.
2. Export the service-role key in the shell. Do not commit it and do not use
   the anon key from `config.js`.

   ```
   export SUPABASE_URL='https://hrtfhojbhqvaoiulspto.supabase.co'
   export SUPABASE_SERVICE_ROLE_KEY='…'
   ```

3. Read the plan. This does not write anything.

   ```
   node server/classics/upload.mjs
   ```

4. Create the public `classics` bucket if it is missing, and upsert
   `catalog.json` plus each book's `book.txt`, cover, and illustration files.

   ```
   node server/classics/upload.mjs --apply
   ```

5. Check the public URL without a key. It should return the manifest.

   ```
   curl -fsS 'https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/catalog.json'
   ```

No app release is required for a new classic's text and cover. Illustrations
and Holmes presentation need the app build that understands the fields below.
The next Home open reads the catalog. Alice and Gatsby keep the same ids as
the previously bundled copies. Until those catalog entries are public, the app
still offers the bundled files. Once the entries are public, Home uses the
catalog text, cover, and hook. The bucket is public read. The service-role key
is the only writer.

## Adding a book

`upload.mjs` reads `catalog.json`. It does not keep its own book list. For
each entry it uploads:

| Catalog field | Local file |
| --- | --- |
| `content` | `<id>/book.txt` |
| `cover` | `<id>/<cover filename>` |
| `illustrations[].file` | `<id>/illustrations/<filename>` |

`book.txt` bytes and SHA-256 must equal `bytes` and `contentVersion`. A dry
run (`node server/classics/upload.mjs`) prints that plan and checks the hash.
`--apply` writes, and only after the owner approves. URLs must stay on
`hrtfhojbhqvaoiulspto` under `classics/<id>/`.

`backroom-homeward-bound` is the dormant bundled Homeward story. Its folder
matches the objects already in the bucket. The app offers the bundled text,
cover, and ten local scenes when this id is in the catalog. It does not
replace a saved copy.

## Catalog fields for a remote Holmes story

Required on every book: `id`, `title`, `author`, `content`, `contentVersion`
(64-hex SHA-256 of `book.txt`). `id` is a lowercase slug.

Holmes presentation is automatic when `id` starts with `sherlock-holmes-`, or
when `style` is `"holmes"`. The reader then uses the same story type, byline,
and series/hook card fields as the bundled Holmes books. `series` and `hook`
are the existing card fields (`series` max 80, `hook` max 400).

Optional:

| Field | Meaning |
| --- | --- |
| `presentation` | `"story"` for the story reader (byline, chapter pages). |
| `style` | `"holmes"` if the id does not already start with `sherlock-holmes-`. |
| `sourceTitle` | `true` when the text contains its own title page. Hides the repeated reader title and the byline, the way Hound does. |
| `sections` | Up to 200 exact headings. Each item is `{paragraph, text, role}`. `paragraph` is the 0-based block index. `text` must match that block or the heading is skipped. `role` is `title`, `subtitle`, `dedication`, `signature`, `contents-heading`, `contents`, `chapter`, `section`, `end`, `scene`, `verse`, `label`, or `inscription`. `chapter` and `section` start a new page. A legacy `headings` array is read as `sections`, and a role of `heading` is stored as `section`. |
| `illustrations` | Up to 30 scenes. Each item is `{id, before, after, paragraph, file, alt, width, height}`. Placement matches bundled Holmes: the picture sits before block `paragraph` only when that block starts with `before` and the previous block starts with `after`. `file` is the public https URL. `width` and `height` are the pixel size (Holmes scenes are 1400×700). The app downloads these at import and keeps them for offline reading. |
| `cover`, `coverPosition`, `bytes`, `wordCount`, `sourceUrl`, `site`, `license`, `licenseUrl`, `originalTitle`, `edition`, `editionNote`, `glossary`, `sources` | Same metadata the bundled long reads already carry. |

An illustration or section that fails those checks is dropped. The book still loads.

Pride and Prejudice, Alice, and Gatsby keep their original wording. Their chapter headings are `sections` with role `chapter` (Alice also keeps `THE END`). Gatsby’s title-page lines are sections too (`inscription`, `verse`, `signature`) so the opening composer can join the dedication and keep the epigraph on the next page. The prose itself is unchanged.

## Sherlock Holmes novels

Three public-domain novels are remote classics, lightly modernized in the same way as the five bundled Holmes stories. The reading text keeps Doyle’s plot, dialogue meaning, paragraph order, clues and chapter structure. Edits are closed spellings (`to-day` to `today`), polite `Pray` to `please`, and a few archaic words (`whence`, `fain`, `ejaculated`, `clinched`). British spelling, Watson’s voice and period objects stay. This is not a graded reader and not a Project Gutenberg branded edition.

| Book | Gutenberg | Published words |
| --- | --- | --- |
| A Study in Scarlet | eBook #244, retrieved 2026-10-22 | 43,423 |
| The Sign of the Four | eBook #2097, retrieved 2026-10-22 | 43,099 |
| The Valley of Fear | eBook #3289, retrieved 2026-10-22 | 57,608 |

Each book has its own title page (`sourceTitle`) and `sections`: `title`, `subtitle`, `contents-heading`, `contents`, part `label`s where the novel has parts, part `section`s, and `chapter`. A Study in Scarlet also has the Watson reminiscence as an `inscription`. Valley’s epilogue is a `label` in the contents and a `chapter` in the story. Chapter headings use the Hound form, `Chapter 1. Title`. Part numbers restart, as in the source.

Covers are 768×1152 WebP, filed as `cover-framed.webp` so a replaced picture is not kept under the old URL. They use the bundled Holmes cover: a thin gold inset rule, “SHERLOCK HOLMES” and “ARTHUR CONAN DOYLE” in small caps, and the cream serif title over a darkened scene. Each novel has nine interior scenes, 1400×700 WebP, placed after the passage they show. The scenes are original cinematic illustrations in the same photographic treatment as the bundled Holmes art, not film or television stills and not copies of the period plates. Gutenberg’s Valley of Fear caption list is omitted from the reading text; those moments are the scenes instead.

There is no SQL migration. `ready/` and `server/ready/` are not part of this.
