/* 웹소설 한 줄의 하드 규칙을 지키는지 확인합니다. 내장 모듈(node:vm, node:assert,
   node:fs)만 씁니다 — linkedom/playwright 없이 샌드박스에서 바로 돕니다.

   scripts/library/longreads.js 를 그대로 한 번 실행해서 WEB_NOVELS 를 꺼내 옵니다.
   본문 긁어오기/번들링은 없고, 모든 회차는 available:false 의 '곧 공개' 자리입니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
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

test('web novels: author-permitted, free-forever works, no monetization', () => {
  assert.ok(Array.isArray(WEB_NOVELS), 'WEB_NOVELS must be an array');
  assert.deepEqual(Array.from(WEB_NOVELS, work => work.id), ['cinnamon-bun', 'chasing-sunlight', 'mr-penn']);
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
    // Real English title plus a Korean reading; no placeholder titles.
    assert.ok(work.title && work.koTitle && work.koSubtitle, `${work.id} needs title, koTitle and koSubtitle`);
    assert.doesNotMatch(JSON.stringify(work), /연재작/, `${work.id} carries a placeholder title`);
  }
});

/* Royal Road ids checked on 2026-10-30 through royalroad.com/fiction/syndication/<id>,
   whose channel title is the story title. The earlier ids pointed at other stories. */
test('Royal Road links use the verified fiction ids', () => {
  assert.equal(byId('cinnamon-bun').royalRoadUrl, 'https://www.royalroad.com/fiction/31429/cinnamon-bun');
  assert.equal(byId('chasing-sunlight').royalRoadUrl, 'https://www.royalroad.com/fiction/73475/chasing-sunlight');
  assert.equal(byId('chasing-sunlight').kindleUrl, 'https://www.amazon.com/dp/B0CPYXGYNW');
  assert.equal(byId('mr-penn').royalRoadUrl, 'https://www.royalroad.com/fiction/54508/the-unexpected-engagement-of-the-marvelous-mr');
});

/* The permitted R. K. Goff work is The Unexpected Engagement of the Marvelous
   Mr. Penn (Royal Road 54508). Ar'Kendrithyst (Royal Road 26727) is by Arcs. */
test('R. K. Goff: Mr. Penn, first 10 chapters only, exact credit, Royal Road link only', () => {
  assert.doesNotMatch(JSON.stringify(WEB_NOVELS), /Kendrithyst/i);
  const penn = byId('mr-penn');
  assert.ok(penn, 'Mr. Penn must exist');
  assert.equal(penn.title, 'The Unexpected Engagement of the Marvelous Mr. Penn');
  assert.equal(penn.chapters.length, 10);
  const urls = Object.values(penn).filter(v => typeof v === 'string' && /^https?:/.test(v));
  assert.deepEqual(urls, [penn.royalRoadUrl], 'Mr. Penn may expose only its Royal Road link');
  assert.deepEqual(Array.from(WEB_NOVELS.filter(work => /goff/i.test(work.author + work.credit)), work => work.id), ['mr-penn']);
  for(const work of WEB_NOVELS.filter(work => /goff/i.test(work.author + work.credit))){
    assert.equal(work.credit, 'R. K. Goff');
    assert.equal(work.author, 'R. K. Goff');
    assert.ok(work.chapters.length <= 10, 'R. K. Goff: first 10 chapters only');
    assert.ok(!work.kindleUrl);
  }
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

/* Lossy WebP ('VP8 ') stores width/height as 14-bit values after the frame start code. */
function webpSize(bytes){
  const chunk = bytes.toString('ascii', 12, 16);
  if(chunk === 'VP8 ') return [bytes.readUInt16LE(26) & 0x3fff, bytes.readUInt16LE(28) & 0x3fff];
  if(chunk === 'VP8X') return [bytes.readUIntLE(24, 3) + 1, bytes.readUIntLE(27, 3) + 1];
  if(chunk === 'VP8L'){const bits = bytes.readUInt32LE(21); return [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];}
  return [0, 0];
}

/* The covers are supplied original poster art made for Breeze (issue #313),
   not generated and not the authors' covers. See assets/webnovels/covers/README.md. */
const COVER_SHA256 = {
  'cinnamon-bun': '593bf962401d696b17da22b0b7a0802b708e4515c3088c176ef2fb1aeb24cd2e',
  'chasing-sunlight': 'fac5dd6eb00cd80fd17239c99c015a062470b3a4c28c82f02124da9000e33c83',
  'mr-penn': 'dde62d063ae60076b8bf884c517f1d3f69d70b42ec8e964b1b1f0cb19e6093ff',
};

test('each work uses its supplied 768 × 1152 WebP poster cover, byte for byte', () => {
  assert.deepEqual(Object.keys(COVER_SHA256), Array.from(WEB_NOVELS, work => work.id));
  for(const work of WEB_NOVELS){
    assert.equal(work.cover, `assets/webnovels/covers/${work.id}.webp`, `${work.id} cover path`);
    assert.ok(existsSync(root + work.cover), `${work.cover} is missing`);
    const bytes = readFileSync(root + work.cover);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.deepEqual(webpSize(bytes), [768, 1152], `${work.id} cover size`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), COVER_SHA256[work.id], `${work.id} cover sha256`);
  }
  // No generator may overwrite the supplied art.
  assert.ok(!existsSync(root + 'tools/make-webnovel-covers.mjs'), 'the old typographic cover generator is retired');
  const readme = read('assets/webnovels/covers/README.md');
  assert.match(readme, /original art made for Breeze/i);
  for(const sha of Object.values(COVER_SHA256)) assert.ok(readme.includes(sha), `README lists ${sha}`);
});
