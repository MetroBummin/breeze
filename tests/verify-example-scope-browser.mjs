/* Headless check that rule A is the sentence splitter the open page actually uses. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { chromium } from 'playwright';
import { ruleA } from '../benchmarks/example-scope/rules.mjs';

const root = process.env.BREEZE_QA_ROOT || resolve(new URL('..', import.meta.url).pathname);
const server = createServer((req, res) => {
  const path = resolve(root, `.${(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0])}`);
  try {
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json' })[extname(path)] || 'application/octet-stream');
    res.end(readFileSync(path));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(ready => server.listen(0, '127.0.0.1', ready));
const url = `http://127.0.0.1:${server.address().port}/`;
const samples = [
  'Dr. Watson arrived late.',
  'He waited... Then she spoke.',
  '1. apples are red\n2. bananas are yellow',
  'The value is 3.14 today.',
  '① The river flooded\n② The bridge held',
];
const browser = await chromium.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof bridgeSentences === 'function');
  const live = await page.evaluate(list => list.map(text => bridgeSentences(text).map(part => [part.start, part.end, part.text])), samples);
  samples.forEach((text, index) => {
    const expected = ruleA(text).map(part => [part.start, part.end, part.text]);
    assert.equal(JSON.stringify(live[index]), JSON.stringify(expected), `page splitter disagreed on: ${text}`);
  });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ ok: true, samples: samples.length, engine: 'google-chrome' }));
} finally {
  await browser.close();
  server.close();
}
