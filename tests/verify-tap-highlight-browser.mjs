import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const mime = {'.js':'text/javascript', '.css':'text/css', '.html':'text/html', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.svg':'image/svg+xml', '.epub':'application/epub+zip', '.txt':'text/plain'};
const server = createServer((req, res) => {
  const path = resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

function auditTapHighlight() {
  const transparent = color => {
    if (color === 'transparent') return true;
    const match = String(color).match(/rgba?\(([^)]+)\)/);
    if (!match) return false;
    const parts = match[1].split(',').map(part => part.trim());
    return parts.length === 4 && Number(parts[3]) === 0;
  };
  const classes = el => typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean) : [];
  const tappable = el => {
    const tag = el.tagName;
    const role = el.getAttribute('role') || '';
    const names = classes(el);
    if (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || tag === 'LABEL') return true;
    if (role === 'button' || role === 'tab' || role === 'link') return true;
    if (names.some(name => ['bookcard','casual','home-regular-tile','w','epub-touch-skin','control-glass','navbtn','section-link'].includes(name))) return true;
    return getComputedStyle(el).cursor === 'pointer';
  };
  const bad = [];
  let count = 0;
  const visit = (el, where) => {
    if (!(el instanceof Element) || !tappable(el)) return;
    count++;
    const color = getComputedStyle(el).webkitTapHighlightColor;
    if (!transparent(color)) bad.push({where, tag: el.tagName, id: el.id, className: classes(el).slice(0, 3).join('.'), role: el.getAttribute('role') || '', color});
  };
  const visitDocument = (doc, where) => {
    if (!doc) return;
    visit(doc.documentElement, where + ':html');
    if (doc.body) visit(doc.body, where + ':body');
    for (const el of doc.querySelectorAll('*')) visit(el, where);
  };
  visitDocument(document, 'app');
  const frames = [];
  for (const frame of document.querySelectorAll('iframe.epub-chapter-frame')) {
    const doc = frame.contentDocument;
    const text = doc && doc.body ? doc.body.innerText.trim() : '';
    if (!text) continue;
    frames.push({text: text.slice(0, 40), nodes: doc.querySelectorAll('*').length});
    visitDocument(doc, 'epub');
  }
  return {count, bad: bad.slice(0, 6), badCount: bad.length, frames};
}

function assertClear(report, label, minimum) {
  assert.ok(report.count >= minimum, `${label} checked ${report.count} tappables, wanted at least ${minimum}`);
  assert.deepEqual(report.bad, [], `${label} still paints a tap highlight: ${JSON.stringify(report.bad)}`);
}

const browser = await chromium.launch({headless: true});
try {
  const page = await browser.newPage({
    viewport: {width: 412, height: 915},
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.200 Mobile Safari/537.36',
    serviceWorkers: 'block',
  });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(url) || route.request().url().startsWith('blob:') ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
  await page.goto(url, {waitUntil: 'domcontentloaded'});
  await page.evaluate(() => homeReady);
  await page.locator('#fileinput').setInputFiles(resolve(root, 'tests/fixtures/sample.epub'));
  await page.waitForFunction(() => books.some(book => book.kind === 'epub'));

  await page.evaluate(() => show('home'));
  const home = await page.evaluate(auditTapHighlight);
  assertClear(home, 'Home', 8);
  assert.ok(await page.locator('#v-home .bookcard, #shelf .bookcard').count() > 0, 'Home has no book card');
  assert.ok(await page.locator('#shelf .home-regular-tile').count() > 0, 'Home shelf has no tile around the book card');
  assert.equal(await page.locator('#home-recommend-kind button[data-kind="books"]').innerText(), '책');

  const booksTab = page.locator('#home-recommend-kind button[data-kind="books"]');
  const booksBox = await booksTab.boundingBox();
  await page.mouse.move(booksBox.x + booksBox.width / 2, booksBox.y + booksBox.height / 2);
  await page.mouse.down();
  const booksPressed = await booksTab.evaluate(el => ({
    active: el.matches(':active'),
    opacity: getComputedStyle(el).opacity,
    tap: getComputedStyle(el).webkitTapHighlightColor,
  }));
  await page.mouse.move(2, 2);
  await page.mouse.up();
  assert.equal(booksPressed.active, true, '책 tab did not take the pressed state');
  assert.equal(booksPressed.opacity, '0.72', '책 tab lost its app pressed opacity');
  assert.equal(booksPressed.tap, 'rgba(0, 0, 0, 0)');

  const add = page.locator('#home-add');
  const addBox = await add.boundingBox();
  await page.mouse.move(addBox.x + addBox.width / 2, addBox.y + addBox.height / 2);
  await page.mouse.down();
  const addPressed = await add.evaluate(el => ({active: el.matches(':active'), filter: getComputedStyle(el).filter}));
  await page.mouse.move(2, 2);
  await page.mouse.up();
  assert.equal(addPressed.active, true, 'Add control did not take the pressed state');
  assert.match(addPressed.filter, /brightness\(0\.92\)/, 'Add control lost its app pressed filter');

  await page.locator('#nav-settings').tap();
  await page.waitForFunction(() => document.getElementById('settings-modal').classList.contains('on'));
  const settings = await page.evaluate(auditTapHighlight);
  assertClear(settings, 'settings', 6);
  assert.equal(await page.locator('#set-close').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'tap left a system focus box on settings close');
  await page.keyboard.press('Tab');
  await page.locator('#set-close').focus();
  assert.notEqual(await page.locator('#set-close').evaluate(el => getComputedStyle(el).outlineStyle), 'none', 'keyboard focus ring disappeared');
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('settings-modal').classList.contains('on'));

  await page.evaluate(() => show('longform'));
  const library = await page.evaluate(auditTapHighlight);
  assertClear(library, '책', 4);
  assert.ok(await page.locator('#v-longform .bookcard').count() > 0, '책 library has no book card');

  await page.evaluate(async () => { await openBook(books.find(book => book.kind === 'epub')); });
  await page.waitForFunction(() => originalSession && originalSession.kind === 'epub'
    && originalSession.frames.some(frame => frame && frame.contentDocument && frame.contentDocument.body
      && frame.contentDocument.body.innerText.trim().length > 20), null, {timeout: 30000});
  const original = await page.evaluate(auditTapHighlight);
  assert.ok(original.frames.length > 0, 'EPUB iframe did not load');
  assertClear(original, 'reader original', 4);
  assert.ok(original.count > home.count, 'EPUB frame tappables were not included');

  await page.evaluate(() => switchReaderMode('text'));
  await page.waitForFunction(() => document.querySelectorAll('#rtext .w').length > 3);
  const text = await page.evaluate(auditTapHighlight);
  assertClear(text, 'reader text', 8);
  assert.ok(await page.locator('#rtext .w').count() > 3, 'reader text has no words');
  const readback = page.locator('#readback');
  const readBox = await readback.boundingBox();
  await page.mouse.move(readBox.x + readBox.width / 2, readBox.y + readBox.height / 2);
  await page.mouse.down();
  const readPressed = await readback.evaluate(el => ({active: el.matches(':active'), background: getComputedStyle(el).backgroundColor}));
  await page.mouse.move(2, 2);
  await page.mouse.up();
  assert.equal(readPressed.active, true, 'Reader back control did not take the pressed state');

  await page.evaluate(() => show('memory'));
  const memory = await page.evaluate(auditTapHighlight);
  assertClear(memory, '단어장', 3);
  assert.ok(await page.locator('#v-memory button, #memory-home-controls button').count() > 0, '단어장 has no buttons');

  await page.evaluate(() => show('vocab'));
  const vocab = await page.evaluate(auditTapHighlight);
  assertClear(vocab, '단어장 목록', 3);

  assert.deepEqual(errors, [], errors.join('\n'));
} finally {
  await browser.close();
  server.close();
}
console.log('Android tap highlight is transparent on Home, 책, reader, 단어장, settings, and EPUB frames.');
