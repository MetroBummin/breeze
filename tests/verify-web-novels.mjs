/* 웹소설 한 줄의 하드 규칙을 지키는지 확인합니다. 내장 모듈(node:vm, node:assert,
   node:fs)만 씁니다 — linkedom/playwright 없이 샌드박스에서 바로 돕니다.

   scripts/library/longreads.js 를 그대로 한 번 실행해서 WEB_NOVELS 를 꺼내 옵니다.
   1화부터 10화까지만 본문이 묶여 있고, 그 뒤 회차는 없습니다. */
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
    assert.equal(work.chapters.length, 10, `${work.id} bundles the first 10 chapters only`);
    for(const chapter of work.chapters){
      assert.equal(chapter.available, true, `${work.id} chapter ${chapter.n} is readable`);
      assert.equal(chapter.file, `assets/webnovels/text/${work.id}/${String(chapter.n).padStart(2,'0')}.txt`);
      assert.ok(!chapter.content, `${work.id} chapter ${chapter.n} keeps its text in the file, not the catalog`);
      const text = readFileSync(root + chapter.file, 'utf8');
      assert.ok(text.length > 2000, `${work.id} chapter ${chapter.n} has story text`);
      assert.match(text, /^Chapter /, `${work.id} chapter ${chapter.n} keeps its chapter title`);
      assert.doesNotMatch(text, /taken without authorization|not rightfully on Amazon|Stolen from its original source|report any sightings|A note from /i,
        `${work.id} chapter ${chapter.n} still has site chrome or a hidden line`);
    }
    assert.equal(existsSync(root + `assets/webnovels/text/${work.id}/11.txt`), false, `${work.id} has no 11th chapter`);
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

/* Covers are supplied ORIGINAL art made for Breeze (movie-poster style),
   not the authors' own cover art and not generated by the retired tool. Each
   ships as a 768 × 1152 WebP whose bytes must match an exact sha256. */
const COVER_SHA = {
  'cinnamon-bun': 'b6a5adcbe1134c60c0c96be2160a75ee5dff0ce9d555ae3268e3799094ab0e7c',
  'chasing-sunlight': '39286a47142b3debd91aef6258b651434836ac12c74794b2ba1649bc4c242fbe',
  'mr-penn': 'd3307389ea10d06a039149b6b3e51915f0ee195141e31c562ac417a8841d9828',
};

function webpDimensions(bytes){
  const fourcc = bytes.toString('ascii', 12, 16);
  if(fourcc === 'VP8X'){
    return {
      w: 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)),
      h: 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)),
    };
  }
  if(fourcc === 'VP8L'){
    const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
    return {w: 1 + (bits & 0x3fff), h: 1 + ((bits >> 14) & 0x3fff)};
  }
  if(fourcc === 'VP8 '){
    return {w: (bytes[26] | (bytes[27] << 8)) & 0x3fff, h: (bytes[28] | (bytes[29] << 8)) & 0x3fff};
  }
  return {w: 0, h: 0};
}

test('each work ships its supplied original cover in the 768 × 1152 WebP frame with the exact sha256', () => {
  for(const work of WEB_NOVELS){
    assert.equal(work.cover, `assets/webnovels/covers/${work.id}.webp`, `${work.id} cover path`);
    assert.ok(existsSync(root + work.cover), `${work.cover} is missing`);
    const bytes = readFileSync(root + work.cover);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', `${work.id} cover must start with RIFF`);
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', `${work.id} cover must be a WEBP`);
    const {w, h} = webpDimensions(bytes);
    assert.equal(w, 768, `${work.id} cover width must be 768`);
    assert.equal(h, 1152, `${work.id} cover height must be 1152`);
    const sha = createHash('sha256').update(bytes).digest('hex');
    assert.equal(sha, COVER_SHA[work.id], `${work.id} cover must match its supplied-art sha256`);
  }
});
