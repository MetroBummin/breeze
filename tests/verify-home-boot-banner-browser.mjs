/* Empty iOS inbox during startup must not throw, and a boot error must not
   cover the home dock. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium, webkit} from './helpers/bounded-playwright.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const css = readFileSync(new URL('../styles/components.css', import.meta.url), 'utf8');
assert.match(css, /#bootfail\{[^}]*pointer-events:\s*auto/);
assert.match(css, /#bootfail\{[^}]*env\(safe-area-inset-bottom\)/);
assert.match(css, /#bootfail\{[^}]*env\(safe-area-inset-left\)/);
assert.match(css, /#bootfail\{[^}]*env\(safe-area-inset-right\)/);

const server = createServer((req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/^\/$/, '/index.html'));
  if(!path.startsWith(root)){ res.writeHead(403).end(); return; }
  try {
    res.setHeader('Content-Type', ({'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.webp': 'image/webp'})[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;
const viewports = [
  {name: 'phone', width: 390, height: 844},
  {name: 'short', width: 390, height: 500},
  {name: 'tablet', width: 768, height: 1024},
  {name: 'desktop', width: 1280, height: 800},
];

async function showProbe(page){
  await page.evaluate(() => { setTimeout(() => { throw new Error('probe-banner'); }, 0); });
  await page.waitForFunction(() => document.getElementById('bootfail').style.display === 'flex');
}

async function geometry(page){
  return page.evaluate(() => {
    const banner = document.getElementById('bootfail');
    const controls = document.getElementById('home-controls');
    const add = document.getElementById('home-add');
    const rule = [...document.styleSheets].flatMap(sheet => {
      try { return [...sheet.cssRules]; } catch { return []; }
    }).find(item => item.selectorText === '#bootfail');
    const bannerBox = banner.getBoundingClientRect();
    const controlsBox = controls.getBoundingClientRect();
    const addBox = add.getBoundingClientRect();
    const hit = document.elementFromPoint(addBox.left + addBox.width / 2, addBox.top + addBox.height / 2);
    const overlaps = bannerBox.bottom > controlsBox.top && bannerBox.top < controlsBox.bottom
      && bannerBox.right > controlsBox.left && bannerBox.left < controlsBox.right;
    return {
      display: banner.style.display,
      overlaps,
      hit: hit ? (hit.closest('#home-add') ? 'home-add' : hit.closest('#bootfail') ? 'bootfail' : hit.id || hit.tagName) : 'none',
      pointerEvents: getComputedStyle(banner).pointerEvents,
      specifiedBottom: rule ? rule.style.bottom : '',
      usedBottom: getComputedStyle(banner).bottom,
    };
  });
}

try {
  const engines = [chromium, webkit].filter(engine => !process.env.BREEZE_QA_ENGINE || engine.name() === process.env.BREEZE_QA_ENGINE);
  for(const engine of engines){
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({viewport: viewports[0], serviceWorkers: 'block'});
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith(url) ? route.continue() : route.abort());
      await page.addInitScript(() => {
        localStorage.setItem('breeze.onboarding.v1', JSON.stringify('done'));
        window.breezeShareInboxPending = [];
      });
      await page.goto(url, {waitUntil: 'domcontentloaded'});
      await page.evaluate(() => homeReady);
      assert.deepEqual(errors, [], `${engine.name()} boot\n${errors.join('\n')}`);
      assert.equal(await page.locator('#bootfail').evaluate(node => node.style.display), 'none');
      assert.equal(await page.locator('#v-home').isVisible(), true);

      for(const theme of ['light', 'dark']){
        await page.evaluate(dark => document.body.classList.toggle('dark', dark), theme === 'dark');
        for(const viewport of viewports){
          await page.setViewportSize(viewport);
          await showProbe(page);
          const box = await geometry(page);
          assert.equal(box.display, 'flex', `${engine.name()} ${theme} ${viewport.name}`);
          assert.equal(box.overlaps, false, `${engine.name()} ${theme} ${viewport.name} covers the dock`);
          assert.equal(box.hit, 'home-add', `${engine.name()} ${theme} ${viewport.name} hit ${box.hit}`);
          assert.equal(box.pointerEvents, 'auto');
          assert.match(box.specifiedBottom, /env\(safe-area-inset-bottom\)/);
          assert.ok(parseFloat(box.usedBottom) >= 78, box.usedBottom);
          await page.locator('#home-add').click();
          assert.equal(await page.locator('#add-modal').evaluate(node => node.open), true, 'add control was not tappable');
          await page.evaluate(() => closeAddModal());
          await page.locator('#bootfail-dismiss').click();
          assert.equal(await page.locator('#bootfail').evaluate(node => node.style.display), 'none');
        }
      }

      await showProbe(page);
      await page.waitForFunction(() => document.getElementById('bootfail').style.display === 'none', null, {timeout: 7000});
      assert.ok(errors.some(message => message.includes('probe-banner')));
      assert.equal(errors.some(message => message.includes('updateCompletionBadge')), false);
    } finally {
      await browser.close();
    }
  }
} finally {
  server.close();
}
