import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './helpers/bounded-playwright.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const proof = process.env.BREEZE_REMOTE_PROOF || '/tmp/breeze-remote-classics';
mkdirSync(proof, {recursive: true});
const catalog = readFileSync(resolve(root, 'server/classics/catalog.json'));
const novel = readFileSync(resolve(root, 'server/classics/pride-and-prejudice/book.txt'));
const cover = readFileSync(resolve(root, 'server/classics/pride-and-prejudice/cover.webp'));
const id = 'pride-and-prejudice';
const card = `#casual-rail .longread[data-longread-id="${id}"]`;
const libraryCard = `#longform-recommend-rail .longread[data-longread-id="${id}"]`;

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
  assert.equal(await page.evaluate(() => homeRecommendKind()), 'classics', 'a new reader opens on 고전');
  await page.waitForFunction(bookId => remoteClassicCatalogReads().some(read => read.id === bookId), id);
  await page.evaluate(() => save('breeze.home-recommend', 'webnovels'));
  await page.reload();
  await page.evaluate(() => homeReady);
  assert.equal(await page.evaluate(() => homeRecommendKind()), 'classics', 'A saved 웹소설 choice still opens 고전');
  await page.waitForFunction(bookId => remoteClassicCatalogReads().some(read => read.id === bookId), id);
  assert.equal(bookFetches, 0, 'The catalog fetch downloaded the novel');

  await page.locator('#home-recommend-kind [data-kind="classics"]').click();
  await page.locator(card).scrollIntoViewIfNeeded();
  await page.waitForFunction(selector => {
    const image = document.querySelector(`${selector} img.cover`);
    return image && !image.hidden && image.naturalWidth === 768;
  }, card);
  const titles = await page.locator('#casual-rail .home-recommend-book .bt').allTextContents();
  // Visible captions are the friendly Korean display titles; the underlying
  // data-longread-id stays the canonical English catalog id (asserted below).
  assert.ok(titles.includes('오만과 편견'), titles.join(' | ')); // remote row has no koTitle; the bundled title map supplies it
  assert.ok(titles.includes('셜록 홈즈: 얼룩 끈'), titles.join(' | '));
  assert.ok(titles.includes('이상한 나라의 앨리스'), titles.join(' | '));
  assert.ok(titles.includes('백룸: 집으로 가는 길'), titles.join(' | '));
  const homeward = '#casual-rail .longread[data-longread-id="backroom-homeward-bound"]';
  assert.equal(await page.locator(homeward).count(), 1, 'Homeward Bound is offered once from the remote catalog');
  const surfaced = await page.evaluate(() => {
    const read = remoteClassicCatalogReads().find(item => item.id === 'backroom-homeward-bound');
    const bundled = LONG_READS.find(item => item.id === 'backroom-homeward-bound');
    return {
      file: read && read.file,
      remote: !!(read && read.remote),
      dormantBundled: !!(bundled && bundled.dormant),
      offered: classicCatalogOffers().some(item => item.id === 'backroom-homeward-bound' && item.file === 'assets/longreads/homewardbound.txt'),
    };
  });
  assert.equal(surfaced.file, 'assets/longreads/homewardbound.txt');
  assert.equal(surfaced.remote, false);
  assert.equal(surfaced.dormantBundled, true);
  assert.equal(surfaced.offered, true);
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
  assert.equal(await page.locator('#longform-recommend-rail .longread[data-longread-id="backroom-homeward-bound"]').count(), 1);
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
  assert.equal(await page.locator(card).count(), 0, 'A started book stays off the 책 rail');
  const savedId = await page.evaluate(bookId => books.find(item => item.longReadId === bookId).id, id);
  const before = bookFetches;
  const openSaved = async () => {
    await page.locator(`#shelf [data-local-book="${savedId}"]`).click();
    await page.waitForFunction(() => {
      const reader = document.querySelector('#rtext')?.textContent || '';
      if (reader.includes('It is a truth universally acknowledged')) return true;
      const start = document.querySelector('#article-preview .ap-start');
      if (start && !start.disabled) start.click();
      return false;
    });
  };
  await openSaved();
  assert.equal(bookFetches, before, 'A saved book was downloaded again');

  await page.evaluate(() => show('home'));
  await context.setOffline(false);
  catalogFails = true;
  await page.reload();
  await page.evaluate(() => homeReady);
  assert.equal(await page.locator(card).count(), 0, 'A saved book returns to the rail when the catalog cannot refresh');
  await page.locator(homeward).waitFor();
  assert.equal(await page.locator(homeward).count(), 1, 'A cached dormant book stays on the 고전 rail when the catalog cannot refresh');
  await openSaved();
  assert.equal(bookFetches, before, 'A cached book was fetched again after the catalog failed');

  const holmesText = [
    'I had called upon my friend Sherlock Holmes upon the second morning after Christmas, with the intention of wishing him the compliments of the season.',
    '“You are engaged,” said I; “perhaps I interrupt you.”',
    'II.',
    'Holmes waved me toward the chair beside the fire.',
    'Chapter 2. The Goose',
    'The salesman opened his ledger under the market lamp and named the goose that had carried the stone.',
  ].join('\n\n') + '\n';
  const holmesHash = createHash('sha256').update(holmesText).digest('hex');
  const holmesId = 'sherlock-holmes-blue-carbuncle';
  const sceneFile = 'blue-carbuncle-01.webp';
  const sceneBytes = readFileSync(resolve(root, 'assets/longreads/illustrations/speckled-band-01.webp'));
  const holmesCover = readFileSync(resolve(root, 'assets/longreads/covers/speckled-band.webp'));
  const holmesCatalog = JSON.stringify({version: 1, books: [{
    id: holmesId,
    title: 'The Adventure of the Blue Carbuncle',
    author: 'Arthur Conan Doyle',
    cover: `https://cdn.example/classics/${holmesId}/cover.webp`,
    coverPosition: 'center top',
    bytes: Buffer.byteLength(holmesText),
    content: `https://cdn.example/classics/${holmesId}/book.txt`,
    contentVersion: holmesHash,
    wordCount: 70,
    sourceUrl: 'https://www.gutenberg.org/ebooks/1661',
    site: 'Project Gutenberg',
    license: 'Original: public domain in the USA',
    licenseUrl: 'https://www.gutenberg.org/ebooks/1661',
    originalTitle: 'The Adventure of the Blue Carbuncle (1892)',
    series: 'SHERLOCK HOLMES · LIGHTLY MODERNIZED',
    presentation: 'story',
    hook: '크리스마스 아침, 길에서 주운 낡은 모자 하나와 거위 한 마리.',
    edition: 'Lightly modernized English edition',
    sections: [
      {paragraph: 2, text: 'II.', role: 'section'},
      {paragraph: 4, text: 'Chapter 2. The Goose', role: 'chapter'},
    ],
    illustrations: [{
      id: 'blue-carbuncle-01',
      before: '“You are engaged,” said I; “perhaps I interrupt you.”',
      after: 'I had called upon my friend Sherlock Holmes upon the second morning after Christmas, with the',
      paragraph: 1,
      file: `https://cdn.example/classics/${holmesId}/illustrations/${sceneFile}`,
      alt: 'A battered felt hat hangs on a chair beside Holmes',
      width: 1400,
      height: 700,
    }],
  }]});
  let sceneFetches = 0, sceneOffline = false;
  const holmesContext = await browser.newContext({viewport: {width: 390, height: 844}, serviceWorkers: 'block'});
  await holmesContext.addInitScript(() => localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
  const holmesPage = await holmesContext.newPage();
  holmesPage.on('pageerror', error => pageErrors.push(error.message));
  await holmesPage.route('**/*', async route => {
    const url = route.request().url().split('#')[0].split('?')[0];
    if (url.startsWith(base) || route.request().url().startsWith('blob:')) return route.continue();
    if (url.endsWith('/classics/catalog.json'))
      return route.fulfill({status: 200, contentType: 'application/json; charset=utf-8', body: holmesCatalog});
    if (url.endsWith(`/classics/${holmesId}/book.txt`))
      return route.fulfill({status: 200, contentType: 'text/plain; charset=utf-8', body: holmesText});
    if (url.endsWith(`/classics/${holmesId}/cover.webp`))
      return route.fulfill({status: 200, contentType: 'image/webp', body: holmesCover});
    if (url.endsWith(`/illustrations/${sceneFile}`)) {
      sceneFetches++;
      if (sceneOffline) return route.fulfill({status: 503, body: 'offline'});
      return route.fulfill({status: 200, contentType: 'image/webp', body: sceneBytes});
    }
    return route.abort();
  });
  const holmesCard = `#casual-rail .longread[data-longread-id="${holmesId}"]`;
  await holmesPage.goto(base);
  await holmesPage.evaluate(() => homeReady);
  await holmesPage.locator(holmesCard).waitFor();
  await holmesPage.locator(holmesCard).click();
  assert.equal(await holmesPage.locator('#article-preview .ap-summary').textContent(), '크리스마스 아침, 길에서 주운 낡은 모자 하나와 거위 한 마리.');
  assert.equal(await holmesPage.locator('#article-preview .ap-start').textContent(), '읽기 시작');
  await holmesPage.locator('#article-preview .ap-start').click();
  await holmesPage.waitForFunction(() => (document.querySelector('#rtext')?.textContent || '').includes('perhaps I interrupt you'));
  const holmesReader = await holmesPage.evaluate(bookId => {
    const book = books.find(item => item.longReadId === bookId);
    const image = document.querySelector('#rtext figure.story-illustration img');
    return {
      story: document.querySelector('#rtext').classList.contains('holmes-story'),
      reading: document.querySelector('#readwrap').classList.contains('holmes-reading'),
      byline: document.querySelector('#rtext .holmes-byline')?.textContent || '',
      section: document.querySelector('#rtext .holmes-section')?.textContent || '',
      chapter: document.querySelector('#rtext .holmes-chapter')?.textContent || '',
      scene: document.querySelector('#rtext figure.story-illustration')?.dataset.scene || '',
      alt: image?.alt || '',
      stored: !!(book && book.illustrations && book.illustrations.length === 1 && book.longReadStyle === 'holmes' && book.sections.length === 2),
    };
  }, holmesId);
  assert.equal(holmesReader.story, true);
  assert.equal(holmesReader.reading, true);
  assert.equal(holmesReader.byline, 'Arthur Conan Doyle');
  assert.equal(holmesReader.section, 'II.');
  assert.equal(holmesReader.chapter, 'Chapter 2. The Goose');
  assert.equal(holmesReader.scene, sceneFile);
  assert.equal(holmesReader.alt, 'A battered felt hat hangs on a chair beside Holmes');
  assert.equal(holmesReader.stored, true);
  await holmesPage.locator('#rtext figure.story-illustration img').scrollIntoViewIfNeeded();
  await holmesPage.waitForFunction(() => {
    const image = document.querySelector('#rtext figure.story-illustration img');
    return image && image.naturalWidth >= 1400;
  });
  assert.equal(await holmesPage.locator('#rtext figure.story-illustration img').evaluate(image => image.naturalWidth >= 1400), true);
  assert.ok(sceneFetches >= 1, 'The scene file was fetched with the book');
  const sceneFetchesAfterImport = sceneFetches;
  await holmesPage.screenshot({animations: 'disabled', path: `${proof}/reader-holmes-illustration-light.png`});
  const savedHolmes = await holmesPage.evaluate(bookId => books.find(item => item.longReadId === bookId).id, holmesId);
  await holmesPage.locator('#readback').click();
  await holmesPage.waitForFunction(() => activeAppView() === 'home');
  sceneOffline = true;
  await holmesPage.reload();
  await holmesPage.evaluate(() => homeReady);
  await holmesPage.waitForFunction(id => {
    const image = document.querySelector('#rtext figure.story-illustration img');
    if (image) {
      image.scrollIntoView();
      return image.naturalWidth >= 1400 && String(image.src || '').startsWith('blob:');
    }
    const shelf = document.querySelector(`#shelf [data-local-book="${id}"]`);
    if (shelf) { shelf.click(); return false; }
    const start = document.querySelector('#article-preview .ap-start');
    if (start && !start.disabled) start.click();
    return false;
  }, savedHolmes);
  assert.equal(sceneFetches, sceneFetchesAfterImport, 'A saved illustration was downloaded again after the scene file went offline');
  assert.equal(await holmesPage.locator('#rtext .holmes-byline').textContent(), 'Arthur Conan Doyle');
  await holmesContext.close();
  assert.deepEqual(pageErrors, []);
} finally {
  await browser.close();
  server.close();
}
console.log(`Remote classics browser check passed. Screenshots in ${proof}`);
