/* Local text-layout fingerprint. File identity and sync never use this value:
   imported files are identified from their complete raw-file SHA-256. */

const BOOK_FINGERPRINT_VERSION = 'f2';

function normalizeBookFingerprintText(text){
  return String(text || '')
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function bookContentFingerprint(paragraphs){
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  let length = 0;

  const feed = value => {
    for(let index = 0; index < value.length; index++){
      const code = value.charCodeAt(index);
      h1 = Math.imul((h1 ^ code) >>> 0, 0x01000193) >>> 0;
      h2 = Math.imul((h2 + code * (length + index + 1)) >>> 0, 0x85ebca6b) >>> 0;
    }
    length += value.length;
  };

  (paragraphs || []).forEach(paragraph => {
    const raw = String(paragraph || '');
    const normalized = raw.startsWith('[[IMG]]:')
      ? '[image]'
      : normalizeBookFingerprintText(raw);
    if(!normalized) return;
    feed(normalized);
    feed(' ');
  });

  return BOOK_FINGERPRINT_VERSION
    + h1.toString(36)
    + h2.toString(36)
    + (length % 1000000).toString(36);
}

function ensureBookFingerprint(book){
  if(!book) return '';
  const current = String(book.fingerprint||'');
  if(!current.startsWith(BOOK_FINGERPRINT_VERSION) && !current.startsWith('raw:')){
    book.fingerprint = bookContentFingerprint(book.paras || []);
  }
  return book.fingerprint;
}
