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
| Size | 170,858 bytes |

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
   `catalog.json`, `pride-and-prejudice/book.txt`, and
   `pride-and-prejudice/cover.webp`.

   ```
   node server/classics/upload.mjs --apply
   ```

5. Check the public URL without a key. It should return the manifest.

   ```
   curl -fsS 'https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/catalog.json'
   ```

No app release is required after that. The next Home open reads the catalog.
Another book is a new object plus one new entry in `catalog.json`, then the
same upload. The bucket is public read. The service-role key is the only
writer.

There is no SQL migration. `ready/` and `server/ready/` are not part of this.
