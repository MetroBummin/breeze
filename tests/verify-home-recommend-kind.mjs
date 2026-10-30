import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const index=readFileSync(resolve(root,'index.html'),'utf8');
const homeCss=readFileSync(resolve(root,'styles/home.css'),'utf8');
const shellCss=readFileSync(resolve(root,'styles/home-shell.css'),'utf8');
const library=readFileSync(resolve(root,'scripts/library/library.js'),'utf8');

function extractFunction(source,name){
  const start=source.indexOf(`function ${name}(`);
  assert.notEqual(start,-1,name);
  const from=source.slice(start-6,start)==='async '?start-6:start;
  let depth=0;
  for(let i=source.indexOf('{',start);i<source.length;i++){
    if(source[i]==='{')depth++;
    else if(source[i]==='}'){depth--;if(!depth)return source.slice(from,i+1);}
  }
  throw new Error('unclosed '+name);
}

const previewCss=readFileSync(resolve(root,'styles/article-preview.css'),'utf8');
const webnovels=readFileSync(resolve(root,'scripts/library/webnovels.js'),'utf8');
const longreads=readFileSync(resolve(root,'scripts/library/longreads.js'),'utf8');
const titles=readFileSync(resolve(root,'scripts/library/classic-titles.js'),'utf8');
const main=readFileSync(resolve(root,'scripts/main.js'),'utf8');

