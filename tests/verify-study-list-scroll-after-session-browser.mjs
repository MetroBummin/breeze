import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {chromium} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture, prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';

// A card that fits locks the session body with overflow-y:hidden. The word
// list shares that element, so leaving the session must release the lock.
const chrome = [process.env.BREEZE_BROWSER_EXECUTABLE, '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(path => path && existsSync(path));
const server = await serveStudyFixture();
const browser = await chromium.launch({executablePath: chrome, headless: true});
try {
  const context = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true, serviceWorkers: 'block'});
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await prepareStudyPage(page, server.url);
  await page.evaluate(async () => {
    words = Object.fromEntries(Array.from({length: 40}, (_, i) => ['word' + i, {word: 'word' + i, ko: '뜻 ' + i, book: 'Saved', example: 'An example for word ' + i + '.', status: 1, addedAt: i + 1}]));
    saveWords();
    const made = BreezeStudySets.create(await loadStudySets(), {name: 'Long', bookTitles: ['Saved']}, words, 10);
    await commitStudySets(made.state);
    openStudySetsDirectory();
  });
  await page.waitForFunction(() => studySetsUI.screen === 'directory');
  await page.locator('.study-sets-home-card[data-set-id]').click();
  await page.waitForFunction(() => studySetsUI.screen === 'detail' && studySetsUI.pageOpen && document.querySelectorAll('.study-sets-word-row').length > 10);

  const cdp = await context.newCDPSession(page);
  const swipeUp = async () => {
    const box = await page.locator('#study-sets-content').boundingBox();
    const x = box.x + box.width / 2, y = box.y + box.height * 0.7;
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
    for (let i = 1; i <= 10; i++) await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x, y: y - i * 24, id: 1}]});
    await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    await page.waitForTimeout(300);
    return page.locator('#study-sets-content').evaluate(node => node.scrollTop);
  };
  const scrollable = () => page.locator('#study-sets-content').evaluate(node => ({overflowY: getComputedStyle(node).overflowY, inline: node.style.overflowY, overflows: node.scrollHeight > node.clientHeight + 1}));

  assert.ok(await swipeUp() > 20, 'the fixture list scrolls before any session');
  await page.locator('#study-sets-content').evaluate(node => { node.scrollTop = 0; });

  await page.locator('#study-sets-start').click();
  await page.waitForSelector('#study-sets-flashcard');
  await page.waitForFunction(() => getComputedStyle(document.getElementById('study-sets-content')).overflowY === 'hidden');

  await page.locator('#study-sets-back').click();
  await page.waitForFunction(() => studySetsUI.screen === 'detail' && document.querySelectorAll('.study-sets-word-row').length > 10);
  const detail = await scrollable();
  assert.equal(detail.overflows, true);
  assert.equal(detail.inline, '', 'the session scroll lock stays on the word list');
  assert.equal(detail.overflowY, 'auto');
  assert.ok(await swipeUp() > 20, 'the word list no longer scrolls after leaving a flashcard');

  // The same element also hosts 전체 단어 and the directory.
  await page.locator('#study-sets-back').click();
  await page.waitForFunction(() => studySetsUI.screen === 'directory');
  assert.equal((await scrollable()).inline, '');
  assert.deepEqual(errors, []);
  await context.close();
} finally {
  await browser.close();
  await server.close();
}
console.log('word list scrolls after leaving a flashcard session');
