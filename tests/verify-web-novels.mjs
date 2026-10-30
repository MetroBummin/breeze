/* 웹소설 한 줄의 하드 규칙과 번들 본문을 확인합니다. 내장 모듈(node:vm, node:assert,
   node:fs, node:crypto)만 씁니다 — linkedom/playwright 없이 샌드박스에서 바로 돕니다.

   scripts/library/longreads.js 를 그대로 한 번 실행해서 WEB_NOVELS 를 꺼내 옵니다.
   본문은 tools/build-webnovels.mjs 가 만든 assets/longreads/<id>.txt 와
   scripts/library/webnovel-layout.js 입니다. Reader 에서 여는 흐름은
   tests/verify-webnovels-browser.mjs 가 봅니다. */
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
    for(const chapter of work.chapters){
      assert.match(chapter.url, /^https:\/\/www\.royalroad\.com\/fiction\/\d+\/[^/]+\/chapter\/\d+\//, `${work.id} chapter ${chapter.n} links its Royal Road page`);
      assert.ok(chapter.url.startsWith(work.royalRoadUrl + '/chapter/'), `${work.id} chapter ${chapter.n} belongs to this fiction`);
      assert.doesNotMatch(chapter.title, /곧 공개|^\d+화$/, `${work.id} chapter ${chapter.n} shows its real title`);
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
  assert.deepEqual(Array.from(penn.chapters, chapter => chapter.n), [1,2,3,4,5,6,7,8,9,10]);
  penn.chapters.forEach((chapter, index) => assert.match(chapter.title, new RegExp(`^Chapter ${index + 1} - `), 'Mr. Penn is Chapter 1–10'));
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

test('each work has a Breeze-made typographic cover in the classic 768 × 1152 WebP frame', () => {
  for(const work of WEB_NOVELS){
    assert.equal(work.cover, `assets/webnovels/covers/${work.id}.webp`, `${work.id} cover path`);
    assert.ok(existsSync(root + work.cover), `${work.cover} is missing`);
    const bytes = readFileSync(root + work.cover);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  }
  // The covers come from the generator (title + author), never the authors' art.
  const tool = read('tools/make-webnovel-covers.mjs');
  for(const work of WEB_NOVELS){
    assert.ok(tool.includes(`id: '${work.id}'`), `${work.id} is not generated by the cover tool`);
    assert.ok(tool.includes(`author: '${work.credit}'`), `${work.id} cover must carry the exact credit`);
  }
  assert.doesNotMatch(tool, /text-transform:uppercase;\}\s*\n?\s*<\/style>|\.author\{[^}]*uppercase/, 'The author credit keeps its exact case');
});

/* ---- Bundled chapter text ---- */
const paragraphsOf = text => text.trim().split(/\n\s*\n/);
const layoutContext = {};
new Script(read('scripts/library/webnovel-layout.js')).runInNewContext(layoutContext);
const LAYOUT = new Script('WEB_NOVEL_LAYOUT').runInNewContext(layoutContext);
// Royal Road hides one "this copy was taken without permission" line per page;
// these are the shapes seen across all thirty pages.
const ANTI_COPY = [
  /royal\s*road|royalroad/i,
  /\bauthor\b.*\b(permission|approv|consent|authori[sz]|permit|copied|reproduction|stolen)/i,
  /\b(copied|stolen|unauthori[sz]ed|reproduction|this copy)\b.*\bauthor/i,
  /patreon|subscribestar|\bdiscord\b|ko-?fi|my patrons/i,
  /a note from (RavensDagger|InadvisablyCompelled|rkgoff)/i,
];

test('chapter count per novel: exactly 10 each, Mr. Penn never more', () => {
  for(const work of WEB_NOVELS){
    assert.equal(work.chapters.length, 10, `${work.id} has 10 chapters`);
    const text = read(work.file);
    const headings = Object.entries(LAYOUT[work.id]).filter(([, entry]) => entry.role === 'chapter');
    assert.equal(headings.length, 10, `${work.id} text book has 10 chapter headings`);
    assert.deepEqual(headings.map(([, entry]) => entry.text), Array.from(work.chapters, chapter => chapter.title),
      `${work.id} headings are the chapter list titles`);
    const paragraphs = paragraphsOf(text);
    for(const [index, entry] of headings) assert.equal(paragraphs[index], entry.text);
  }
  const penn = read(byId('mr-penn').file);
  assert.doesNotMatch(penn, /^Chapter 11\b/m, 'No Mr. Penn chapter past 10');
  assert.doesNotMatch(penn, /Introduction - Letters to the Editor|delighted by how gracious you are when handling my publicity/,
    'The Introduction is not bundled');
  assert.doesNotMatch(read(byId('cinnamon-bun').file), /^Chapter Ten\b|^Maps and Art$/m);
  assert.doesNotMatch(read(byId('chasing-sunlight').file), /^Chapter Eleven$/m);
});

test('chapter text is present, checksummed and stored like the classics', () => {
  for(const work of WEB_NOVELS){
    assert.equal(work.file, `assets/longreads/${work.id}.txt`);
    const text = read(work.file);
    assert.equal(work.sha256, createHash('sha256').update(text).digest('hex'), `${work.id} sha256`);
    assert.equal(work.wordCount, text.trim().split(/\s+/).length, `${work.id} wordCount`);
    const paragraphs = paragraphsOf(text);
    const headings = work.chapters.map(chapter => paragraphs.indexOf(chapter.title));
    headings.forEach((start, index) => {
      const end = index + 1 < headings.length ? headings[index + 1] : paragraphs.length;
      const body = paragraphs.slice(start + 1, end).filter(paragraph => paragraph !== '* * *');
      const words = body.join(' ').split(/\s+/).length;
      assert.ok(body.length >= 30 && words >= 1200, `${work.id} chapter ${index + 1} has its text (${body.length} paragraphs, ${words} words)`);
      assert.ok(body.every(paragraph => paragraph.trim()), `${work.id} chapter ${index + 1} has no empty paragraph`);
    });
    // Scene breaks and emphasis are layout metadata; the text keeps the author's words.
    for(const [index, entry] of Object.entries(LAYOUT[work.id])){
      if(entry.role) assert.equal(paragraphs[index], entry.text);
      if(entry.ranges) assert.equal(paragraphs[index].length, entry.length);
    }
    assert.ok(Object.values(LAYOUT[work.id]).some(entry => entry.ranges?.some(range => range[2] === 'em')), `${work.id} keeps italics`);
  }
  assert.ok(Object.values(LAYOUT['mr-penn']).filter(entry => entry.role === 'scene').length >= 10, 'Mr. Penn keeps its scene breaks');
  assert.match(read(byId('mr-penn').file), /^The duke tobbled as he walked\./m);
  assert.match(read(byId('cinnamon-bun').file), /^I was always the sort of girl that looked for the call to adventure/m);
});

test('no anti-copy lines, author notes or promotion survive in the text', () => {
  for(const work of WEB_NOVELS){
    const paragraphs = paragraphsOf(read(work.file));
    for(const paragraph of paragraphs){
      if(work.chapters.some(chapter => chapter.title === paragraph)) continue;
      for(const pattern of ANTI_COPY) assert.doesNotMatch(paragraph, pattern, `${work.id}: ${paragraph.slice(0, 120)}`);
    }
  }
  assert.doesNotMatch(read('assets/longreads/chasing-sunlight.txt'), /vampire|뱀파이어|흡혈/i);
  // The build script refuses to write a book with any of these lines.
  const tool = read('tools/build-webnovels.mjs');
  assert.match(tool, /display\\s\*:\\s\*none/, 'The build strips Royal Road\'s hidden lines');
  assert.match(tool, /antiCopyLine\(block\.text\)/, 'The build fails on any surviving anti-copy line');
});

test('a web novel imports through the classic long-read path and opens with its continue note', async () => {
  const context = {
    console, Set, Map, crypto, TextEncoder, File, books:[], positions:{}, LS_POS:'pos', saved:{},
    save(key, value){ context.saved[key] = value; return true; },
    topInset:() => 0,
    async fetch(url){
      const path = String(url).split('?')[0];
      return {ok:true, text:async () => read(path), blob:async () => ({size:10, type:'image/webp'})};
    },
    async importFile(file, meta, options){
      const text = await file.text();
      const paras = text.replace(/\r/g, '').split(/\n\s*\n+/).map(block => block.trim()).filter(Boolean);
      assert.equal(options.preserveParagraphs, true);
      const book = {id:'saved-' + meta.longReadId, kind:'txt', paras, ...meta};
      context.books.push(book);
      return {bookId:book.id};
    },
    async bookPut(){}, async imgPut(){}, renderAllBookViews(){}, toast(message){ throw new Error(message); },
  };
  context.posOf = id => context.positions[id] || {y:0, p:0, t:0, mode:'text', original:null};
  new Script(read('scripts/library/longreads.js')).runInNewContext(context);
  new Script(read('scripts/library/public-domain-layout.js')).runInNewContext(context);
  new Script(read('scripts/library/webnovel-layout.js')).runInNewContext(context);
  context.applyLongReadCover = async () => {};
  for(const id of ['cinnamon-bun', 'chasing-sunlight', 'mr-penn']){
    const work = new Script(`webNovelDefinition(${JSON.stringify(id)})`).runInNewContext(context);
    const definition = new Script(`longReadDefinition(${JSON.stringify(id)})`).runInNewContext(context);
    assert.equal(definition.presentation, 'story', `${id} reads like a Breeze Original`);
    assert.equal(definition.author, work.credit);
    assert.equal(definition.sourceUrl, work.royalRoadUrl);
    assert.ok(definition.sources.every(source => source.url.startsWith(work.royalRoadUrl)));
    const book = await context.importLongRead(definition);
    assert.ok(book, `${id} saved into 내 책`);
    assert.equal(book.longReadId, id);
    assert.equal(book.title, work.title);
    assert.equal(book.author, work.credit);
    assert.equal(book.attribution.sourceName, 'Royal Road');
    assert.equal(book.paras[0], work.chapters[0].title);
    // Importing again reuses the same 내 책 record.
    assert.equal(await context.importLongRead(definition), book);
    // Opening a chapter moves the one reading place to its heading.
    const third = work.chapters[2];
    assert.equal(context.webNovelPlaceAt(book, third), true);
    const place = context.positions[book.id];
    assert.equal(book.paras[place.pi], third.title);
    assert.equal(place.mode, 'text');
    assert.ok(place.t > 0 && place.p > 0 && place.p < 1);
    assert.equal(context.webNovelReadingChapter(work), 3);
    // Chapter headings and italics paint through the Breeze Original layout.
    const role = context.publicDomainRole(book, {f:place.pi, t:book.paras[place.pi]});
    assert.equal(role.role, 'chapter');
  }
  assert.equal(context.books.length, 3);
});

test('the reader ends with a note linking the full story (and Kindle for Chasing Sunlight)', () => {
  const made = [];
  const element = tag => {
    const node = {tag, children:[], attributes:{}, className:'', textContent:'',
      setAttribute(name, value){ this.attributes[name] = value; },
      append(...nodes){ this.children.push(...nodes); }};
    made.push(node);
    return node;
  };
  const context = {console, Set, Map, books:[], document:{createElement:element}};
  new Script(read('scripts/library/longreads.js')).runInNewContext(context);
  const links = id => {
    const note = context.webNovelContinueNote(new Script(`webNovelDefinition(${JSON.stringify(id)})`).runInNewContext(context));
    assert.equal(note.className, 'webnovel-continue');
    const anchors = [];
    const walk = node => { if(node.tag === 'a') anchors.push(node); (node.children || []).forEach(walk); };
    walk(note);
    for(const anchor of anchors){ assert.equal(anchor.target, '_blank'); assert.equal(anchor.rel, 'noopener noreferrer'); }
    return anchors.map(anchor => anchor.href);
  };
  assert.deepEqual(links('mr-penn'), [byId('mr-penn').royalRoadUrl]);
  assert.deepEqual(links('cinnamon-bun'), [byId('cinnamon-bun').royalRoadUrl]);
  assert.deepEqual(links('chasing-sunlight'), [byId('chasing-sunlight').royalRoadUrl, byId('chasing-sunlight').kindleUrl]);
  const reader = read('scripts/reader/reader.js');
  assert.match(reader, /webNovelContinueNote\(webNovel\)/, 'renderBookBody appends the note after the last chapter');
});