/* Home is three rows: 고전 / 웹소설 / 내 책. The shared dock stays as it was. */
test('Home has 고전, 웹소설, 내 책 in that order and no 기사/책 toggle',()=>{
  const home=index.slice(index.indexOf('id="v-home"'),index.indexOf('id="v-casuals"'));
  const order=['id="casuals"','id="home-webnovels"','id="longform"'].map(id=>home.indexOf(id));
  assert.ok(order.every(at=>at>0),'a Home row is missing');
  assert.deepEqual([...order].sort((a,b)=>a-b),order,'Home rows are out of order');
  assert.match(home,/id="home-recommend-title"[^>]*>고전<\/h2>/);
  assert.match(home,/id="home-webnovels-title"[^>]*>웹소설<\/h2>/);
  assert.match(home,/class="section-link"[^>]*aria-label="내 책 모아보기"[^>]*onclick="show\('longform'\)"><span data-i18n="sec.books">내 책<\/span>/);
  assert.doesNotMatch(index,/id="home-recommend-kind"|setHomeRecommendKind|data-kind="articles"/);
  assert.doesNotMatch(index,/id="home-casuals"|id="home-casual-rail"/);
  assert.doesNotMatch(shellCss,/#home-recommend-kind/);
  assert.doesNotMatch(library,/homeRecommendKind|setHomeRecommendKind|appendRssCards/);
  assert.doesNotMatch(main,/homeRecommendKind/);
  // Floating dock unchanged: resume pill and + stay outside the rows.
  const dock=index.slice(index.indexOf('id="home-controls"'),index.indexOf('id="v-home"'));
  assert.match(dock,/id="home-resume"[^>]*onclick="resumeHomeBook\(this\)"/);
  assert.match(dock,/id="home-add"[^>]*onclick="openAddModal\(\)"/);
});

test('book captions sit under the picture inside the article card box',()=>{
  const rail=String.raw`:is\(#v-home #casual-rail, #v-longform #longform-recommend-rail\)`;
  assert.match(homeCss,new RegExp(rail+String.raw` > :is\(\.casual,\.home-recommend-book\)\{[^}]*flex:0 0 min\(61vw,560px\)`));
  assert.match(homeCss,new RegExp(rail+String.raw` > \.home-recommend-book\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*aspect-ratio:3\/4`));
  assert.match(homeCss,new RegExp(rail+String.raw` > \.home-recommend-book \.cover\{[^}]*position:relative[^}]*grid-row:1`));
  assert.match(homeCss,new RegExp(rail+String.raw` > \.home-recommend-book \.author\{[^}]*position:relative[^}]*grid-row:3[^}]*color:var\(--settings-muted\)[^}]*text-shadow:none`));
  assert.match(homeCss,new RegExp(rail+String.raw` > \.home-recommend-book \.bt\{[^}]*grid-row:2[^}]*color:var\(--settings-ink\)[^}]*text-shadow:none`));
  assert.match(homeCss,new RegExp(rail+String.raw` > \.home-recommend-book \.get\{[^}]*text-shadow:none`));
  assert.match(homeCss,/\.bookcard\.has-cover \.author, \.bookcard\.has-cover \.bt\{[^}]*text-shadow:var\(--cover-text-shadow\)/);
  assert.match(homeCss,/\.home-cover-meta\{[^}]*text-shadow:0 1px 5px rgba\(0,0,0,\.7\)/);
  const block=homeCss.slice(homeCss.indexOf(':is(#v-home #casual-rail, #v-longform #longform-recommend-rail) > .home-recommend-book{'),homeCss.indexOf('#v-home #longform{'));
  assert.doesNotMatch(block,/#[0-9a-fA-F]{3,8}/,'Book rail styling introduces a new color');
});

function harness(){
  const {document}=parseHTML(`<div id="casual-rail"></div><p id="home-feed-empty"></p><div id="webnovel-rail"></div><div id="shelf"></div>
    <dialog id="article-preview"><div class="ap-hero"><img hidden><div class="ap-art"></div></div><p class="ap-source"></p><h2 class="ap-title"></h2><p class="ap-details" hidden></p><div class="ap-scroll"></div><button class="ap-start"></button></dialog>
    <span id="longform-cnt"></span><div id="longform-grid"></div><div id="longform-empty" hidden></div>
    <section id="longform-recommend" hidden><h2 id="longform-recommend-title">추천</h2><div id="longform-recommend-rail"></div></section>`);
  const store=new Map(),opened=[],rss=[],readAt={},status=[];
  const books=[];
  const dialog=document.getElementById('article-preview');
  dialog.showModal=()=>{dialog.open=true;};
  const context=vm.createContext({
    document,HTMLElement:document.defaultView.HTMLElement,books,URL:{revokeObjectURL(){}},
    console,load:(key,fallback)=>store.has(key)?store.get(key):fallback,
    save(key,value){store.set(key,value);return true;},
    renderLibraryStorageNotice(){},renderHomeResume(){},
    longformBooks:()=>books.filter(book=>book.kind!=='paste'&&book.kind!=='article'),
    homeBookSpec:(book,casual)=>({key:'book:'+book.id,stamp:book.id,create(){const tile=document.createElement('div');tile.dataset.bookId=book.id;tile.dataset.casual=String(casual);tile.className='saved-book';return tile;}}),
    serverOnlyBooks:()=>[],serverOnlyCasuals:()=>[],localReadAt:id=>readAt[id]||0,
    homeRegularTile(card,title,meta){const tile=document.createElement('div');tile.className='home-regular-tile';tile.dataset.title=title;tile.dataset.meta=meta;tile.append(card);return tile;},
    homeAddTile(card){const tile=document.createElement('div');tile.className='home-add-tile';tile.append(card);return tile;},
    longformAddCard(){const card=document.createElement('button');card.className='bookcard add';return card;},
    cloudCasualCard(row){const card=document.createElement('div');card.className='casual cloud';card.dataset.cloud=row.book_id;return card;},
    appendRssCards(rail){rss.push(rail.id);},
    openLongReadPreviewOrReader(read){opened.push(read.id);},
    openCasualPreviewOrReader(book){opened.push(book.id);},
    renderFolderControls(){},folderBooks:list=>list,folderMatches:()=>true,
    bookCard(book){const card=document.createElement('div');card.className='bookcard owned';card.dataset.localBook=book.id;return card;},
    cloudBookCard(){return document.createElement('div');},
    coverArtwork:()=>'<svg></svg>',paletteOf:()=>0,
    articlePreviewDialog:dialog,articlePreviewDetails:dialog.querySelector('.ap-details'),articlePreviewGeneration:0,
    articlePreviewClose(){dialog.dataset.kind='article';},cancelPendingBookOpen(){},
    articlePreviewPaint(meta){dialog.dataset.summary=meta?meta.summaryKo:'';},articlePreviewMetadataState(){},
    articlePreviewStatus(text){status.push(text);},
  });
  vm.runInContext('var libraryFolder="";function currentLibraryFolder(){return libraryFolder;}',context);
  vm.runInContext("const CASUAL_KINDS = new Set(['paste','article']);const isCasual = book => CASUAL_KINDS.has(book.kind);",context);
  for(const name of ['el','fillCard','accessibleLibraryCard','classicForMeta','reconcileHomeCards','byRecentlyRead'])
    vm.runInContext(extractFunction(library,name),context);
  vm.runInContext(longreads,context);
  vm.runInContext(titles,context);
  vm.runInContext(webnovels,context);
  context.importClassic=classic=>{books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();};
  for(const name of ['homeRecommendCatalogOwned','homeRecommendReads','offeredLongReads','longReadOfferStamp','homeRecommendClassics','homeRecommendLongReadCard','homeRecommendClassicCard','openHomeRecommendClassic','renderHomeRecommendBooks','homeMyBookEntries','renderHome','renderLongformRecommend','renderLongformLibrary'])
    vm.runInContext(extractFunction(library,name),context);
  return {context,books,opened,rss,store,document,readAt,status,dialog};
}

function railTitles(document){
  return [...document.querySelectorAll('#casual-rail .home-recommend-book .bt')].map(node=>node.textContent);
}

test('고전 is always the catalog row; a saved 기사 choice falls back without RSS or an empty row',()=>{
  for(const saved of [undefined,'articles','books']){
    const {context:c,rss,store,document}=harness();
    if(saved)store.set('breeze.home-recommend',saved);
    c.renderHome();
    assert.equal(rss.length,0,'Home asked for RSS cards');
    assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
    assert.equal(document.getElementById('casual-rail').hidden,false);
    assert.ok(document.querySelectorAll('#casual-rail .home-recommend-book').length>0,'고전 row is empty');
    assert.equal(document.getElementById('home-feed-empty').hidden,true);
  }
});

test('고전 cards show familiar Korean titles while catalog titles stay English',()=>{
  const {context:c,opened,document}=harness();
  c.renderHome();
  const cards=[...document.querySelectorAll('#casual-rail .home-recommend-book')];
  assert.deepEqual(cards.map(card=>card.querySelector('.bt').textContent),[
    '이상한 나라의 앨리스',
    '보헤미아 왕국의 스캔들','빨간 머리 연맹','얼룩 끈','마지막 사건','바스커빌 가의 개',
    '위대한 개츠비',
  ]);
  assert.equal(cards[0].getAttribute('aria-label'),'이상한 나라의 앨리스');
  assert.equal(cards[0].querySelector('.author').textContent,'Lewis Carroll');
  // Covers are the same catalog files; only the caption changes.
  const scandal=cards.find(card=>card.dataset.longreadId==='sherlock-holmes-scandal-in-bohemia');
  assert.equal(scandal.querySelector('img.cover').getAttribute('src'),'assets/longreads/covers/scandal-in-bohemia.webp');
  // Imports, file names and title lookups still use the English title.
  vm.runInContext('globalThis.__titles=LONG_READS.map(read=>read.title)',c);
  assert.ok(c.__titles.includes('A Scandal in Bohemia'));
  assert.match(longreads,/importFile\(file,\{\s*title:read\.title/);
  assert.equal(c.classicDisplayTitle({id:'pride-and-prejudice',title:'Pride and Prejudice'}),'오만과 편견');
  assert.equal(c.classicDisplayTitle({id:'unknown-new-book',title:'A New Book'}),'A New Book');
  scandal.click();
  assert.deepEqual(opened,['sherlock-holmes-scandal-in-bohemia']);
});

test('a started book leaves 고전 and appears in 내 책; removing it brings the offer back',()=>{
  const {context:c,books,document}=harness();
  c.renderHome();
  assert.ok(railTitles(document).includes('보헤미아 왕국의 스캔들'));
  books.unshift({id:'bohemia',kind:'txt',title:'A Scandal in Bohemia',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-scandal-in-bohemia'});
  c.renderHome();
  assert.equal(railTitles(document).includes('보헤미아 왕국의 스캔들'),false);
  assert.ok(document.querySelector('#shelf [data-book-id="bohemia"]'));
  books.shift();
  c.renderHome();
  assert.ok(railTitles(document).includes('보헤미아 왕국의 스캔들'));
});

test('EPUB classicId and a migrated copy match the same catalog id',()=>{
  const {context:c,books,document}=harness();
  books.push({id:'alice-epub',kind:'epub',title:"Alice's Adventures in Wonderland",author:'Lewis Carroll',classicId:'alice-in-wonderland'});
  books.push({id:'gatsby-text',kind:'txt',title:'The Great Gatsby',author:'F. Scott Fitzgerald',classicId:'the-great-gatsby',longReadId:'the-great-gatsby'});
  books.push({id:'bohemia-epub',kind:'epub',title:'A Scandal in Bohemia',author:'Arthur Conan Doyle',classicId:'sherlock-holmes-scandal-in-bohemia'});
  c.renderHome();
  const shown=railTitles(document);
  assert.equal(shown.includes('이상한 나라의 앨리스'),false);
  assert.equal(shown.includes('위대한 개츠비'),false);
  assert.equal(shown.includes('보헤미아 왕국의 스캔들'),false);
  assert.ok(shown.includes('얼룩 끈'));
});

test('a server library row hides the same id unless this device hid that row',()=>{
  const {context:c,document}=harness();
  const rows=[
    {book_id:'cloud-alice',meta:{classicId:'alice-in-wonderland',title:"Alice's Adventures in Wonderland"}},
    {book_id:'cloud-bohemia',meta:{longReadId:'sherlock-holmes-scandal-in-bohemia',title:'A Scandal in Bohemia'}},
  ];
  const hidden={};
  c.activeServerBooks=()=>rows;
  c.hiddenBookIds=()=>hidden;
  c.renderHome();
  assert.equal(railTitles(document).includes('이상한 나라의 앨리스'),false);
  assert.equal(railTitles(document).includes('보헤미아 왕국의 스캔들'),false);
  hidden['cloud-alice']=true;
  c.renderHome();
  assert.ok(railTitles(document).includes('이상한 나라의 앨리스'));
  assert.equal(railTitles(document).includes('보헤미아 왕국의 스캔들'),false);
});

test('a remote catalog book shows its Korean title, and an empty 고전 row says the books are in 내 책',()=>{
  const {context:c,books,document}=harness();
  c.remoteClassicCatalogReads=()=>[{id:'pride-and-prejudice',title:'Pride and Prejudice',author:'Jane Austen',cover:'cover.webp'}];
  c.renderHome();
  assert.ok(railTitles(document).includes('오만과 편견'));
  const ids=[
    'sherlock-holmes-speckled-band','sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league',
    'sherlock-holmes-final-problem','sherlock-holmes-hound-of-the-baskervilles',
    'alice-in-wonderland','the-great-gatsby','pride-and-prejudice',
  ];
  for(const id of ids)books.push({id:'lib-'+id,kind:'txt',title:id,longReadId:id});
  c.renderHome();
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(document.getElementById('casual-rail').hidden,true);
  const empty=document.getElementById('home-feed-empty');
  assert.equal(empty.hidden,false);
  assert.equal(empty.textContent,'시작한 책은 서재에 있어요.');
  books.length=0;
  c.renderHome();
  assert.equal(document.getElementById('casual-rail').hidden,false);
  assert.equal(empty.hidden,true);
});

test('내 책 merges books, pasted text, articles and cloud rows, most recently read first',()=>{
  const {context:c,books,readAt,document}=harness();
  books.push({id:'pdf',kind:'pdf',title:'A PDF',addedAt:1});
  books.push({id:'paste',kind:'paste',title:'Pasted',addedAt:2});
  books.push({id:'article',kind:'article',title:'News',addedAt:3});
  readAt.paste=50;readAt.pdf=40;
  c.serverOnlyCasuals=()=>[{book_id:'cloud-1',meta:{title:'Cloud',kind:'paste',addedAt:0}}];
  c.renderHome();
  const keys=[...document.getElementById('shelf').children].map(node=>node.getAttribute('data-home-key'));
  assert.deepEqual(keys,['book:paste','book:pdf','book:article','cloud:cloud-1','add']);
  assert.equal(document.querySelector('#shelf [data-book-id="paste"]').dataset.casual,'true');
  assert.equal(document.querySelector('#shelf [data-book-id="pdf"]').dataset.casual,'false');
});

test('웹소설 shows three permitted works with exact credits and a 곧 공개 state',()=>{
  const {context:c,document}=harness();
  c.renderHome();
  const tiles=[...document.querySelectorAll('#webnovel-rail .home-regular-tile')];
  assert.deepEqual(tiles.map(tile=>tile.dataset.meta),['R. K. Goff','RavensDagger','InadvisablyCompelled']);
  assert.deepEqual(tiles.map(tile=>tile.dataset.title),['R. K. Goff 연재작','Cinnamon Bun','Chasing Sunlight']);
  assert.ok(tiles.every(tile=>tile.querySelector('.prog').textContent==='곧 공개'));
  assert.doesNotMatch(webnovels,/vampire|뱀파이어|흡혈/i,'Chasing Sunlight must never be described as a vampire novel');
  assert.doesNotMatch(webnovels,/<script|adsbygoogle|affiliate|tag=|price|결제|구매/i,'Web novels carry no ads or monetization');
});

test('a web-novel card opens the shared preview with intro, credit, links and the chapter list',()=>{
  const {context:c,document,dialog,status}=harness();
  c.renderHome();
  document.querySelector('#webnovel-rail [data-webnovel-id="chasing-sunlight"]').click();
  assert.equal(dialog.dataset.kind,'webnovel');
  assert.equal(dialog.querySelector('.ap-title').textContent,'Chasing Sunlight');
  assert.match(dialog.dataset.summary,/InadvisablyCompelled/);
  const details=dialog.querySelector('.ap-details');
  assert.equal(details.hidden,false);
  assert.match(details.textContent,/글: InadvisablyCompelled/);
  assert.match(details.textContent,/무료 · 광고 없음/);
  const links=[...details.querySelectorAll('a')];
  assert.deepEqual(links.map(link=>link.textContent),['Royal Road에서 보기','Kindle 판 보기']);
  assert.ok(links.every(link=>link.getAttribute('rel')==='noopener noreferrer'&&/^https:\/\//.test(link.getAttribute('href'))));
  const rows=[...dialog.querySelectorAll('.ap-chapters .ap-chapter')];
  assert.equal(rows.length,10);
  assert.equal(rows[0].querySelector('.ap-chapter-n').textContent,'1화');
  assert.equal(rows[0].getAttribute('aria-disabled'),'true');
  assert.equal(rows[0].querySelector('.ap-chapter-state').textContent,'곧 공개');
  const start=dialog.querySelector('.ap-start');
  assert.equal(start.textContent,'곧 공개');
  assert.equal(start.disabled,true);
  rows[1].click();
  assert.equal(status.at(-1),'2화는 곧 공개돼요.');
  assert.match(previewCss,/#article-preview:not\(\[data-kind="webnovel"\]\) \.ap-chapters\{display:none;\}/);
  // No separate episode page: the list lives in the preview dialog only.
  assert.doesNotMatch(index,/id="v-webnovel|id="v-episodes/);
});

test('R. K. Goff stays at 10 chapters and the card shows the chapter being read',()=>{
  const {context:c,books,readAt,document,dialog}=harness();
  vm.runInContext(`const goff=WEB_NOVELS.find(work=>work.id==='rkgoff');
    goff.chapters=Array.from({length:14},(_,i)=>({n:i+1,title:'Chapter '+(i+1),file:'assets/webnovels/rkgoff/'+(i+1)+'.txt'}));`,c);
  books.push({id:'goff-2',kind:'txt',title:'x',webNovelId:'rkgoff',webNovelChapter:2});
  books.push({id:'goff-3',kind:'txt',title:'y',webNovelId:'rkgoff',webNovelChapter:3});
  readAt['goff-2']=10;readAt['goff-3']=20;
  c.renderHome();
  const goff=document.querySelector('#webnovel-rail [data-webnovel-id="rkgoff"]');
  assert.equal(goff.querySelector('.prog').textContent,'3화 읽는 중');
  goff.click();
  const rows=[...dialog.querySelectorAll('.ap-chapters .ap-chapter')];
  assert.equal(rows.length,10,'rkgoff permits the first 10 chapters only');
  assert.equal(rows.at(-1).querySelector('.ap-chapter-n').textContent,'10화');
  assert.equal(rows[2].getAttribute('aria-current'),'true');
  assert.equal(rows[2].hasAttribute('aria-disabled'),false);
  assert.equal(dialog.querySelector('.ap-start').textContent,'3화 이어 읽기');
});

function libraryOfferTitles(document){
  return [...document.querySelectorAll('#longform-recommend-rail .home-recommend-book .bt')].map(node=>node.textContent);
}

test('long-form offers use the 추천 rail and the same catalog ownership as Home',()=>{
  const {context:c,books,document}=harness();
  c.renderLongformLibrary();
  const section=document.getElementById('longform-recommend');
  assert.equal(section.hidden,false);
  assert.equal(document.querySelectorAll('#longform-grid .bookcard.add').length,1);
  assert.ok(libraryOfferTitles(document).includes('보헤미아 왕국의 스캔들'));
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  c.renderLongformLibrary();
  assert.equal(document.getElementById('longform-cnt').textContent,'1권');
  assert.equal(libraryOfferTitles(document).includes('얼룩 끈'),false);
  c.libraryFolder='school';
  c.renderLongformLibrary();
  assert.equal(section.hidden,true);
});
