import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from 'playwright';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = readFileSync(resolve(root,'ios/App/App.xcodeproj/project.pbxproj'),'utf8');
assert.match(project,/name = "Breeze Share Extension";/,'Share target must remain available for later');
assert.match(project,/Embed App Extensions[^\n]*files = \( \);/,'Share extension must not be embedded in the app');
const mime = {'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.woff2':'font/woff2'};
const server = createServer((request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html'));
  if (!path.startsWith(root)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(readFileSync(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

try {
  for (const engine of [chromium, webkit]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({viewport:{width:390,height:844}, serviceWorkers:'block'});
      await page.addInitScript(() => localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done')));
      await page.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
      await page.goto(url);
      await page.evaluate(() => homeReady);
      await page.evaluate(async() => {
        await renderRssCards(document.getElementById('casual-rail'),false);
        renderRssCards = async()=>{};
        books = [{id:'reading', title:'읽던 글', kind:'paste', site:'Breeze', paras:['읽던 글', '본문'], addedAt:1}];
        positions = {reading:{t:10,p:.2}};
        receiveSharedLinks([
          {id:'x-new', url:'https://x.com/example/status/123', savedAt:'2026-09-23T05:00:00Z'},
          {id:'x-old', url:'https://x.com/example/status/123', savedAt:'2026-09-23T04:00:00Z'},
          {id:'medium', url:'https://medium.com/example/story', title:'좋은 에세이', savedAt:'2026-09-22T05:00:00Z'},
          {id:'unsafe', url:'javascript:alert(1)', savedAt:'2026-09-23T05:00:00Z'}
        ]);
        const rail = document.getElementById('casual-rail');
        const rss = document.createElement('article'); rss.className = 'casual rss-card';
        rail.insertBefore(rss, rail.querySelector('.casual.add'));
      });
      assert.deepEqual(await page.locator('#casual-rail > .casual').evaluateAll(nodes => nodes.map(node =>
        node.classList.contains('shared-card') ? 'saved' : node.classList.contains('rss-card') ? 'rss' :
        node.classList.contains('add') ? 'add' : 'reading')),
        ['rss']);
      assert.equal(await page.locator('#casual-rail [data-home-key="book:reading"]').count(),0);
      assert.equal(await page.locator('#home-casual-rail [data-home-key="book:reading"]').count(),1);
      assert.equal(await page.locator('#home-casual-rail .casual.add').count(),1);
      assert.equal(await page.locator('#v-casuals .feed-categories,#v-casuals #casual-discover-rail').count(),0);
      assert.equal(await page.evaluate(()=>sharedLinks.length),2,'Pending App Group records were discarded');
      await page.evaluate(()=>{save('breeze.feed-category','saved');renderHome();});
      assert.equal(await page.locator('#v-casuals .rss-card').count(),0);
      assert.equal(await page.locator('.shared-card').count(),0);
      await page.evaluate(() => receiveSharedLinks([
        {id:'x-new', url:'https://x.com/example/status/123', savedAt:'2026-09-23T05:00:00Z', openedAt:'2026-09-23T06:00:00Z'},
        {id:'medium', url:'https://medium.com/example/story', title:'좋은 에세이', savedAt:'2026-09-22T05:00:00Z'}
      ]));
      await page.evaluate(() => show('casuals'));
      assert.equal(await page.locator('#casual-grid .shared-card').count(),0);
      assert.equal(await page.locator('#casual-cnt').textContent(), '1편');
      assert.equal(await page.evaluate(()=>sharedLinks.length),2);
      await page.close();
    } finally { await browser.close(); }
  }
  console.log('Dormant share: target and records retained, no extension embedding or visible Saved cards passed');
} finally { server.close(); }
