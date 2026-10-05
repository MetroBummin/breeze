// Opt-in observations only. Run beside an uninstrumented control: these reads
// change timing and Blob lifetime. Never await inside an IDB request callback.
(() => {
  const events = [];
  const record = value => {events.push({at: performance.now(), ...value});sessionStorage.setItem('import-byte-diagnostics',JSON.stringify(events));};
  const inspect = async (stage, key, value) => {
    const blob = imageRecordBlob(value);
    const entry = {stage, key, representation: value instanceof Blob ? 'native-blob' : value?.imageBytes instanceof ArrayBuffer ? 'binary' : typeof value, size: blob?.size, type: blob?.type};
    try {
      const bytes = await blob.arrayBuffer();
      entry.read = 'passed'; entry.byteLength = bytes.byteLength;
      try { entry.sha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join(''); }
      catch (error) { entry.digestError = String(error); }
    } catch (error) { entry.read = 'failed'; entry.error = String(error); }
    record(entry);
  };
  const entries = async (stage, prefix) => {
    try {
      for (const [key, value] of await imgEntries()) if (String(key).startsWith(prefix)) await inspect(stage, key, value);
    } catch (error) { record({stage, error: String(error)}); }
  };
  const put = imgPut, commit = commitImportedBook, purge = imgPurge, snapshot = commitQA.snapshot;
  imgPut = async (key, blob) => {
    await inspect('put-input', key, blob);
    try {
      const result = await put(key, blob);
      record({stage: 'put-transaction', key, outcome: 'completed'});
      await inspect('staged-after-write-get', key, await localRead('imgs', key));
      return result;
    } catch (error) { record({stage: 'put-transaction', key, outcome: 'rejected', error: String(error)}); throw error; }
  };
  commitImportedBook = async (...args) => {
    const [book, , prefix] = args;
    await entries('staged-before-commit-getAll', prefix + '|');
    try {
      const result = await commit(...args);
      record({stage: 'promotion-transaction', outcome: 'completed'});
      await entries('final-after-commit-getAll', book.id + '|');
      return result;
    } catch (error) { record({stage: 'promotion-transaction', outcome: 'rejected', error: String(error)}); throw error; }
  };
  imgPurge = async (...args) => {record({stage: 'purge-called', prefix: args[0]}); return purge(...args);};
  commitQA.snapshot = async (...args) => {
    try { const result = await snapshot(...args); record({stage: 'original-snapshot', outcome: 'passed'}); return result; }
    catch (error) {
      record({stage: 'original-snapshot', outcome: 'failed', error: String(error)});
      // Diagnostic only: never substitute a subsequent successful read.
      const book = books.find(b => b.kind === 'epub');
      for (const [key] of await imgEntries()) if (String(key).startsWith(book?.id + '|')) {
        await inspect('failed-snapshot-direct-get', key, await localRead('imgs', key));
      }
      throw error;
    }
  };
  window.importByteDiagnostics = {events, afterCase: async () => record({stage: 'case-ended'})};
})();
