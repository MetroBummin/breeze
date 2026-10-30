// Captures the Home rows QA screenshots into docs/qa/home-rows-20261030/.
// The 기사 tab shows the live public RSS recommendations, so this needs network.
// Run: node tools/capture-home-rows.mjs
import {mkdirSync, readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const out = resolve(root, 'docs/qa/home-rows-20261030');
const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.webp':'image/webp','.png':'image/png','.woff2':'font/woff2','.txt':'text/plain'};
const server = createServer((req, res) => {
  try{
    const requested = new URL(req.url, 'http://localhost').pathname;
    const path = resolve(root, '.' + requested.replace(/^\/$/, '/index.html'));
    if(!path.startsWith(root)) throw Error();
    res.setHeader('Content-Type', types[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}/`;
mkdirSync(out, {recursive: true});

// Two started books and one saved article, so 이어 읽기 and 내 책 have content.
async function seed(page){
  await page.evaluate(async() => {
    const speckled = LONG_READS.find(read => read.id === 'sherlock-holmes-speckled-band');
    const started = await importLongRead(speckled);
    const article = {id:'qa-article', kind:'paste', title:'How Octopuses Taste With Their Arms', site:'Breeze',
      paras:['How Octopuses Taste With Their Arms', 'Octopuses sense chemicals through the suckers on their arms.'], addedAt:Date.now()};
    await bookPut(article); books.unshift(article);
    positions[started.id] = {p:.42, t:Date.now() - 2000};
    positions[article.id] = {p:.18, t:Date.now() - 1000};
    rememberLocalReading(started); rememberLocalReading(article);
    renderHome();
  });
  // Let the import notice in the home pill finish before any shot.
  await page.waitForTimeout(3500);
}

async function shoot(page, name, target){
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  if(target) await page.locator(target).screenshot({path: resolve(out, name)});
  else await page.screenshot({path: resolve(out, name)});
  console.log(name);
}

async function waitCovers(page){
  await page.waitForFunction(() => [...document.querySelectorAll('#casual-rail img.cover')].slice(0, 2).every(image => image.complete && image.naturalWidth > 0), null, {timeout: 20000}).catch(() => {});
}

async function setKind(page, kind){
  await page.locator(`#home-recommend-kind [data-kind="${kind}"]`).click();
  await waitCovers(page);
}

// Chromium by default: Linux WebKit draws the preview sheet without its
// backdrop blur, which misrepresents the glass. BROWSER=webkit still works.
const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
try{
  for(const [device, viewport, dark] of [['iphone', {width:390, height:844}, false], ['iphone', {width:390, height:844}, true], ['ipad', {width:820, height:1180}, false]]){
    const context = await browser.newContext({viewport, deviceScaleFactor: 2, colorScheme: dark ? 'dark' : 'light', serviceWorkers: 'block', locale: 'ko-KR'});
    await context.addInitScript(isDark => {
      localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done'));
      localStorage.setItem('breeze.dark', JSON.stringify(isDark));
    }, dark);
    const page = await context.newPage();
    await page.goto(base); await page.evaluate(() => homeReady);
    await seed(page);
    await setKind(page, 'classics');
    const theme = dark ? 'dark' : 'light';
    await shoot(page, `${device}-${theme}-home-top.png`);
    if(device === 'iphone' && !dark){
      await page.locator('#casuals').scrollIntoViewIfNeeded();
      await shoot(page, 'iphone-light-tab-classics.png', '#casuals');
      await setKind(page, 'webnovels');
      await shoot(page, 'iphone-light-tab-webnovels.png', '#casuals');
      await setKind(page, 'articles');
      await page.waitForFunction(() => document.querySelectorAll('#casual-rail .rss-card:not(.rss-cover-pending)').length >= 1, null, {timeout: 45000})
        .catch(() => console.warn('No live RSS card arrived; the 기사 shot shows the loading state.'));
      await shoot(page, 'iphone-light-tab-articles.png', '#casuals');
      await setKind(page, 'classics');
      await page.evaluate(() => scrollTo(0, document.scrollingElement.scrollHeight));
      await shoot(page, 'iphone-light-mybooks.png');
      await setKind(page, 'webnovels');
      await page.locator('#casual-rail .webnovel[data-webnovel-id="arkendrithyst"]').click();
      await page.waitForFunction(() => document.querySelector('#article-preview').open);
      await page.waitForTimeout(1200);
      await shoot(page, 'iphone-light-webnovel-preview.png');
      await page.locator('#article-preview .ap-chapters').evaluate(node => node.scrollIntoView({block: 'start'}));
      await shoot(page, 'iphone-light-webnovel-chapters.png');
    }
    await context.close();
  }
}finally{await browser.close(); server.close();}
