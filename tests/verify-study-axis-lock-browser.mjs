import assert from 'node:assert/strict';
import {chromium} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture, prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

const server = await serveStudyFixture();
const browser = await chromium.launch({executablePath: process.env.BREEZE_BROWSER_EXECUTABLE || '/usr/bin/google-chrome', headless: true});
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepareStudyPage(page, server.url);
  await page.evaluate(async () => {
    words = {observe: {word: 'observe', ko: '관찰하다', book: 'Saved', example: 'She stopped to observe the room.', status: 1}, evidence: {word: 'evidence', ko: '증거', book: 'Saved', example: 'There was no evidence.', status: 2}};
    saveWords();
    const made = BreezeStudySets.create(await loadStudySets(), {name: 'Quiet', bookTitles: ['Saved']}, words, 10);
    await commitStudySets(made.state);
    openStudySetsDirectory();
  });
  await page.waitForFunction(() => studySetsUI.screen === 'directory');
  await page.locator('.study-sets-home-card[data-set-id]').click();
  await page.waitForFunction(() => studySetsUI.screen === 'detail' && studySetsUI.pageOpen && !studySetsUI.editButton.hidden);

  const callout = await page.locator('#study-sets-title').evaluate(node => {
    const menu = new MouseEvent('contextmenu', {bubbles: true, cancelable: true});
    node.dispatchEvent(menu);
    const range = document.createRange();
    range.selectNodeContents(node);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    return {prevented: menu.defaultPrevented, selected: !selection.isCollapsed};
  });
  assert.equal(callout.prevented, true, 'set title still opens the system callout');
  assert.equal(callout.selected, true);
  await page.locator('#study-sets-back').click();
  await page.waitForFunction(() => studySetsUI.screen === 'directory');
  assert.equal(await page.evaluate(() => getSelection().isCollapsed), true, 'a leftover selection still blocks the back button');

  await page.locator('.study-sets-home-card[data-set-id]').click();
  await page.waitForFunction(() => studySetsUI.screen === 'detail' && studySetsUI.pageOpen && !studySetsUI.editButton.hidden);
  const morph = await page.evaluate(() => new Promise(resolve => {
    studySetsToggleEditMenu();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const node = document.getElementById('study-sets-edit-surface');
      const style = getComputedStyle(node);
      resolve({
        layout: node.offsetWidth,
        visual: node.getBoundingClientRect().width,
        transform: style.transform,
        morphing: node.classList.contains('is-morphing'),
        filter: style.backdropFilter || style.webkitBackdropFilter,
      });
    }));
  }));
  assert.ok(morph.layout > 200, 'the menu is laid out once at its final width '+JSON.stringify(morph));
  assert.ok(morph.visual > 44 && morph.visual < morph.layout, 'the visible shape scales instead of resizing the blurred layer');
  assert.match(morph.transform, /matrix/, 'the morph is a transform');
  assert.equal(morph.morphing, true, 'backdrop blur stays off while the iPhone would otherwise re-blur each frame');
  assert.equal(morph.filter, 'none');
  await page.waitForFunction(() => studySetsUI.editOpen && !studySetsUI.editAnimation);
  const settled = await page.locator('#study-sets-edit-surface').evaluate(node => {
    const style = getComputedStyle(node);
    return {width: node.offsetWidth, transform: style.transform, morphing: node.classList.contains('is-morphing'), filter: style.backdropFilter || style.webkitBackdropFilter, opacity: getComputedStyle(node.querySelector('.study-sets-edit-menu')).opacity};
  });
  assert.ok(settled.width > 200);
  assert.equal(settled.transform, 'none');
  assert.equal(settled.morphing, false);
  assert.match(settled.filter, /blur\(18px\)/);
  assert.equal(Number(settled.opacity) > 0.99, true);
  await page.locator('#study-sets-back').click();
  await page.waitForFunction(() => !studySetsUI.editOpen);

  await page.locator('#study-sets-start').click();
  await page.waitForSelector('#study-sets-flashcard');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('study-sets-content')).overflowY === 'hidden');
  assert.equal(await page.locator('#study-sets-flashcard').evaluate(node => getComputedStyle(node).touchAction), 'none');
  const cdp = await context.newCDPSession(page);
  const box = await page.locator('#study-sets-flashcard').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height * 0.55;
  await page.locator('#study-sets-flashcard').click();
  await page.waitForFunction(() => !document.getElementById('study-sets-answer').hidden);
  const before = await page.locator('#study-sets-content').evaluate(node => node.scrollTop);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
  for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x + i * 14, y: y + i * 3, id: 1}]});
  const during = await page.locator('#study-sets-content').evaluate(node => node.scrollTop);
  const moved = await page.locator('#study-sets-flashcard').evaluate(node => getComputedStyle(node).transform);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchCancel', touchPoints: []});
  assert.equal(during, before, 'a horizontal swipe still scrolls the page');
  assert.match(moved, /matrix/, 'the card follows the horizontal lock');

  await page.evaluate(async () => {
    const state = await loadStudySets();
    const set = state.sets[0];
    const current = set.cards.find(card => card.id === set.session.queue[0].id);
    current.ko = (current.ko + ' 길고 자세한 뜻을 차분하게 읽고 확인합니다. ').repeat(40);
    current.id = JSON.stringify([current.word, current.ko]);
    set.session = null;
    const fresh = BreezeStudySets.start(state, set.id, Date.now(), {restart: true});
    await commitStudySets(fresh.state);
    await studySetsReadAndRender();
  });
  await page.locator('#study-sets-flashcard').click();
  await page.waitForFunction(() => {
    const node = document.getElementById('study-sets-content');
    return node.scrollHeight > node.clientHeight + 1 && getComputedStyle(node).overflowY === 'auto';
  });
  const vertical = await page.locator('#study-sets-flashcard').boundingBox();
  const vx = vertical.x + vertical.width / 2, vy = Math.min(760, vertical.y + 180);
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: vx, y: vy, id: 1}]});
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: vx + 2, y: vy - i * 16, id: 1}]});
  await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
  assert.ok(await page.locator('#study-sets-content').evaluate(node => node.scrollTop > 20), 'a vertical swipe on a long card no longer scrolls');
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
console.log('iPhone axis lock, morph, and chrome back button passed');
