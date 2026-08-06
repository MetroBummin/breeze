/* Stable book identity shared by import and sync.
   The fingerprint ignores paragraph boundaries so the same text parsed by a
   newer importer can still be recognised as the same book. */

const BOOK_FINGERPRINT_VERSION = 'f2';

function normalizeBookTitle(title){
  return String(title || '')
    .toLowerCase()
    .replace(/[\s._-]+/g, ' ')
    .trim();
}

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

function serverRowMatchesBook(row, book){
  if(!row || !book) return false;
  if(row.book_id === book.id) return true;
  const serverFingerprint = (row.meta || {}).fingerprint || '';
  return !!serverFingerprint && serverFingerprint === ensureBookFingerprint(book);
}

function serverRowIsActive(row){
  return !!row && !(row.meta || {}).deleted;
}

function findLocalBookForServerRow(row, localBooks){
  return (localBooks || []).find(book => serverRowMatchesBook(row, book)) || null;
}

function localBookSourceTime(book, originalRecord){
  return Math.max(0,
    Number(book && book.addedAt)||0,
    Number(book && book.localSourceAt)||0,
    Number(book && book.original && book.original.storedAt)||0,
    Number(originalRecord && originalRecord.storedAt)||0);
}

/* A tombstone must not erase a copy that the user imported or reconnected
   after that deletion. Legacy tombstones without a timestamp keep their old
   delete-wins behaviour. */
function serverTombstoneShouldDelete(row, book, originalRecord){
  const meta=(row&&row.meta)||{};
  if(!meta.deleted || !book) return false;
  if(book.detachedServerId===row.book_id) return false;
  const deletedAt=Number(meta.deletedAt)||0;
  if(!deletedAt) return true;
  return localBookSourceTime(book,originalRecord)<=deletedAt;
}
