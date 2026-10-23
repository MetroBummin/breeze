/* App-wide page zoom lock.
   Desktop Chromium and WebKit emulation do not move visualViewport.scale even
   on an unlocked page, so a scale-only check would stay green if this lock
   were removed. This test therefore asserts the live lock (viewport meta,
   universal touch-action, native-shell font sizes, EPUB iframe viewport) and
   still runs double-tap, pinch, and input focus on each main screen.
   In-reader PDF zoom is a CSS transform and must keep working. */
import {chromium, webkit, devices} from 'playwright';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = {
  '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.epub': 'application/epub+zip', '.txt': 'text/plain'
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;

function fixturePdf() {
  const content = 'BT /F1 18 Tf 1 0 0 1 72 720 Tm (A patient reader keeps every meaning together.) Tj ET';
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 1 /Kids [3 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}

async function scaleOf(page) {
  return page.evaluate(() => window.visualViewport ? window.visualViewport.scale : 1);
}
async function assertScale(page, label) {
  const scale = await scaleOf(page);
  assert.equal(scale, 1, `${label}: visualViewport.scale was ${scale}`);
}
async function pointFor(page, selectors) {
  return page.evaluate(selectors => {
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.bottom < 8 || rect.top > innerHeight - 8) continue;
      return {
        x: Math.min(innerWidth - 8, Math.max(8, rect.left + Math.min(rect.width / 2, 160))),
        y: Math.min(innerHeight - 8, Math.max(8, rect.top + Math.min(rect.height / 2, 28))),
        selector
      };
    }
    return {x: Math.round(innerWidth / 2), y: Math.round(innerHeight / 2), selector: 'viewport-center'};
  }, selectors);
}
async function provoke(page, cdp, selectors, label) {
  const point = await pointFor(page, selectors);
  if (cdp) {
    await cdp.send('Input.synthesizeTapGesture', {...point, tapCount: 2, gestureSourceType: 'touch', duration: 40});
    await page.waitForTimeout(180);
    await assertScale(page, `${label} double-tap`);
    await cdp.send('Input.synthesizePinchGesture', {x: point.x, y: point.y, scaleFactor: 2.2, relativeSpeed: 400, gestureSourceType: 'touch'});
    await page.waitForTimeout(220);
    await assertScale(page, `${label} pinch`);
  } else {
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(40);
    await page.touchscreen.tap(point.x, point.y);
    await page.waitForTimeout(180);
    await assertScale(page, `${label} double-tap`);
  }
  return point.selector;
}
async function focusFields(page, label) {
  const fields = await page.evaluate(() => {
    const skip = new Set(['checkbox', 'radio', 'file', 'hidden', 'range', 'button', 'submit', 'reset', 'color', 'image']);
    return [...document.querySelectorAll('input, textarea, select, [contenteditable="true"]')].map((el, index) => {
      el.setAttribute('data-zoom-lock', String(index));
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const type = (el.getAttribute('type') || '').toLowerCase();
      const hidden = el.hidden || !!el.closest('[hidden]') || style.display === 'none' || style.visibility === 'hidden'
        || rect.width < 2 || rect.height < 2 || !!el.closest('[inert]');
      return {
        index, type, hidden,
        tag: el.tagName.toLowerCase(),
        id: el.id || '',
        fontSize: parseFloat(style.fontSize),
        userSelect: style.webkitUserSelect || style.userSelect,
        text: !skip.has(type)
      };
    });
  });
  for (const field of fields) {
    if (!field.text || field.hidden) continue;
    const name = field.id || field.tag;
    assert.ok(field.fontSize >= 16, `${label} ${name} is ${field.fontSize}px`);
    if (field.tag !== 'select') assert.notEqual(field.userSelect, 'none', `${label} ${name} lost text selection`);
    await page.evaluate(index => document.querySelector(`[data-zoom-lock="${index}"]`)?.focus(), field.index);
    await page.waitForTimeout(60);
    await assertScale(page, `${label} focus ${name}`);
    await page.evaluate(() => { const active = document.activeElement; if (active && active.blur) active.blur(); });
  }
}
async function importFile(page, files) {
  await page.evaluate(() => {
    const input = document.getElementById('fileinput');
    if (input) input.value = '';
  });
  const count = await page.evaluate(() => books.length);
  await page.locator('#fileinput').setInputFiles(files);
  await page.waitForFunction(count => books.length > count, count, {timeout: 45000});
}
async function assertLock(page) {
  const lock = await page.evaluate(() => ({
    meta: document.querySelector('meta[name=viewport]')?.getAttribute('content') || '',
    html: getComputedStyle(document.documentElement).touchAction,
    native: document.documentElement.classList.contains('native-shell')
  }));
  assert.match(lock.meta, /maximum-scale=1/);
  assert.match(lock.meta, /user-scalable=no/);
  assert.equal(lock.html, 'pan-x pan-y');
  assert.equal(lock.native, true);
}

