/* 웹소설 한 줄의 하드 규칙을 지키는지 확인합니다. 내장 모듈(node:vm, node:assert,
   node:fs)만 씁니다 — linkedom/playwright 없이 샌드박스에서 바로 돕니다.

   scripts/library/longreads.js 를 그대로 한 번 실행해서 WEB_NOVELS 를 꺼내 옵니다.
   본문 긁어오기/번들링은 없고, 모든 회차는 available:false 의 '곧 공개' 자리입니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = name => readFileSync(root + name, 'utf8');

function loadWebNovels(){
  const context = {console, Set, books:[]};
  new Script(read('scripts/library/longreads.js')).runInNewContext(context);
  return new Script('WEB_NOVELS').runInNewContext(context);
}

const WEB_NOVELS = loadWebNovels();
const byId = id => WEB_NOVELS.find(work => work && work.id === id);

/* 메타데이터를 통째로 한 문자열로 모아, 금칙어를 샅샅이 훑습니다. */
function workText(work){
  return JSON.stringify(work);
}

test('web novels: three author-permitted, free-forever works, no monetization', () => {
  assert.ok(Array.isArray(WEB_NOVELS), 'WEB_NOVELS must be an array');
  assert.equal(WEB_NOVELS.length, 3, 'There must be exactly three web-novel works');
  for(const work of WEB_NOVELS){
    assert.equal(work.free, true, `${work.id} must be free:true`);
    assert.equal(work.monetization, 'none', `${work.id} must declare monetization 'none'`);
    assert.ok(work.royalRoadUrl && /royalroad\.com/.test(work.royalRoadUrl),
      `${work.id} must link to its Royal Road original`);
    assert.ok(Array.isArray(work.chapters) && work.chapters.length > 0,
      `${work.id} must carry a chapters[] shape`);
    // No scraping / no bundled chapter text: every chapter is a '곧 공개' placeholder.
    for(const chapter of work.chapters){
      assert.equal(chapter.available, false, `${work.id} chapter ${chapter.n} must be a placeholder (available:false)`);
      assert.ok(!chapter.content, `${work.id} chapter ${chapter.n} must not bundle body text`);
    }
  }
});

test('R. K. Goff work: first 10 chapters only, credit exactly "R. K. Goff"', () => {
  const work = byId('arkendrithyst');
  assert.ok(work, 'The R. K. Goff work must exist');
  assert.equal(work.credit, 'R. K. Goff', 'Credit string must be exactly "R. K. Goff"');
  assert.equal(work.author, 'R. K. Goff', 'Author must be "R. K. Goff"');
  assert.equal(work.chapters.length, 10, 'Only the first 10 chapters may be listed');
  assert.deepEqual(Array.from(work.chapters, c => c.n), Array.from({length:10}, (_, i) => i + 1),
    'Chapters must be numbered 1..10');
  // No Kindle/affiliate/monetization attached.
  assert.ok(!work.kindleUrl, 'The R. K. Goff work must not carry a Kindle link');
});

test('Cinnamon Bun by RavensDagger: zero monetization, Royal Road link only', () => {
  const work = byId('cinnamon-bun');
  assert.ok(work, 'Cinnamon Bun must exist');
  assert.equal(work.title, 'Cinnamon Bun');
  assert.equal(work.author, 'RavensDagger');
  assert.equal(work.monetization, 'none');
  assert.equal(work.free, true);
  // No kindle / affiliate / patreon / ads anywhere — only the Royal Road original.
  assert.ok(!('kindleUrl' in work), 'Cinnamon Bun must not have a kindleUrl field');
  // Strip the legitimate monetization:'none' declaration before scanning.
  const text = workText(work).replace(/"monetization":"none"/g, '');
  assert.doesNotMatch(text, /kindle|amazon|patreon|affiliate|\bads?\b|monetiz/i,
    'Cinnamon Bun metadata must not mention any monetization');
  // The single external link is Royal Road.
  const urls = Object.values(work).filter(v => typeof v === 'string' && /^https?:/.test(v));
  assert.deepEqual(urls, [work.royalRoadUrl],
    'Cinnamon Bun may expose only its Royal Road link');
});

test('Chasing Sunlight by InadvisablyCompelled: both Royal Road and Kindle links, never a vampire novel', () => {
  const work = byId('chasing-sunlight');
  assert.ok(work, 'Chasing Sunlight must exist');
  assert.equal(work.title, 'Chasing Sunlight');
  assert.equal(work.author, 'InadvisablyCompelled');
  assert.ok(work.royalRoadUrl && /royalroad\.com/.test(work.royalRoadUrl),
    'Chasing Sunlight must link to Royal Road');
  assert.ok(work.kindleUrl && /amazon\.com|kindle/i.test(work.kindleUrl),
    'Chasing Sunlight must link to its Kindle edition');
  // Never describe it as a vampire novel, in any field.
  const text = workText(work);
  assert.doesNotMatch(text, /vampire|뱀파이어|흡혈/i,
    'Chasing Sunlight must never be described as a vampire novel');
});

test('no vampire descriptor anywhere in WEB_NOVELS metadata', () => {
  const text = JSON.stringify(WEB_NOVELS);
  assert.doesNotMatch(text, /vampire|뱀파이어|흡혈/i,
    'No web-novel metadata may use a vampire descriptor');
});
