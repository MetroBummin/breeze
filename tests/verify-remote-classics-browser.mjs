import assert from 'node:assert/strict';
import {mkdirSync, readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const proof = process.env.BREEZE_REMOTE_PROOF || '/tmp/breeze-remote-classics';
mkdirSync(proof, {recursive: true});
const catalog = readFileSync(resolve(root, 'server/classics/catalog.json'));
const novel = readFileSync(resolve(root, 'server/classics/pride-and-prejudice/book.txt'));
const cover = readFileSync(resolve(root, 'server/classics/pride-and-prejudice/cover.webp'));
const id = 'pride-and-prejudice';
const card = `#casual-rail .longread[data-longread-id="${id}"]`;
const libraryCard = `#longform-grid .longread[data-longread-id="${id}"]`;

const server = createServer((req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html'));
  if (!path.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({
      '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
    })[extname(path)] || 'text/plain; charset=utf-8');
    res.end(readFileSync(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;

let bookFetches = 0, bookStatus = 200, bookGate = null, catalogFails = false;
const browser = await chromium.launch();
const pageErrors = [];
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
  await context.addInitScript(() => localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
  const page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', async route => {
    const url = route.request().url().split('#')[0].split('?')[0];
    if (url.startsWith(base) || route.request().url().startsWith('blob:')) return route.continue();
    if (url.endsWith('/classics/catalog.json')) {
      if (catalogFails) return route.fulfill({status: 503, body: 'offline'});
      return route.fulfill({status: 200, contentType: 'application/json; charset=utf-8', body: catalog});
    }
    if (url.endsWith('/classics/pride-and-prejudice/book.txt')) {
      bookFetches++;
      if (bookGate) await bookGate;
      if (bookStatus !== 200) return route.fulfill({status: bookStatus, body: 'missing'});
      return route.fulfill({
        status: 200, contentType: 'text/plain; charset=utf-8',
        headers: {'content-length': String(novel.length)}, body: novel,
      });
    }
    if (url.endsWith('/classics/pride-and-prejudice/cover.webp'))
      return route.fulfill({status: 200, contentType: 'image/webp', body: cover});
    return route.abort();
  });

  await page.goto(base);
  await page.evaluate(() => homeReady);
  await page.waitForFunction(bookId => remoteClassicCatalogReads().some(read => read.id === bookId), id);
  assert.equal(bookFetches, 0, 'The catalog fetch downloaded the novel');

  await page.locator('#home-recommend-kind [data-kind="books"]').click();
  await page.locator(card).scrollIntoViewIfNeeded();
  await page.waitForFunction(selector => {
    const image = document.querySelector(`${selector} img.cover`);
    return image && !image.hidden && image.naturalWidth === 768;
  }, card);
  const titles = await page.locator('#casual-rail .home-recommend-book .bt').allTextContents();
  assert.ok(titles.includes('Pride and Prejudice'), titles.join(' | '));
  assert.ok(titles.includes('The Adventure of the Speckled Band'));
  assert.ok(titles.includes("Alice's Adventures in Wonderland"));
  assert.equal(await page.locator(card).evaluate(node => node.classList.contains('is-offline')), false);

  for (const [width, height, name] of [[390, 844, 'phone'], [820, 1024, 'tablet'], [1440, 900, 'desktop'], [844, 390, 'short']]) {
    await page.setViewportSize({width, height});
    for (const dark of [false, true]) {
      await page.evaluate(on => { darkMode = on; applyDark(); }, dark);
      await page.locator(card).scrollIntoViewIfNeeded();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, `${name} ${dark ? 'dark' : 'light'} overflow`);
      if (name === 'phone' || name === 'desktop')
        await page.screenshot({animations: 'disabled', path: `${proof}/rail-${name}-${dark ? 'dark' : 'light'}.png`});
    }
  }
  await page.setViewportSize({width: 390, height: 844});
  await page.evaluate(() => { darkMode = false; applyDark(); });

  await page.locator('#longform .section-link').click();
  await page.locator(libraryCard).waitFor();
  assert.equal(bookFetches, 0, 'Opening the library downloaded the novel');
  await page.locator('#nav-home').click();
  await page.locator(card).waitFor();

  await page.locator('#casual-rail .longread[data-longread-id="sherlock-holmes-speckled-band"]').click();
  assert.equal(await page.locator('#article-preview .ap-start').textContent(), '읽기');
  await page.keyboard.press('Escape');

  await context.setOffline(true);
  await page.waitForFunction(selector => document.querySelector(selector).classList.contains('is-offline'), card);
  await page.locator(card).scrollIntoViewIfNeeded();
  await page.screenshot({animations: 'disabled', path: `${proof}/rail-phone-offline.png`});
  await page.locator(card).click();
  assert.equal(await page.locator('#article-preview .ap-start').textContent(), '읽기 시작');
  assert.match(await page.locator('#article-preview .ap-status').textContent(), /오프라인/);
  assert.equal(await page.evaluate(() => books.length), 0);
  await page.locator('#article-preview .ap-start').click();
  await page.waitForFunction(() => document.querySelector('#article-preview .ap-start').textContent === '다시 시도');
  assert.match(await page.locator('#article-preview .ap-status').textContent(), /오프라인/);
  assert.equal(bookFetches, 0, 'An offline tap downloaded the novel');
  assert.equal(await page.evaluate(() => books.length), 0);

  await context.setOffline(false);
  await page.waitForFunction(selector => !document.querySelector(selector).classList.contains('is-offline'), card);
  bookStatus = 503;
  await page.locator('#article-preview .ap-start').click();
  await page.waitForFunction(() => /받지 못했어요/.test(document.querySelector('#article-preview .ap-status').textContent || ''));
  assert.equal(await page.locator('#article-preview .ap-start').textContent(), '다시 시도');
  assert.equal(await page.evaluate(() => books.length), 0);
  assert.equal(bookFetches, 1);

  bookStatus = 200;
  let releaseBook;
  bookGate = new Promise(resolve => { releaseBook = resolve; });
  await page.locator('#article-preview .ap-start').click();
  await page.waitForFunction(() => (document.querySelector('#article-preview .ap-start').textContent || '').startsWith('받는 중'));
  releaseBook();
  bookGate = null;
  await page.waitForFunction(() => document.querySelector('#rtext')?.textContent?.includes('It is a truth universally acknowledged'));
  const saved = await page.evaluate(bookId => {
    const book = books.find(item => item.longReadId === bookId);
    return {count: books.length, chapters: book.paras.filter(paragraph => /^Chapter \d+$/.test(paragraph)).length,
      first: book.paras[1], last: book.paras.at(-1), kind: book.kind};
  }, id);
  assert.equal(saved.count, 1);
  assert.equal(saved.kind, 'txt');
  assert.equal(saved.chapters, 61);
  assert.equal(saved.first.startsWith('It is a truth universally acknowledged'), true);
  assert.equal(saved.last.endsWith('uniting them.'), true);
  assert.equal(bookFetches, 2);
  assert.equal(await page.locator('#rtext .original-chapter').first().textContent(), 'Chapter 1');
  assert.equal(await page.locator('#rtext .original-byline').textContent(), 'Jane Austen');
  assert.equal(await page.evaluate(bookId => {
    const book = books.find(item => item.longReadId === bookId);
    return book.readingStyle === 'original' && book.paras.some(paragraph => paragraph.includes('—')) && !book.paras.some(paragraph => paragraph.includes('--'));
  }, id), true);
  await page.screenshot({animations: 'disabled', path: `${proof}/reader-phone-light.png`});
  await page.evaluate(() => { darkMode = true; applyDark(); });
  await page.screenshot({animations: 'disabled', path: `${proof}/reader-phone-dark.png`});
  await page.evaluate(() => { darkMode = false; applyDark(); });

  await page.locator('#readback').click();
  await page.waitForFunction(() => activeAppView() === 'home');
  await context.setOffline(true);
  await page.waitForFunction(selector => !document.querySelector(selector).classList.contains('is-offline'), card);
  const before = bookFetches;
  await page.locator(card).click();
  await page.waitForFunction(() => {
    const reader = document.querySelector('#rtext')?.textContent || '';
    if (reader.includes('It is a truth universally acknowledged')) return true;
    const start = document.querySelector('#article-preview .ap-start');
    if (start && !start.disabled) start.click();
    return false;
  });
  assert.equal(bookFetches, before, 'A saved book was downloaded again');

  await context.setOffline(false);
  catalogFails = true;
  await page.reload();
  await page.evaluate(() => homeReady);
  await page.locator('#home-recommend-kind [data-kind="books"]').click();
  await page.locator(card).waitFor();
  assert.equal(await page.locator(card).evaluate(node => node.classList.contains('is-offline')), false);
  await page.locator(card).click();
  await page.waitForFunction(() => {
    const reader = document.querySelector('#rtext')?.textContent || '';
    if (reader.includes('Chapter 1')) return true;
    const start = document.querySelector('#article-preview .ap-start');
    if (start && !start.disabled) start.click();
    return false;
  });
  assert.equal(bookFetches, before, 'A cached book was fetched again after the catalog failed');
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
  server.close();
}
console.log(`Remote classics browser check passed. Screenshots in ${proof}`);
