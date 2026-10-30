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

test('추천 is the heading and 고전/웹소설/기사 is its toggle, in that order',()=>{
  // 고전 is a toggle label only, never the big row heading.
  assert.match(index,/id="home-recommend-title"[^>]*>추천<\/h2>/);
  assert.doesNotMatch(index,/<h2[^>]*>고전<\/h2>/);
  assert.match(index,/id="home-recommend-kind"[^>]*role="group"/);
  const kinds=[...index.matchAll(/data-kind="([a-z]+)"[^>]*>([^<]+)<\/button>/g)].map(match=>[match[1],match[2]]);
  assert.deepEqual(kinds,[['classics','고전'],['webnovels','웹소설'],['articles','기사']]);
  assert.match(index,/data-kind="classics" aria-pressed="true"/);
  // 추천 on top, 내 책 below. No 이어 읽기 or 가볍게 읽기 row.
  const order=[...index.matchAll(/<section id="(continue|casuals|longform|home-casuals|webnovels)"/g)].map(match=>match[1]);
  assert.deepEqual(order,['casuals','longform'],'추천 on top, 내 책 below, no 이어 읽기 row');
  assert.match(shellCss,/#v-home :is\(#casuals,#longform\) > \.sec-head\{[^}]*height:30px/);
  assert.match(shellCss,/#v-home #home-recommend-title\{[^}]*color:var\(--settings-ink\)/);
  // One toggle look for 추천 and 내 책.
  assert.match(index,/id="mybooks-filter" class="home-kind"/);
  assert.match(index,/id="home-recommend-kind" class="home-kind"/);
  assert.match(shellCss,/#v-home \.home-kind\{[^}]*border:1px solid var\(--settings-line\)[^}]*border-radius:7px/);
  assert.match(shellCss,/#v-home \.home-kind button\[aria-pressed="true"\]\{[^}]*background:var\(--settings-close\)[^}]*color:var\(--settings-ink\)/);
  assert.match(shellCss,/#v-home \.home-kind button\{[^}]*color:var\(--settings-muted\)[^}]*font:600 12\.5px/);
  assert.match(shellCss,/#v-home \.home-kind button::after\{[^}]*height:44px/);
  const kindCss=shellCss.slice(shellCss.indexOf('#v-home .home-kind{'),shellCss.indexOf('@media(prefers-reduced-motion:reduce){#v-home .home-kind'));
  assert.doesNotMatch(kindCss,/#[0-9a-fA-F]{3,8}/,'The toggle introduces a color outside the existing variables');
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

test('Home 추천 and 내 책 are 2-column grids on a phone with whole 2:3 covers',()=>{
  assert.match(homeCss,/#v-home :is\(#casual-rail,#shelf\)\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(homeCss,/@media \(min-width:700px\)\{\s*#v-home :is\(#casual-rail,#shelf\)\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(homeCss,/@media \(min-width:1024px\)\{\s*#v-home :is\(#casual-rail,#shelf\)\{grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
  assert.match(homeCss,/#v-home #casual-rail > \.home-recommend-book \.cover\{[^}]*height:calc\(100cqw \* 1\.5\)/);
  assert.match(homeCss,/#v-home #casual-rail > \.home-recommend-book\{[^}]*container-type:inline-size/);
  const grid=homeCss.slice(homeCss.indexOf('/* ---- Home grids'),homeCss.indexOf('/* Quiet typographic jackets'));
  assert.doesNotMatch(grid,/:\s*#[0-9a-fA-F]{3,8}\b/,'Home grid introduces a new color');
});

function harness(){
  /* 홈 아래줄은 '내 책' 하나로 합쳐졌습니다(#shelf 한 레일 + 전체/책/글 거르개).
     가볍게 읽기(home-casual-rail) 섹션은 없어졌고, 고전과 내 책 사이에 웹소설
     줄(#webnovel-rail)이 들어옵니다. */
  const {document}=parseHTML(`<div id="home-recommend-kind" role="group"><button type="button" data-kind="classics" aria-pressed="true">고전</button><button type="button" data-kind="webnovels" aria-pressed="false">웹소설</button><button type="button" data-kind="articles" aria-pressed="false">기사</button></div>
    <div id="casual-rail"></div><p id="home-feed-empty"></p>
    <section id="longform"><div id="mybooks-filter"><button data-mybooks="all" aria-pressed="true"></button><button data-mybooks="books" aria-pressed="false"></button><button data-mybooks="casuals" aria-pressed="false"></button></div></section>
    <div id="shelf"></div>
    <span id="longform-cnt"></span><div id="longform-grid"></div><div id="longform-empty" hidden></div>
    <section id="longform-recommend" hidden><h2 id="longform-recommend-title">추천</h2><div id="longform-recommend-rail"></div></section>`);
  const store=new Map(),opened=[],rss=[];
  const books=[];
  const context=vm.createContext({
    document,HTMLElement:document.defaultView.HTMLElement,books,URL:{revokeObjectURL(){}},
    console,load:(key,fallback)=>store.has(key)?store.get(key):fallback,
    save(key,value){store.set(key,value);return true;},
    renderLibraryStorageNotice(){},renderHomeResume(){},
    longformBooks:()=>books.filter(book=>book.kind!=='paste'&&book.kind!=='article'),
    homeBookSpec:book=>({key:'book:'+book.id,stamp:book.id,create(){const tile=document.createElement('div');tile.dataset.bookId=book.id;tile.className='saved-book';return tile;}}),
    serverOnlyBooks:()=>[],serverOnlyCasuals:()=>[],casualBooks:()=>[],
    readAt:{},positions:{},
    isCasual:book=>book.kind==='paste'||book.kind==='article',
    homeRegularTile(card){const tile=document.createElement('div');tile.className='home-regular-tile';tile.append(card);return tile;},
    homeAddTile(card){const tile=document.createElement('div');tile.className='home-add-tile';tile.append(card);return tile;},
    longformAddCard(){const card=document.createElement('button');card.className='bookcard add';return card;},
    casualAddCard:()=>document.createElement('button'),
    // The 기사 tab paints RSS through this spy; other tabs must never call it.
    appendRssCards(rail){rss.push(rail.id);rail.dataset.rssStamp='articles';const card=document.createElement('article');card.className='casual rss-card';rail.append(card);},
    openLongReadPreviewOrReader(read){opened.push(read.id);},
    openCasualPreviewOrReader(book){opened.push(book.id);},
    importClassic(classic){books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();},
    renderFolderControls(){},folderBooks:list=>list,folderMatches:()=>true,
    bookCard(book){const card=document.createElement('div');card.className='bookcard owned';card.dataset.localBook=book.id;return card;},
    cloudBookCard(){return document.createElement('div');},
    cloudCasualCard(){return document.createElement('div');},
    openWebNovelPreview(work){opened.push('webnovel:'+work.id);},
    activeAppView:()=>'home',
  });
  vm.runInContext('var libraryFolder="";function currentLibraryFolder(){return libraryFolder;}function localReadAt(id){return readAt[id]||0;}function posOf(id){return positions[id]||{p:0,t:0};}var WEBNOVEL_PROGRESS_KEY="breeze.webnovel-progress.v1",MYBOOKS_FILTER_KEY="breeze.mybooks-filter";',context);
  for(const name of ['el','fillCard','accessibleLibraryCard','classicForMeta','reconcileHomeCards','byRecentlyRead'])
    vm.runInContext(extractFunction(library,name),context);
  vm.runInContext(readFileSync(resolve(root,'scripts/library/longreads.js'),'utf8'),context);
  context.importClassic=classic=>{books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();};
  for(const name of ['homeRecommendCatalogOwned','homeRecommendKind','homeRecommendReads','offeredLongReads','longReadOfferStamp','homeRecommendClassics','syncHomeRecommendToggle','setHomeRecommendKind','clearHomeRssCards','homeRecommendLongReadCard','homeRecommendClassicCard','openHomeRecommendClassic','renderHomeRecommendBooks','webNovelProgress','webNovelChapterAt','webNovelProgressLabel','webNovelCard','renderHomeWebNovels','renderHomeArticles','myBooksEntries','myBooksFilter','setMyBooksFilter','syncMyBooksFilter','renderHome','renderLongformRecommend','renderLongformLibrary'])
    vm.runInContext(extractFunction(library,name),context);
  return {context,books,opened,rss,store,document};
}

// The canonical English title lives on data-longread-id / the record, while the
// visible .bt caption is the friendly Korean display title. These helpers read
// each so ownership (by English id) and display (Korean) can be asserted apart.
function railTitles(document){
  return [...document.querySelectorAll('#casual-rail .home-recommend-book .bt')].map(node=>node.textContent);
}
function railLongreadIds(document){
  return [...document.querySelectorAll('#casual-rail .home-recommend-book[data-longread-id]')].map(node=>node.dataset.longreadId);
}

test('고전 is the default tab; old 기사 and 책 choices migrate to 기사 and 고전',()=>{
  const {context:c,rss,store,document}=harness();
  assert.equal(c.homeRecommendKind(),'classics');
  c.renderHome();
  const pressed=()=>[...document.querySelectorAll('#home-recommend-kind button')].filter(button=>button.getAttribute('aria-pressed')==='true').map(button=>button.dataset.kind);
  assert.deepEqual(pressed(),['classics']);
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  assert.ok(document.querySelectorAll('#casual-rail .home-recommend-book').length>0);
  assert.equal(rss.length,0,'고전 must not ask RSS');
  // Two-tab era values: 'books' was the 책 rail (now 고전), 'articles' is 기사.
  store.set('breeze.home-recommend','books');
  assert.equal(c.homeRecommendKind(),'classics');
  store.set('breeze.home-recommend','articles');
  assert.equal(c.homeRecommendKind(),'articles');
  c.renderHome();
  assert.deepEqual(pressed(),['articles']);
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(rss.length,1);
  store.set('breeze.home-recommend','nonsense');
  assert.equal(c.homeRecommendKind(),'classics');
});

test('the toggle switches the one rail between 고전, 웹소설 and 기사',()=>{
  const {context:c,rss,store,document,opened}=harness();
  c.renderHome();
  c.setHomeRecommendKind('webnovels');
  assert.equal(store.get('breeze.home-recommend'),'webnovels');
  const novels=[...document.querySelectorAll('#casual-rail .home-recommend-book.webnovel')];
  assert.deepEqual(novels.map(card=>card.dataset.webnovelId),['cinnamon-bun','chasing-sunlight']);
  assert.equal(document.querySelectorAll('#casual-rail [data-longread-id],#casual-rail .rss-card').length,0);
  // Breeze-made typographic covers, never empty cards.
  for(const card of novels)
    assert.match(card.querySelector('img.cover').getAttribute('src'),new RegExp('^assets/webnovels/covers/'+card.dataset.webnovelId+'\\.webp$'));
  // Real English title on the card, its Korean reading under it, exact-case author.
  assert.deepEqual(novels.map(card=>[card.querySelector('.bt').textContent,card.querySelector('.ko').textContent,card.querySelector('.author').textContent]),
    [['Cinnamon Bun','시나몬 번','RavensDagger'],['Chasing Sunlight','체이싱 선라이트','InadvisablyCompelled']]);
  assert.doesNotMatch(document.getElementById('casual-rail').textContent,/연재작|Ar'Kendrithyst|R\. K\. Goff/);
  novels[1].click();
  assert.equal(opened.at(-1),'webnovel:chasing-sunlight');
  c.setHomeRecommendKind('articles');
  assert.equal(document.querySelectorAll('#casual-rail .webnovel').length,0);
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  assert.equal(rss.length,1);
  c.setHomeRecommendKind('classics');
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  assert.ok(document.querySelectorAll('#casual-rail [data-longread-id]').length>0);
  assert.equal(rss.length,1);
});

test('내 책 puts opened, unfinished books first, then the rest by when they were opened',()=>{
  const {context:c,books,document,store}=harness();
  books.push({id:'old',kind:'pdf',title:'Old',addedAt:5},{id:'new',kind:'article',title:'New',addedAt:1},
    {id:'done',kind:'epub',title:'Done',addedAt:2},{id:'never',kind:'epub',title:'Never',addedAt:9},{id:'never2',kind:'epub',title:'Never 2',addedAt:3});
  Object.assign(c.readAt,{old:10,new:30,done:40});
  Object.assign(c.positions,{old:{p:.4,t:10},new:{p:.1,t:30},done:{p:1,t:40}});
  c.renderHome();
  assert.equal(document.getElementById('continue'),null,'No separate 이어 읽기 row');
  const order=()=>[...document.querySelectorAll('#shelf [data-book-id]')].map(node=>node.dataset.bookId);
  assert.deepEqual(order(),['new','old','done','never','never2']);
  store.set('breeze.mybooks-filter','books');
  c.renderHome();
  assert.deepEqual(order(),['old','done','never','never2']);
});

test('the rail shows friendly Korean titles while ids and English titles still match ownership',()=>{
  const {context:c,books,opened,document}=harness();
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  books.push({id:'saved-odyssey',kind:'epub',title:'The Odyssey',author:'Homer',classicId:'odyssey'});
  c.renderHome();
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  const cards=[...document.querySelectorAll('#casual-rail .home-recommend-book')];
  // The visible captions are Korean display titles, in the same catalog order.
  assert.deepEqual(cards.map(card=>card.querySelector('.bt').textContent),[
    '이상한 나라의 앨리스',
    '셜록 홈즈: 보헤미아 왕국의 스캔들','셜록 홈즈: 빨간 머리 연맹','셜록 홈즈: 마지막 사건','셜록 홈즈: 바스커빌 가문의 개',
    '위대한 개츠비',
  ]);
  // The underlying ids remain the canonical English catalog ids.
  assert.deepEqual(railLongreadIds(document),[
    'alice-in-wonderland',
    'sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league','sherlock-holmes-final-problem','sherlock-holmes-hound-of-the-baskervilles',
    'the-great-gatsby',
  ]);
  const scandal=cards.find(card=>card.dataset.longreadId==='sherlock-holmes-scandal-in-bohemia');
  assert.equal(scandal.querySelector('.author').textContent,'Arthur Conan Doyle');
  assert.equal(scandal.querySelector('.author').textContent.includes('SHERLOCK'),false);
  assert.equal(cards[0].querySelector('.author').textContent,'Lewis Carroll');
  // Tapping opens by the English catalog id, not the Korean caption.
  scandal.click();
  assert.deepEqual(opened,['sherlock-holmes-scandal-in-bohemia']);
  const gatsby=cards.find(card=>card.dataset.longreadId==='the-great-gatsby');
  gatsby.click();
  assert.equal(opened.at(-1),'the-great-gatsby');
  // The classicDisplayTitle helper falls back to the English title when no koTitle.
  assert.equal(c.classicDisplayTitle({title:'Only English'}),'Only English');
  assert.equal(c.classicDisplayTitle({koTitle:'한글',title:'English'}),'한글');
});

test('a started book leaves the 고전 rail and returns when it leaves the library',()=>{
  const {context:c,books,document}=harness();
  c.renderHome();
  assert.ok(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
  assert.ok(railTitles(document).includes('셜록 홈즈: 보헤미아 왕국의 스캔들'));
  books.unshift({id:'bohemia',kind:'txt',title:'A Scandal in Bohemia',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-scandal-in-bohemia'});
  c.renderHome();
  assert.equal(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'),false);
  assert.ok(document.querySelector('#shelf [data-book-id="bohemia"]'));
  books.shift();
  c.renderHome();
  assert.ok(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
  assert.equal(document.getElementById('casual-rail').hidden,false);
  assert.equal(document.getElementById('home-feed-empty').hidden,true);
});

test('EPUB classicId and a migrated copy match the same catalog id',()=>{
  const {context:c,books,document}=harness();
  books.push({id:'alice-epub',kind:'epub',title:"Alice's Adventures in Wonderland",author:'Lewis Carroll',classicId:'alice-in-wonderland'});
  books.push({id:'gatsby-text',kind:'txt',title:'The Great Gatsby',author:'F. Scott Fitzgerald',classicId:'the-great-gatsby',longReadId:'the-great-gatsby'});
  books.push({id:'bohemia-epub',kind:'epub',title:'A Scandal in Bohemia',author:'Arthur Conan Doyle',classicId:'sherlock-holmes-scandal-in-bohemia'});
  books.push({id:'notebook',kind:'txt',title:'The Odyssey',author:'Homer'});
  c.renderHome();
  const ids=railLongreadIds(document);
  assert.equal(ids.includes('alice-in-wonderland'),false);
  assert.equal(ids.includes('the-great-gatsby'),false);
  assert.equal(ids.includes('sherlock-holmes-scandal-in-bohemia'),false);
  // The Odyssey is not in the catalog, so it was never offered.
  assert.equal(railTitles(document).includes('The Odyssey'),false);
  assert.ok(ids.includes('sherlock-holmes-speckled-band'));
  assert.ok(railTitles(document).includes('셜록 홈즈: 얼룩 끈'));
});

test('a server library row hides the same id unless this device hid that row',()=>{
  const {context:c,document}=harness();
  const rows=[
    {book_id:'cloud-odyssey',meta:{classicId:'odyssey',title:'The Odyssey'}},
    {book_id:'cloud-alice',meta:{classicId:'alice-in-wonderland',title:"Alice's Adventures in Wonderland"}},
    {book_id:'cloud-bohemia',meta:{longReadId:'sherlock-holmes-scandal-in-bohemia',title:'A Scandal in Bohemia'}},
  ];
  const hidden={};
  c.activeServerBooks=()=>rows;
  c.hiddenBookIds=()=>hidden;
  c.renderHome();
  assert.equal(railLongreadIds(document).includes('alice-in-wonderland'),false);
  assert.equal(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'),false);
  hidden['cloud-alice']=true;
  c.renderHome();
  assert.ok(railLongreadIds(document).includes('alice-in-wonderland'));
  assert.ok(railTitles(document).includes('이상한 나라의 앨리스'));
  assert.equal(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'),false);
  hidden['cloud-bohemia']=true;
  c.renderHome();
  assert.ok(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
});

test('a remote catalog book uses the same id, and an empty rail says the books are in the library',()=>{
  const {context:c,books,rss,document}=harness();
  // A remote row without koTitle gets its familiar Korean title from the bundled map.
  c.remoteClassicCatalogReads=()=>[{id:'pride-and-prejudice',title:'Pride and Prejudice',author:'Jane Austen',cover:'cover.webp'}];
  c.renderHome();
  assert.ok(railLongreadIds(document).includes('pride-and-prejudice'));
  assert.ok(railTitles(document).includes('오만과 편견'));
  assert.equal(c.classicDisplayTitle({id:'little-women',title:'Little Women'}),'작은 아씨들');
  assert.equal(c.classicDisplayTitle({id:'x',title:'Unknown',originalTitle:'Frankenstein (1818)'}),'프랑켄슈타인');
  assert.equal(c.classicDisplayTitle({id:'x',title:'Great Expectations',koTitle:'목록 제목'}),'목록 제목');
  const ids=[
    'sherlock-holmes-speckled-band','sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league',
    'sherlock-holmes-final-problem','sherlock-holmes-hound-of-the-baskervilles',
    'alice-in-wonderland','the-great-gatsby','odyssey','pride-and-prejudice',
  ];
  for(const id of ids)books.push({id:'lib-'+id,kind:'txt',title:id,longReadId:id});
  c.renderHome();
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(document.getElementById('casual-rail').hidden,true);
  const empty=document.getElementById('home-feed-empty');
  assert.equal(empty.hidden,false);
  assert.equal(empty.textContent,'시작한 책은 서재에 있어요.');
  // An empty 고전 tab stays empty copy; it never falls back to RSS.
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  assert.equal(rss.length,0);
  books.length=0;
  c.renderHome();
  assert.equal(document.getElementById('casual-rail').hidden,false);
  assert.equal(empty.hidden,true);
  assert.ok(railLongreadIds(document).includes('pride-and-prejudice'));
  assert.ok(railLongreadIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
});

function libraryOfferIds(document){
  return [...document.querySelectorAll('#longform-recommend-rail .home-recommend-book[data-longread-id]')].map(node=>node.dataset.longreadId);
}

test('long-form offers use the 추천 rail and the same catalog ownership as Home',()=>{
  const {context:c,books,document}=harness();
  c.renderLongformLibrary();
  const section=document.getElementById('longform-recommend');
  assert.equal(section.hidden,false);
  assert.equal(document.querySelectorAll('#longform-grid .longread').length,0);
  assert.equal(document.querySelectorAll('#longform-grid .bookcard.add').length,1);
  assert.equal(document.getElementById('longform-cnt').textContent,'');
  assert.ok(libraryOfferIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
  assert.ok(libraryOfferIds(document).includes('alice-in-wonderland'));
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  c.renderLongformLibrary();
  assert.equal(document.getElementById('longform-cnt').textContent,'1권');
  assert.ok(document.querySelector('#longform-grid [data-local-book="saved-holmes"]'));
  assert.equal(libraryOfferIds(document).includes('sherlock-holmes-speckled-band'),false);
  assert.ok(libraryOfferIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
  c.libraryFolder='school';
  c.renderLongformLibrary();
  assert.equal(section.hidden,true);
  assert.equal(document.querySelector('#longform-recommend-title').textContent,'추천');
  assert.equal(document.querySelectorAll('#longform-recommend-rail .home-recommend-book').length,0);
  c.libraryFolder='';
  books.length=0;
  const rows=[{book_id:'cloud-bohemia',meta:{longReadId:'sherlock-holmes-scandal-in-bohemia',title:'A Scandal in Bohemia'}}];
  const hidden={};
  c.activeServerBooks=()=>rows;
  c.hiddenBookIds=()=>hidden;
  c.renderLongformLibrary();
  assert.equal(section.hidden,false);
  assert.equal(libraryOfferIds(document).includes('sherlock-holmes-scandal-in-bohemia'),false);
  hidden['cloud-bohemia']=true;
  c.renderLongformLibrary();
  assert.ok(libraryOfferIds(document).includes('sherlock-holmes-scandal-in-bohemia'));
  for(const id of ['sherlock-holmes-speckled-band','sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league','sherlock-holmes-final-problem','sherlock-holmes-hound-of-the-baskervilles','alice-in-wonderland','the-great-gatsby'])
    books.push({id:'lib-'+id,kind:'txt',title:id,longReadId:id});
  c.renderLongformLibrary();
  assert.equal(section.hidden,true);
  assert.equal(document.getElementById('longform-cnt').textContent,'7권');
});
