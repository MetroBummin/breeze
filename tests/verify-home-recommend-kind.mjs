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
  assert.match(homeCss,/#v-home #casual-rail > :is\(\.casual,\.home-recommend-book\)\{[^}]*flex:0 0 min\(61vw,560px\)/);
  assert.match(homeCss,/#v-home #casual-rail > \.home-recommend-book\{[^}]*grid-template-columns:minmax\(0,1fr\)[^}]*aspect-ratio:3\/4/);
  assert.match(homeCss,/#v-home #casual-rail > \.home-recommend-book \.cover\{[^}]*position:relative[^}]*grid-row:1/);
  assert.match(homeCss,/#v-home #casual-rail > \.home-recommend-book \.author\{[^}]*position:relative[^}]*grid-row:3[^}]*color:var\(--settings-muted\)/);
  assert.match(homeCss,/#v-home #casual-rail > \.home-recommend-book \.bt\{[^}]*grid-row:2[^}]*color:var\(--settings-ink\)/);
  const block=homeCss.slice(homeCss.indexOf('#v-home #casual-rail > .home-recommend-book{'),homeCss.indexOf('#v-home #longform{'));
  assert.doesNotMatch(block,/#[0-9a-fA-F]{3,8}/,'Book rail styling introduces a new color');
});

function harness(){
  const {document}=parseHTML(`<div id="casual-rail"></div><p id="home-feed-empty"></p><div id="shelf"></div><div id="home-casual-rail"></div>
    <div id="home-recommend-kind" role="group"><button type="button" data-kind="articles" aria-pressed="true">기사</button><button type="button" data-kind="books">책</button></div>`);
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
    homeAddTile:()=>document.createElement('div'),longformAddCard:()=>document.createElement('button'),
    casualAddCard:()=>document.createElement('button'),
    appendRssCards(rail){rss.push(rail.id);rail.dataset.rssStamp='articles';const card=document.createElement('article');card.className='casual rss-card';rail.append(card);},
    openLongReadPreviewOrReader(read){opened.push(read.id);},
    openCasualPreviewOrReader(book){opened.push(book.id);},
    importClassic(classic){books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();},
  });
  for(const name of ['el','fillCard','accessibleLibraryCard','classicForMeta','reconcileHomeCards'])
    vm.runInContext(extractFunction(library,name),context);
  vm.runInContext(readFileSync(resolve(root,'scripts/library/longreads.js'),'utf8'),context);
  context.importClassic=classic=>{books.unshift({id:'imported-'+classic.id,classicId:classic.id,kind:'epub',title:classic.title,author:classic.author});return Promise.resolve();};
  for(const name of ['homeRecommendKind','homeRecommendReads','homeRecommendClassics','syncHomeRecommendToggle','setHomeRecommendKind','clearHomeRssCards','homeRecommendLongReadCard','homeRecommendClassicCard','openHomeRecommendClassic','renderHomeRecommendBooks','renderHome'])
    vm.runInContext(extractFunction(library,name),context);
  return {context,books,opened,rss,store,document};
}

test('articles stay on the rail and the home shelf does not offer the catalog',()=>{
  const {context:c,rss,document}=harness();
  c.renderHome();
  assert.equal(c.homeRecommendKind(),'articles');
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(document.querySelectorAll('#shelf [data-home-key^="longread:"]').length,0);
  assert.equal(document.querySelectorAll('#shelf [data-home-key="add"]').length,1);
  assert.match(extractFunction(library,'renderLongformLibrary'),/pendingLongReads\(\)/);
  assert.doesNotMatch(extractFunction(library,'renderHome'),/pendingLongReads|homeRecommendShelfOmits/);
  assert.equal(rss.length,1);
});

test('books replace the rail, keep saved books on the shelf, and open like the library',async()=>{
  const {context:c,books,opened,rss,store,document}=harness();
  books.push({id:'saved-holmes',kind:'txt',title:'My Holmes',author:'Arthur Conan Doyle',longReadId:'sherlock-holmes-speckled-band'});
  books.push({id:'saved-other',kind:'txt',title:'Notebook',author:'Me'});
  books.push({id:'saved-odyssey',kind:'epub',title:'The Odyssey',author:'Homer',classicId:'odyssey'});
  c.setHomeRecommendKind('books');
  assert.equal(store.get('breeze.home-recommend'),'books');
  assert.equal(document.querySelector('#home-recommend-kind [data-kind="books"]').getAttribute('aria-pressed'),'true');
  assert.equal(document.querySelector('#home-recommend-kind [data-kind="articles"]').getAttribute('aria-pressed'),'false');
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,0);
  const cards=[...document.querySelectorAll('#casual-rail .home-recommend-book')];
  assert.deepEqual(cards.map(card=>card.querySelector('.bt').textContent),[
    'The Adventure of the Speckled Band','A Scandal in Bohemia','The Red-Headed League','The Final Problem','The Hound of the Baskervilles',
    "Alice's Adventures in Wonderland",'The Great Gatsby',
  ]);
  assert.equal(cards.some(card=>card.dataset.classicId==='odyssey'),false);
  assert.equal(c.classicForMeta({classicId:'odyssey',title:'The Odyssey',author:'Homer'}),null);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-odyssey"]'));
  assert.equal(cards[0].querySelector('.author').textContent,'Arthur Conan Doyle');
  assert.equal(cards[0].querySelector('.author').textContent.includes('SHERLOCK'),false);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-holmes"]'));
  assert.equal(document.querySelectorAll('#shelf [data-home-key^="longread:"]').length,0);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-other"]'));
  cards[0].click();
  assert.deepEqual(opened,['sherlock-holmes-speckled-band']);
  const classic=cards.find(card=>card.dataset.classicId==='the-great-gatsby');
  classic.click();
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(opened.at(-1),'imported-the-great-gatsby');
  c.setHomeRecommendKind('articles');
  assert.equal(document.querySelectorAll('#casual-rail .home-recommend-book').length,0);
  assert.equal(document.querySelectorAll('#casual-rail .rss-card').length,1);
  assert.ok(document.querySelector('#shelf [data-book-id="saved-holmes"]'));
  assert.equal(document.querySelectorAll('#shelf [data-home-key^="longread:"]').length,0);
  assert.equal(rss.length,1);
});