const textFile = {
  name: 'zoom-lock.txt', mimeType: 'text/plain',
  buffer: Buffer.from('A patient reader keeps every meaning together. Another sentence gives the page a second line.\n\n'.repeat(12))
};

async function runProfile(browser, device, label, useCdp) {
  const context = await browser.newContext({...device, serviceWorkers: 'block'});
  await context.addInitScript(() => {
    localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done'));
    window.Capacitor = {isNativePlatform: () => true, getPlatform: () => 'ios'};
    window.breezeInkIPad = true;
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin) || url.startsWith('blob:') || url.startsWith('data:')) return route.continue();
    return route.abort();
  });
  let cdp = null;
  if (useCdp) cdp = await context.newCDPSession(page);
  await page.goto(origin + '/?viewport-lock=1', {waitUntil: 'domcontentloaded'});
  await page.waitForFunction(() => document.documentElement.classList.contains('native-shell') && typeof show === 'function');
  await assertLock(page);
  await assertScale(page, label + ' boot');

  async function visit(name, prepare, selectors) {
    await prepare();
    await assertLock(page);
    await assertScale(page, `${label} ${name} before`);
    const hit = await provoke(page, cdp, selectors, `${label} ${name}`);
    await focusFields(page, `${label} ${name}`);
    console.log(JSON.stringify({label, name, hit, scale: await scaleOf(page)}));
  }

  await visit('Home', () => page.evaluate(() => { closeSettings?.(); closeAddModal?.(); show('home'); }), ['#v-home h1', '#v-home']);
  await visit('Library casuals', () => page.evaluate(() => show('casuals')), ['#v-casuals h1', '#v-casuals']);
  await visit('Library classics', () => page.evaluate(() => show('longform')), ['#v-longform h1', '#v-longform']);
  await visit('Settings', () => page.evaluate(() => { show('home'); openSettings(); }), ['#set-card', '#settings-modal']);
  await visit('Sign-in', () => page.evaluate(() => openSettings('sync')), ['#sm-email', '#set-card']);
  await visit('Import paste', () => page.evaluate(() => { closeSettings?.(); openAddModal('casual'); addStep('paste'); }), ['#am-text', '#am-card']);
  await visit('Import URL', () => page.evaluate(() => { openAddModal('casual'); addStep('url'); }), ['#am-url', '#am-card']);
  await visit('Reader text', async () => {
    await page.evaluate(() => closeAddModal?.());
    await importFile(page, textFile);
    await page.evaluate(() => openBook(books[0]));
    await page.waitForSelector('#rtext .w', {timeout: 15000});
  }, ['#rtext .w', '#readwrap']);
  await visit('Word lookup', async () => {
    await page.evaluate(() => {
      const word = document.querySelector('#rtext .w');
      selectWord(word.textContent.toLowerCase().replace(/[^a-z'-]/g, ''), word, false);
    });
    await page.waitForFunction(() => document.getElementById('panel').classList.contains('on'), null, {timeout: 8000});
  }, ['#panel', '#p-word']);
  await visit('Sentence lookup', async () => {
    await page.evaluate(() => openSentence('A patient reader keeps every meaning together.'));
    await page.waitForFunction(() => document.getElementById('sentence-modal').hidden === false, null, {timeout: 8000});
  }, ['#ps-en', '#p-sentence', '#sentence-modal']);
  // Playwright WebKit rejects the PDF/EPUB IndexedDB write
  // ("Local storage transaction failed"), so those screens cannot be opened
  // there. Chromium iPhone and iPad still open them, including pinch.
  if (useCdp) {
    await visit('Reader PDF', async () => {
      await page.evaluate(() => { closeSentence(); closePanel(); show('home'); });
      await importFile(page, {name: 'zoom-lock.pdf', mimeType: 'application/pdf', buffer: fixturePdf()});
      await page.evaluate(() => openBook(books[0]));
      await page.waitForFunction(() => originalSession && originalSession.kind === 'pdf' && document.body.classList.contains('reader-original'), null, {timeout: 20000});
    }, ['.pdf-source-page', '#originalwrap']);
    assert.equal(await page.locator('#pdfzoom-in, #pdfzoom-out, #aa-pdfzoom').count(), 0, 'Retired Aa PDF zoom buttons came back');
    const zoom = await page.evaluate(() => {
      const before = originalZoom();
      setOriginalZoom(Math.min(4, before + 0.5));
      return {before, after: originalZoom(), transform: document.getElementById('original-zoom')?.style.transform || ''};
    });
    assert.ok(zoom.after > zoom.before, 'PDF pinch commit no longer changes originalZoomLevel');
    assert.match(zoom.transform, /scale\(/);
    await assertScale(page, label + ' PDF paper zoom');
    await page.evaluate(() => resetOriginalZoom());
    assert.equal(await page.evaluate(() => originalZoom()), 1);
    await assertScale(page, label + ' PDF paper zoom reset');
    await visit('Handwriting', async () => {
      const entry = page.locator('.ink-pill-entry');
      await entry.first().waitFor({state: 'visible', timeout: 8000});
      await entry.first().click();
    }, ['#pdf-ink-tools', '.pdf-source-page', '#originalwrap']);
    await visit('Reader EPUB', async () => {
      await page.evaluate(() => show('home'));
      await importFile(page, resolve(root, 'tests/fixtures/sample.epub'));
      await page.evaluate(() => openBook(books[0]));
      await page.waitForFunction(() => originalSession && originalSession.kind === 'epub'
        && (originalSession.frames || []).some(frame => frame && frame.contentDocument && frame.contentDocument.body), null, {timeout: 20000});
      const frame = await page.evaluate(() => {
        const item = originalSession.frames.find(frame => frame && frame.contentDocument && frame.contentDocument.body);
        const doc = item.contentDocument;
        return {
          touch: getComputedStyle(doc.documentElement).touchAction,
          userSelect: getComputedStyle(doc.body).webkitUserSelect || getComputedStyle(doc.body).userSelect,
          viewport: doc.querySelector('meta[name=viewport]')?.getAttribute('content') || ''
        };
      });
      assert.equal(frame.touch, 'pan-x pan-y');
      assert.notEqual(frame.userSelect, 'none', 'EPUB caret selection was turned off');
      assert.match(frame.viewport, /maximum-scale=1/);
      assert.match(frame.viewport, /user-scalable=no/);
    }, ['.epub-touch-skin', '#originalwrap']);
  }
  await visit('Vocab', async () => {
    await page.evaluate(() => {
      words = {quiet: {word: 'quiet', ko: '조용한', example: 'The room is quiet.', book: 'Book', status: 2}};
      saveWords(); show('vocab'); renderVocab();
      openStudySetsAllWords();
    });
    // The search field stays hidden until the all-words list places it.
    await page.locator('#vsearch').waitFor({state: 'visible', timeout: 8000});
    const search = page.locator('#vsearch');
    await search.fill('quiet');
    await search.focus();
    await page.evaluate(() => document.getElementById('vsearch').setSelectionRange(1, 4));
    await page.keyboard.insertText('oak');
    assert.equal(await search.inputValue(), 'qoakt');
  }, ['#vsearch', '#v-vocab']);
  await assertScale(page, label + ' vocab selection');
  await visit('Word sets', () => page.evaluate(() => show('memory')), ['#v-memory h1', '#v-memory']);
  await visit('Cards', async () => {
    await page.evaluate(async () => { show('vocab'); await openVocabularyReview(); });
    await page.waitForSelector('#review-flip', {timeout: 8000});
    assert.equal(await page.locator('#review-flip').evaluate(node => getComputedStyle(node).touchAction), 'none');
  }, ['#review-flip', '#v-study']);

  assert.deepEqual(errors, [], label + ' page errors: ' + errors.join('\n'));
  await context.close();
}

const engines = [
  ['chromium-iphone', chromium, devices['iPhone 13'], true],
  ['chromium-ipad', chromium, devices['iPad Pro 11'], true],
  ['webkit-iphone', webkit, devices['iPhone 13'], false]
];
try {
  for (const [label, engine, device, useCdp] of engines) {
    const browser = await engine.launch();
    try { await runProfile(browser, device, label, useCdp); }
    finally { await browser.close(); }
  }
} finally {
  server.close();
}
console.log('viewport lock stayed at scale 1 on every main screen');
