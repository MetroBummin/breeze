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

test('the recommendation heading keeps its place and gains the E1 kind control',()=>{
  assert.match(index,/id="home-recommend-title"[^>]*>추천<\/h2>/);
  assert.match(index,/id="home-recommend-kind"[^>]*role="group"/);
  assert.match(index,/data-kind="articles"[^>]*>기사<\/button>/);
  assert.match(index,/data-kind="books"[^>]*>책<\/button>/);
  assert.match(shellCss,/#v-home #casuals > \.sec-head\{[^}]*height:30px/);
  assert.match(shellCss,/#v-home #home-recommend-title\{[^}]*color:var\(--settings-ink\)/);
  assert.match(shellCss,/#home-recommend-kind\{[^}]*border:1px solid var\(--settings-line\)[^}]*border-radius:7px/);
  assert.match(shellCss,/#home-recommend-kind button\[aria-pressed="true"\]\{[^}]*background:var\(--settings-close\)[^}]*color:var\(--settings-ink\)/);
  assert.match(shellCss,/#home-recommend-kind button\{[^}]*color:var\(--settings-muted\)[^}]*font:600 12\.5px/);
  assert.match(shellCss,/#home-recommend-kind button::after\{[^}]*height:44px/);
  const kindCss=shellCss.slice(shellCss.indexOf('#home-recommend-kind{'),shellCss.indexOf('@media(prefers-reduced-motion:reduce){#home-recommend-kind'));
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

function harness(){
  const {document}=parseHTML(`<div id="casual-rail"></div><p id="home-feed-empty"></p><div id="shelf"></div><div id="home-casual-rail"></div>
    <h2 id="home-recommend-title" data-i18n="home.recommend">추천</h2>
    <section id="home-casuals"></section>
    <section id="longform"><div class="sec-head"><h2><button class="section-link" type="button"><span data-i18n="sec.books">긴 글</span></button></h2></div></section>
    <div id="home-recommend-kind" role="group"><button type="button" data-kind="articles" aria-pressed="true">기사</button><button type="button" data-kind="books">책</button></div>
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
  for(const name of ['homeRecommendCatalogOwned','homeRecommendKind','homeRecommendReads','offeredLongReads','longReadOfferStamp','homeRecommendClassics','syncHomeRecommendToggle','setHomeRecommendKind','clearHomeRssCards','homeRecommendLongReadCard','homeRecommendClassicCard','openHomeRecommendClassic','tossHome','readIsHolmes','bookIsHolmes','applyTossHomeChrome','tossHolmesSources','tossHolmesRailSpecs','tossShelfOfferSpecs','renderHomeRecommendBooks','renderHome','renderLongformRecommend','renderLongformLibrary'])
    vm.runInContext(extractFunction(library,name),context);
  return {context,books,opened,rss,store,document};
}

test('articles stay on the rail and the home shelf does not offer the catalog',()=>{
  const {context:c,rss,store,document}=harness();
  assert.equal(c.homeRecommendKind(),'books');
  c.renderHome();
  assert.equal(document.querySelector('#home-recommend-kind [data-kind="books"]').getAttribute('aria-pressed'),'true');
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  assert.ok(document.querySelectorAll('#casual-rail .home-recommend-book').length>0);
  store.set('breeze.home-recommend','articles');
  c.renderHome();
  assert.equal(c.homeRecommendKind(),'articles');
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(document.querySelectorAll('#shelf [data-home-key^="longread:"]').length,0);
  assert.equal(document.querySelectorAll('#shelf [data-home-key="add"]').length,1);
  assert.match(extractFunction(library,'renderLongformLibrary'),/renderLongformRecommend\(offered\)/);
  assert.doesNotMatch(extractFunction(library,'renderLongformLibrary'),/longReadCard\(/);
  assert.match(extractFunction(library,'offeredLongReads'),/pendingLongReads\(\)/);
  assert.match(extractFunction(library,'offeredLongReads'),/homeRecommendCatalogOwned\(read\.id\)/);
  assert.doesNotMatch(extractFunction(library,'renderHome'),/pendingLongReads|homeRecommendShelfOmits/);
  assert.equal(rss.length,1);
});

test('books replace the rail, keep saved books on the shelf, and open like the library',async()=>{
  const {context:c,books,opened,rss,store,document}=harness();
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  books.push({id:'saved-other',kind:'txt',title:'Notebook',author:'Me'});
  books.push({id:'saved-odyssey',kind:'epub',title:'The Odyssey',author:'Homer',classicId:'odyssey'});
  c.renderHome();
  assert.equal(store.has('breeze.home-recommend'),false);
  assert.equal(document.querySelector('#home-recommend-kind [data-kind="books"]').getAttribute('aria-pressed'),'true');
  assert.equal(document.querySelector('#home-recommend-kind [data-kind="articles"]').getAttribute('aria-pressed'),'false');
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  const cards=[...document.querySelectorAll('#casual-rail .home-recommend-book')];
  assert.equal(document.querySelector('#casual-rail [data-longread-id="sherlock-holmes-speckled-band"]'),null);
  assert.deepEqual(cards.map(card=>card.querySelector('.bt').textContent),[
    "Alice's Adventures in Wonderland",
    'A Scandal in Bohemia','The Red-Headed League','The Final Problem','The Hound of the Baskervilles',
    'The Great Gatsby',
  ]);
  assert.equal(cards.some(card=>card.dataset.classicId==='odyssey'),false);
  assert.equal(c.classicForMeta({classicId:'odyssey',title:'The Odyssey',author:'Homer'}),null);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-odyssey"]'));
  assert.equal(cards[0].querySelector('.author').textContent,'Lewis Carroll');
  const scandal=cards.find(card=>card.dataset.longreadId==='sherlock-holmes-scandal-in-bohemia');
  assert.equal(scandal.querySelector('.author').textContent,'Arthur Conan Doyle');
  assert.equal(scandal.querySelector('.author').textContent.includes('SHERLOCK'),false);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-holmes"]'));
  assert.equal(document.querySelectorAll('#shelf [data-home-key^="longread:"]').length,0);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-other"]'));
  scandal.click();
  assert.deepEqual(opened,['sherlock-holmes-scandal-in-bohemia']);
  const gatsby=cards.find(card=>card.dataset.longreadId==='the-great-gatsby');
  gatsby.click();
  assert.equal(opened.at(-1),'the-great-gatsby');
  c.setHomeRecommendKind('articles');
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-holmes"]'));
  assert.equal(document.querySelectorAll('#shelf [data-home-key^="longread:"]').length,0);
  assert.equal(rss.length,1);
});

function railTitles(document){
  return [...document.querySelectorAll('#casual-rail .home-recommend-book .bt')].map(node=>node.textContent);
}

test('a started book leaves the 책 rail and returns when it leaves the library',()=>{
  const {context:c,books,document}=harness();
  c.renderHome();
  assert.ok(railTitles(document).includes('A Scandal in Bohemia'));
  books.unshift({id:'bohemia',kind:'txt',title:'A Scandal in Bohemia',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-scandal-in-bohemia'});
  c.renderHome();
  assert.equal(railTitles(document).includes('A Scandal in Bohemia'),false);
  assert.ok(document.querySelector('#shelf [data-book-id="bohemia"]'));
  books.shift();
  c.renderHome();
  assert.ok(railTitles(document).includes('A Scandal in Bohemia'));
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
  const shown=railTitles(document);
  assert.equal(shown.includes("Alice's Adventures in Wonderland"),false);
  assert.equal(shown.includes('The Great Gatsby'),false);
  assert.equal(shown.includes('A Scandal in Bohemia'),false);
  assert.equal(shown.includes('The Odyssey'),false);
  assert.ok(shown.includes('The Adventure of the Speckled Band'));
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
  assert.equal(railTitles(document).includes('The Odyssey'),false);
  assert.equal(railTitles(document).includes("Alice's Adventures in Wonderland"),false);
  assert.equal(railTitles(document).includes('A Scandal in Bohemia'),false);
  hidden['cloud-odyssey']=true;
  hidden['cloud-alice']=true;
  c.renderHome();
  assert.equal(railTitles(document).includes('The Odyssey'),false);
  assert.ok(railTitles(document).includes("Alice's Adventures in Wonderland"));
  assert.equal(railTitles(document).includes('A Scandal in Bohemia'),false);
  hidden['cloud-bohemia']=true;
  c.renderHome();
  assert.ok(railTitles(document).includes('A Scandal in Bohemia'));
});

test('a remote catalog book uses the same id, and an empty rail says the books are in the library',()=>{
  const {context:c,books,document}=harness();
  c.remoteClassicCatalogReads=()=>[{id:'pride-and-prejudice',title:'Pride and Prejudice',author:'Jane Austen',cover:'cover.webp'}];
  c.renderHome();
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
  c.setHomeRecommendKind('articles');
  assert.equal(document.getElementById('casual-rail').hidden,false);
  assert.equal(empty.hidden,true);
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  c.setHomeRecommendKind('books');
  books.length=0;
  c.renderHome();
  assert.equal(document.getElementById('casual-rail').hidden,false);
  assert.equal(empty.hidden,true);
  assert.ok(railTitles(document).includes('Pride and Prejudice'));
  assert.ok(railTitles(document).includes('A Scandal in Bohemia'));
});

function libraryOfferTitles(document){
  return [...document.querySelectorAll('#longform-recommend-rail .home-recommend-book .bt')].map(node=>node.textContent);
}

test('long-form offers use the 추천 rail and the same catalog ownership as Home',()=>{
  const {context:c,books,document}=harness();
  c.renderLongformLibrary();
  const section=document.getElementById('longform-recommend');
  assert.equal(section.hidden,false);
  assert.equal(document.querySelectorAll('#longform-grid .longread').length,0);
  assert.equal(document.querySelectorAll('#longform-grid .bookcard.add').length,1);
  assert.equal(document.getElementById('longform-cnt').textContent,'');
  assert.ok(libraryOfferTitles(document).includes('A Scandal in Bohemia'));
  assert.ok(libraryOfferTitles(document).includes("Alice's Adventures in Wonderland"));
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  c.renderLongformLibrary();
  assert.equal(document.getElementById('longform-cnt').textContent,'1권');
  assert.ok(document.querySelector('#longform-grid [data-local-book="saved-holmes"]'));
  assert.equal(libraryOfferTitles(document).includes('The Adventure of the Speckled Band'),false);
  assert.ok(libraryOfferTitles(document).includes('A Scandal in Bohemia'));
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
  assert.equal(libraryOfferTitles(document).includes('A Scandal in Bohemia'),false);
  hidden['cloud-bohemia']=true;
  c.renderLongformLibrary();
  assert.ok(libraryOfferTitles(document).includes('A Scandal in Bohemia'));
  for(const id of ['sherlock-holmes-speckled-band','sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league','sherlock-holmes-final-problem','sherlock-holmes-hound-of-the-baskervilles','alice-in-wonderland','the-great-gatsby'])
    books.push({id:'lib-'+id,kind:'txt',title:id,longReadId:id});
  c.renderLongformLibrary();
  assert.equal(section.hidden,true);
  assert.equal(document.getElementById('longform-cnt').textContent,'7권');
});

test('toss home keeps Holmes on the original shelf and other books on 책장',()=>{
  const {context:c,books,document}=harness();
  c.window={BREEZE_TARGET:'toss'};
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  books.push({id:'saved-other',kind:'txt',title:'Pride and Prejudice',author:'Jane Austen'});
  books.push({id:'saved-backrooms',kind:'txt',title:'Backrooms',author:'',longReadId:'backroom-homeward-bound'});
  c.renderHome();
  const title=document.getElementById('home-recommend-title');
  assert.equal(title.textContent,'셜록 홈즈 오리지널');
  assert.equal(title.hasAttribute('data-i18n'),false);
  assert.equal(document.getElementById('home-recommend-kind').hidden,true);
  assert.equal(document.getElementById('home-casuals').hidden,true);
  const heading=document.querySelector('#longform > .sec-head h2');
  assert.equal(heading.textContent,'책장');
  assert.equal(heading.querySelector('button.section-link'),null);
  const rail=railTitles(document);
  assert.ok(rail.includes('A Scandal in Bohemia'));
  assert.equal(rail.includes("Alice's Adventures in Wonderland"),false);
  assert.equal(rail.includes('The Great Gatsby'),false);
  assert.ok(document.querySelector('#casual-rail [data-book-id="saved-holmes"]'));
  assert.equal(document.querySelector('#shelf [data-book-id="saved-holmes"]'),null);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-other"]'));
  assert.ok(document.querySelector('#shelf [data-book-id="saved-backrooms"]'));
  const shelfTitles=[...document.querySelectorAll('#shelf .home-recommend-book .bt')].map(node=>node.textContent);
  assert.ok(shelfTitles.includes("Alice's Adventures in Wonderland"));
  assert.ok(shelfTitles.includes('The Great Gatsby'));
  assert.equal(shelfTitles.includes('A Scandal in Bohemia'),false);
  assert.equal(document.querySelectorAll('#shelf .get').length,0);
  assert.equal(document.querySelectorAll('#home-casual-rail [data-home-key]').length,0);
  assert.equal(document.querySelectorAll('#shelf [data-home-key="add"]').length,0);
});
