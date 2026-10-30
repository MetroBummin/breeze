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

test('the top row is 고전 with no 기사/책 toggle on home',()=>{
  // Row 1 is now 고전 (classics / long reads). The old 기사/책 toggle and its
  // CSS are gone, and RSS never appears on home.
  assert.match(index,/id="home-recommend-title"[^>]*>고전<\/h2>/);
  assert.doesNotMatch(index,/id="home-recommend-kind"/);
  assert.doesNotMatch(index,/data-kind="articles"/);
  assert.doesNotMatch(index,/data-kind="books"/);
  assert.doesNotMatch(shellCss,/#home-recommend-kind/);
  assert.match(shellCss,/#v-home #home-recommend-title\{[^}]*color:var\(--settings-ink\)/);
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
  const {document}=parseHTML(`<div id="casual-rail"></div><p id="home-feed-empty"></p><div id="shelf"></div><div id="home-casual-rail"></div>
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
    serverOnlyBooks:()=>[],serverOnlyCasuals:()=>[],casualBooks:()=>[],localReadAt:()=>0,
    homeRegularTile(card){const tile=document.createElement('div');tile.className='home-regular-tile';tile.append(card);return tile;},
    homeAddTile(card){const tile=document.createElement('div');tile.className='home-add-tile';tile.append(card);return tile;},
    longformAddCard(){const card=document.createElement('button');card.className='bookcard add';return card;},
    casualAddCard:()=>document.createElement('button'),
    // RSS must never land on the home rail now; this spy proves it is not called there.
    appendRssCards(rail){rss.push(rail.id);rail.dataset.rssStamp='articles';const card=document.createElement('article');card.className='casual rss-card';rail.append(card);},
    openLongReadPreviewOrReader(read){opened.push(read.id);},
    openCasualPreviewOrReader(book){opened.push(book.id);},
    importClassic(classic){books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();},
    renderFolderControls(){},folderBooks:list=>list,folderMatches:()=>true,
    bookCard(book){const card=document.createElement('div');card.className='bookcard owned';card.dataset.localBook=book.id;return card;},
    cloudBookCard(){return document.createElement('div');},
  });
  vm.runInContext('var libraryFolder="";function currentLibraryFolder(){return libraryFolder;}',context);
  for(const name of ['el','fillCard','accessibleLibraryCard','classicForMeta','reconcileHomeCards'])
    vm.runInContext(extractFunction(library,name),context);
  vm.runInContext(readFileSync(resolve(root,'scripts/library/longreads.js'),'utf8'),context);
  context.importClassic=classic=>{books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();};
  for(const name of ['homeRecommendCatalogOwned','homeRecommendKind','homeRecommendReads','offeredLongReads','longReadOfferStamp','homeRecommendClassics','clearHomeRssCards','homeRecommendLongReadCard','homeRecommendClassicCard','openHomeRecommendClassic','renderHomeRecommendBooks','renderHome','renderLongformRecommend','renderLongformLibrary'])
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

test('the home top row shows classics and never RSS, even with a saved 기사 choice',()=>{
  const {context:c,rss,store,document}=harness();
  assert.equal(c.homeRecommendKind(),'books');
  c.renderHome();
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  assert.ok(document.querySelectorAll('#casual-rail .home-recommend-book').length>0);
  // A stored 'articles' preference must still paint the classics, not an empty
  // rail and not RSS.
  store.set('breeze.home-recommend','articles');
  c.renderHome();
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  assert.ok(document.querySelectorAll('#casual-rail .home-recommend-book').length>0);
  assert.equal(document.getElementById('casual-rail').hidden,false);
  assert.equal(document.getElementById('home-feed-empty').hidden,true);
  // appendRssCards is never called from the home rail.
  assert.equal(rss.length,0);
  // Home renders only the classics path now.
  assert.doesNotMatch(extractFunction(library,'renderHome'),/appendRssCards/);
});

test('the rail shows friendly Korean titles while ids and English titles still match ownership',()=>{
  const {context:c,books,opened,document}=harness();
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
  // A remote row without koTitle falls back to its English title on screen.
  c.remoteClassicCatalogReads=()=>[{id:'pride-and-prejudice',title:'Pride and Prejudice',author:'Jane Austen',cover:'cover.webp'}];
  c.renderHome();
  assert.ok(railLongreadIds(document).includes('pride-and-prejudice'));
  assert.ok(railTitles(document).includes('Pride and Prejudice'));
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
  // No RSS fallback exists any more: an empty classics rail stays empty copy.
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
