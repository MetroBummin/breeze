/* One 내 책 row per web novel, and the reader chapter list in the page sidebar.
   The migration runs without a browser. The sidebar uses the real navigation
   script against a small document so a chapter tap cannot create a second row. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=name=>readFileSync(root+name,'utf8');

function migrationEnv(){
  const stored=new Map();
  const puts=[];
  const deleted=[];
  const store={};
  const positions={};
  const localReadTimes={};
  const context={
    console,Set,Map,URL,books:[],positions,localReadTimes,stored,puts,deleted,store,
    LS_POS:'breeze.pos',HOME_RESUME_KEY:'breeze.home-resume.v1',LOCAL_READ_KEY:'breeze.local-read.v1',
    WEBNOVEL_PROGRESS_KEY:'breeze.webnovel-progress.v1',
    load(key,fallback){return Object.prototype.hasOwnProperty.call(store,key)?store[key]:fallback;},
    save(key,value){store[key]=value;return true;},
    posOf(id){return positions[id]||{p:0,t:0};},
    localReadAt(id){return Number(localReadTimes[id])||0;},
    webNovelProgress(){
      const value=store[context.WEBNOVEL_PROGRESS_KEY];
      return value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    },
    async bookPut(book){puts.push(book.id);stored.set(book.id,{...book,paras:[...book.paras]});},
    async bookDel(id){deleted.push(id);stored.delete(id);},
    async imgDel(){},
  };
  vm.createContext(context);
  vm.runInContext(read('scripts/library/longreads.js'),context,{filename:'longreads.js'});
  return context;
}
function chapterBook(novelId,n,when,progress){
  return {
    id:`webnovel:${novelId}:${n}`,title:novelId,webNovelChapter:n,paras:[`${novelId} ${n}`],
    cover:`webnovel:${novelId}:${n}|cover`,addedAt:when,
  };
}

test('duplicate per-chapter web novel rows collapse to the latest position',async()=>{
  const env=migrationEnv();
  const older=chapterBook('cinnamon-bun',1,1,0);
  const newer=chapterBook('cinnamon-bun',2,2,0);
  const notes={id:'notes',title:'Notes',kind:'txt',paras:['keep me']};
  env.books=[older,newer,notes];
  env.positions[older.id]={p:.4,t:10,y:20};
  env.positions[newer.id]={p:.15,t:80,y:4};
  env.localReadTimes[older.id]=10;
  env.localReadTimes[newer.id]=90;
  env.save(env.HOME_RESUME_KEY,older.id);
  env.save(env.WEBNOVEL_PROGRESS_KEY,{'cinnamon-bun':1});
  await env.migrateWebNovelEntries();
  assert.deepEqual(env.books.map(book=>book.id),['webnovel:cinnamon-bun','notes']);
  const novel=env.books[0];
  assert.equal(novel.webNovelId,'cinnamon-bun');
  assert.equal(novel.webNovelChapter,2);
  assert.equal(novel.longReadId,'webnovel:cinnamon-bun');
  assert.deepEqual(novel.paras,['cinnamon-bun 2']);
  assert.equal(env.positions['webnovel:cinnamon-bun'].p,.15);
  assert.equal(env.positions[older.id],undefined);
  assert.equal(env.positions[newer.id],undefined);
  assert.equal(env.localReadTimes['webnovel:cinnamon-bun'],90);
  assert.equal(env.load(env.HOME_RESUME_KEY),'webnovel:cinnamon-bun');
  assert.equal(env.load(env.WEBNOVEL_PROGRESS_KEY)['cinnamon-bun'],2);
  assert.equal(env.stored.has(older.id),false);
  assert.equal(env.stored.has(newer.id),false);
  assert.equal(env.stored.get('webnovel:cinnamon-bun').webNovelChapter,2);
  assert.equal(env.books.some(book=>book.id==='notes'),true);
});

test('an older chapter wins when it was read more recently than a later chapter',async()=>{
  const env=migrationEnv();
  const first=chapterBook('cinnamon-bun',1,1,0);
  const second=chapterBook('cinnamon-bun',2,2,0);
  env.books=[first,second];
  env.positions[first.id]={p:.55,t:200};
  env.positions[second.id]={p:0,t:20};
  await env.migrateWebNovelEntries();
  assert.equal(env.books.length,1);
  assert.equal(env.books[0].id,'webnovel:cinnamon-bun');
  assert.equal(env.books[0].webNovelChapter,1);
  assert.deepEqual(env.books[0].paras,['cinnamon-bun 1']);
  assert.equal(env.positions['webnovel:cinnamon-bun'].p,.55);
});

test('a single legacy chapter id becomes the novel id and a stable row is left alone',async()=>{
  const env=migrationEnv();
  const legacy=chapterBook('mr-penn',4,4,0);
  env.books=[legacy];
  env.positions[legacy.id]={p:.25,t:7};
  await env.migrateWebNovelEntries();
  assert.equal(env.books[0].id,'webnovel:mr-penn');
  assert.equal(env.books[0].webNovelChapter,4);
  assert.equal(env.positions['webnovel:mr-penn'].p,.25);
  env.puts.length=0;
  env.books=[{
    id:'webnovel:chasing-sunlight',webNovelId:'chasing-sunlight',longReadId:'webnovel:chasing-sunlight',
    webNovelChapter:3,paras:['kept'],
  }];
  await env.migrateWebNovelEntries();
  assert.equal(env.puts.length,0);
  assert.deepEqual(env.books[0].paras,['kept']);
});

test('different novels stay separate when their chapter rows are merged',async()=>{
  const env=migrationEnv();
  env.books=[chapterBook('cinnamon-bun',1,1,0),chapterBook('mr-penn',2,2,0)];
  env.positions['webnovel:cinnamon-bun:1']={p:.1,t:5};
  env.positions['webnovel:mr-penn:2']={p:.3,t:6};
  await env.migrateWebNovelEntries();
  assert.deepEqual(env.books.map(book=>book.id).sort(),['webnovel:cinnamon-bun','webnovel:mr-penn']);
  assert.equal(env.books.find(book=>book.webNovelId==='mr-penn').webNovelChapter,2);
});

function sidebarEnv(){
  const env=migrationEnv();
  const {window,document}=parseHTML(`<!doctype html><html><body>
    <div id="pdf-page-control" hidden>
      <button id="pdf-page-button" type="button" hidden></button>
      <section id="pdf-page-navigation" hidden>
        <button id="pdf-bookmarks-only" type="button"></button>
        <button id="pdf-navigation-toggle" type="button"></button>
        <div id="pdf-thumbnail-strip" aria-label="페이지 썸네일"></div>
      </section>
    </div>
    <div id="aa-pdf-direction" hidden></div>
  </body></html>`);
  Object.assign(env,{
    window,document,HTMLElement:window.HTMLElement,Element:window.Element,
    currentReaderMode:'text',curBook:null,originalSession:null,studyPrefs:{direction:'vertical'},
    currentPdfSession(){return false;},
    readerPositionPending(){return false;},
    closePanel(){},closeSentence(){},closeAa(){},expandReaderChrome(){},pinReaderChrome(){},
    matchMedia(){return {matches:true};},
    getComputedStyle(){return {opacity:'1',transform:'none'};},
    DOMMatrixReadOnly:class{constructor(){this.m41=0;}},
    setTimeout,clearTimeout,
  });
  vm.runInContext(read('scripts/reader/pdf-navigation.js'),env,{filename:'pdf-navigation.js'});
  return {env,document};
}

test('the page sidebar lists a web novel’s chapters and keeps one library entry',()=>{
  const {env,document}=sidebarEnv();
  const button=document.getElementById('pdf-page-button');
  env.curBook={id:'notes',kind:'txt',title:'Notes'};
  env.updatePdfNavigationControls();
  assert.equal(button.hidden,true,'Ordinary text does not take the page button');
  env.curBook={id:'webnovel:cinnamon-bun',kind:'txt',title:'Cinnamon Bun',webNovelId:'cinnamon-bun',webNovelChapter:2};
  env.updatePdfNavigationControls();
  assert.equal(button.hidden,false);
  assert.equal(button.getAttribute('aria-label'),'2화, 회차');
  assert.equal(document.getElementById('pdf-bookmarks-only').hidden,true);
  assert.equal(document.getElementById('pdf-page-navigation').getAttribute('aria-label'),'회차');
  const opened=[];
  env.openWebNovelChapter=(work,chapter)=>{opened.push([work.id,chapter.n]);};
  env.togglePdfNavigation();
  assert.equal(button.getAttribute('aria-expanded'),'true');
  assert.deepEqual([...document.querySelectorAll('.pdf-thumbnail-jump')].map(node=>node.textContent),
    ['1화','2화','3화','4화','5화','6화','7화','8화','9화','10화']);
  assert.equal(document.querySelector('.pdf-thumbnail-jump[aria-current="true"]').textContent,'2화');
  document.querySelector('[data-webnovel-chapter="2"]').onclick();
  assert.deepEqual(opened,[],'The current chapter does not open a second copy');
  assert.equal(button.getAttribute('aria-expanded'),'false');
  assert.equal(document.getElementById('pdf-page-navigation').hidden,true);
  env.togglePdfNavigation();
  document.querySelector('[data-webnovel-chapter="4"]').onclick();
  assert.deepEqual(opened,[['cinnamon-bun',4]]);
  assert.equal(env.books.filter(book=>String(book.id).startsWith('webnovel:')).length,0,'The sidebar itself does not insert a library row');
});
