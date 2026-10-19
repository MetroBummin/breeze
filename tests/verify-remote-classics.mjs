import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Script} from 'node:vm';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const text=name=>read(name).toString();

function webpSize(buf){
  assert.equal(buf.toString('ascii',0,4),'RIFF');
  assert.equal(buf.toString('ascii',8,12),'WEBP');
  assert.equal(buf.toString('ascii',12,16),'VP8 ');
  assert.equal(buf[23],0x9d);
  return {width:buf.readUInt16LE(26)&0x3fff, height:buf.readUInt16LE(28)&0x3fff};
}

test('Pride and Prejudice payload matches the catalog and stays out of the app bundle',()=>{
  const book=read('server/classics/pride-and-prejudice/book.txt');
  const cover=read('server/classics/pride-and-prejudice/cover.webp');
  const catalog=JSON.parse(text('server/classics/catalog.json'));
  const entry=catalog.books[0];
  assert.equal(catalog.version,1);
  assert.deepEqual(catalog.books.map(book=>book.id),['pride-and-prejudice','alice-in-wonderland','the-great-gatsby']);
  assert.equal(entry.id,'pride-and-prejudice');
  assert.equal(entry.hook,'첫 만남부터 오만하게 구는 부자 신사 다아시, 그런 그를 단번에 싫어하게 된 엘리자베스. 첫인상과 편견을 넘어, 두 사람은 서로를 제대로 보게 될까?');
  assert.equal(entry.title,'Pride and Prejudice');
  assert.equal(entry.author,'Jane Austen');
  assert.equal(entry.bytes,book.length);
  assert.equal(entry.contentVersion,createHash('sha256').update(book).digest('hex'));
  assert.equal(entry.cover.endsWith('/classics/pride-and-prejudice/cover.webp'),true);
  assert.equal(entry.content.endsWith('/classics/pride-and-prejudice/book.txt'),true);
  assert.match(entry.sourceUrl,/gutenberg\.org\/ebooks\/1342$/);
  const paragraphs=book.toString('utf8').trim().split('\n\n');
  assert.deepEqual(paragraphs.filter(paragraph=>/^Chapter \d+$/.test(paragraph)),
    Array.from({length:61},(_,index)=>`Chapter ${index+1}`));
  assert.equal(paragraphs[1].startsWith('It is a truth universally acknowledged'),true);
  assert.equal(paragraphs.at(-1).endsWith('uniting them.'),true);
  assert.equal(paragraphs.join(' ').split(/\s+/).length,entry.wordCount);
  assert.doesNotMatch(book.toString('utf8'),/\[Illustration|Project Gutenberg|Chiswick Press|Hugh Thomson|--|RIGHT “/);
  assert.match(book.toString('utf8'),/—/);
  assert.equal(entry.series,'BREEZE ORIGINAL');
  assert.deepEqual(webpSize(cover),{width:768,height:1152});
  assert.equal(cover.length,166570);
  assert.doesNotMatch(text('scripts/library/longreads.js'),/pride-and-prejudice/);
  assert.doesNotMatch(text('tools/build-www.mjs'),/server\/classics/);
  assert.doesNotMatch(text('scripts/main.js'),/homeReady\.then\(\(\)=>\{if\(typeof refreshRemoteClassics/);
  assert.match(text('scripts/main.js'),/homeRecommendKind\(\)==='books'&&typeof refreshRemoteClassics==='function'/);
  assert.match(text('scripts/library/library.js'),/next==='books'&&typeof refreshRemoteClassics==='function'/);
  assert.match(text('scripts/core/state.js'),/v==='longform'\)\{[\s\S]*refreshRemoteClassics/);
});

function harness(fetchImpl){
  const store=new Map();
  const context={
    console,Set,URL,books:[],navigator:{onLine:true},SB_KEY:'anon-test',
    crypto,TextEncoder,TextDecoder,Uint8Array,AbortController,setTimeout,clearTimeout,File,Response,
    window:{BREEZE_CONFIG:{},addEventListener(){}},
    fetch:fetchImpl,
    load:(key,fallback)=>store.has(key)?store.get(key):fallback,
    save(key,value){store.set(key,value);return true;},
    renderAllBookViews(){context.renders++;},
    renders:0,
    imported:[],
    toast(message){context.toast=message;},
    importFile:async file=>{
      context.imported.push(await file.text());
      const book={id:'saved-book',longReadId:'pride-and-prejudice'};
      context.books.unshift(book);
      return {bookId:book.id};
    },
    imgPut:async()=>{},bookPut:async()=>{},
  };
  new Script(text('scripts/library/longreads.js')).runInNewContext(context);
  new Script(text('scripts/library/remote-classics.js')).runInNewContext(context);
  return {context,store};
}

const sample={
  version:1,
  books:[{
    id:'pride-and-prejudice', title:'Pride and Prejudice', author:'Jane Austen',
    cover:'https://cdn.example/cover.webp', bytes:12,
    content:'https://cdn.example/book.txt', contentVersion:'ab'.repeat(32),
    wordCount:3, sourceUrl:'https://www.gutenberg.org/ebooks/1342',
    site:'Project Gutenberg', license:'Original: public domain in the USA',
    hook:'첫인상', edition:'Project Gutenberg text',
  },{
    id:'sherlock-holmes-speckled-band', title:'Duplicate', author:'Nobody',
    content:'https://cdn.example/no.txt', contentVersion:'cd'.repeat(32),
  },{
    id:'not a slug', title:'Bad', author:'Bad', content:'http://insecure.example/a.txt', contentVersion:'ee'.repeat(32),
  }],
};

test('the catalog merges valid books, skips bundled ids, and survives a failed refresh',async()=>{
  let body=JSON.stringify(sample),failed=false;
  const {context,store}=harness(async()=>{
    if(failed)throw new Error('offline');
    return new Response(body,{status:200,headers:{'content-type':'application/json'}});
  });
  const loaded=await context.refreshRemoteClassics();
  assert.equal(Array.from(loaded,read=>read.id).join(),'pride-and-prejudice');
  assert.equal(loaded[0].file,'https://cdn.example/book.txt');
  assert.equal(loaded[0].sha256,'ab'.repeat(32));
  assert.equal(loaded[0].remote,true);
  assert.equal(context.pendingLongReads().length,5);
  failed=true;
  const again=await context.refreshRemoteClassics();
  assert.equal(Array.from(again,read=>read.id).join(),'pride-and-prejudice');
  assert.equal(store.has('breeze.remote-classics'),true);
  store.delete('breeze.remote-classics');
  const cold=await context.refreshRemoteClassics();
  assert.equal(cold.length,0,'A failed fetch with no cache does not invent books');
});

test('an offline remote book is greyed out until it is on the device',async()=>{
  const {context}=harness(async()=>new Response(JSON.stringify(sample),{status:200,headers:{'content-type':'application/json'}}));
  await context.refreshRemoteClassics();
  const read=context.remoteClassicCatalogReads()[0];
  context.navigator.onLine=false;
  assert.equal(context.remoteClassicOffline(read),true);
  context.books.push({longReadId:read.id});
  assert.equal(context.remoteClassicOffline(read),false);
  assert.equal(context.remoteClassicOffers().length,0);
  context.books.length=0;
  context.navigator.onLine=true;
  assert.equal(context.remoteClassicOffline(read),false);
});

test('읽기 시작 downloads once, reports progress, and rejects a changed file',async()=>{
  const novel=`Chapter 1\n\n${'It is a truth universally acknowledged. '.repeat(8)}\n`;
  const hash=createHash('sha256').update(novel).digest('hex');
  const progress=[];
  let calls=0;
  const bytes=new TextEncoder().encode(novel);
  const {context}=harness(async()=>{
    calls++;
    const mid=Math.floor(bytes.length/2);
    return new Response(new ReadableStream({start(controller){
      controller.enqueue(bytes.slice(0,mid));
      controller.enqueue(bytes.slice(mid));
      controller.close();
    }}),{status:200,headers:{'content-length':String(bytes.length)}});
  });
  const read={id:'pride-and-prejudice',remote:true,file:'https://cdn.example/book.txt',sha256:hash,title:'Pride and Prejudice',author:'Jane Austen',cover:''};
  const saved=await context.importLongRead(read,null,{bytes:novel.length,onProgress:ratio=>progress.push(ratio)});
  assert.equal(saved.id,'saved-book');
  assert.equal(calls,1);
  assert.equal(context.imported[0],novel);
  assert.ok(progress.some(ratio=>ratio>0&&ratio<1));
  assert.equal(progress.at(-1),1);
  context.books.length=0;
  const failed=await context.importLongRead({...read,sha256:'ff'.repeat(32)},null,{onProgress(){}});
  assert.equal(failed,null);
  assert.match(context.toast,/준비하지 못했어요/);
  assert.equal(context.imported.length,1);
});

test('Alice and Gatsby move to the catalog and a saved copy keeps its text',async()=>{
  const catalog=JSON.parse(text('server/classics/catalog.json'));
  const hooks={
    'alice-in-wonderland':'회중시계를 보며 "늦었다!"를 외치는 흰 토끼를 따라 굴속으로 떨어진 앨리스. 몸이 커졌다 작아졌다 하는 이상한 나라에서, 앨리스는 집으로 돌아갈 수 있을까?',
    'the-great-gatsby':'1922년 뉴욕 롱아일랜드. 매주 화려한 파티를 여는 수수께끼의 부자 개츠비는, 사실 만 건너편에 사는 옛사랑 데이지를 되찾으려고 모든 걸 걸었습니다. 그 사랑은 이루어질까요?',
  };
  for(const id of Object.keys(hooks)){
    const entry=catalog.books.find(book=>book.id===id);
    const file=read(`server/classics/${id}/book.txt`);
    assert.equal(entry.hook,hooks[id]);
    assert.equal(entry.presentation,'story');
    assert.equal(entry.bytes,file.length);
    assert.equal(entry.contentVersion,createHash('sha256').update(file).digest('hex'));
    assert.equal(entry.editionNote.length>0,true);
    assert.equal(file.equals(read(`assets/longreads/${id}.txt`)),true);
  }
  const paras=['Chapter I. Down the Rabbit-Hole','saved paragraph'];
  const position={p:.4,t:50,pi:1,mode:'text'};
  const {context}=harness(async()=>new Response(JSON.stringify(catalog),{status:200,headers:{'content-type':'application/json'}}));
  const book={id:'saved-alice',kind:'txt',longReadId:'alice-in-wonderland',title:"Alice's Adventures in Wonderland",author:'Lewis Carroll',paras};
  context.books.push(book);
  context.positions={'saved-alice':position};
  const before=JSON.stringify(book);
  await context.refreshRemoteClassics();
  const offer=context.classicCatalogOffers().find(read=>read.id==='alice-in-wonderland');
  assert.equal(offer.remote,true);
  assert.equal(offer.hook,hooks['alice-in-wonderland']);
  assert.equal(offer.presentation,'story');
  assert.equal(offer.file,catalog.books.find(item=>item.id==='alice-in-wonderland').content);
  assert.equal(JSON.stringify(book),before);
  assert.deepEqual(context.positions['saved-alice'],position);
  const owned=await context.importLongRead(offer);
  assert.equal(owned,book);
  assert.equal(context.imported.length,0,'A started book was downloaded again');
  assert.deepEqual(book.paras,paras);
  assert.deepEqual(context.positions['saved-alice'],position);
});

test('a failed catalog still offers the bundled Alice and Gatsby files',async()=>{
  const {context,store}=harness(async()=>{throw new Error('offline');});
  store.set('breeze.remote-classics',{at:1,books:[{
    id:'alice-in-wonderland',title:"Alice's Adventures in Wonderland",author:'Lewis Carroll',
    content:'https://cdn.example/alice.txt',contentVersion:'ab'.repeat(32),hook:'server hook',
  }]});
  await context.refreshRemoteClassics();
  context.navigator.onLine=false;
  const offline=context.classicCatalogOffers().find(read=>read.id==='alice-in-wonderland');
  assert.equal(offline.file,'assets/longreads/alice-in-wonderland.txt');
  assert.equal(offline.remote,undefined);
  const gatsby=context.classicCatalogOffers().find(read=>read.id==='the-great-gatsby');
  assert.equal(gatsby.file,'assets/longreads/the-great-gatsby.txt');
  context.navigator.onLine=true;
  const cached=context.classicCatalogOffers().find(read=>read.id==='alice-in-wonderland');
  assert.equal(cached.remote,true);
  assert.equal(cached.hook,'server hook');
  assert.equal(context.classicCatalogOffers().some(read=>read.id==='the-great-gatsby'&&read.fallback),true);
});

test('the upload script stays a dry run and refuses any other Supabase project',()=>{
  const plan=spawnSync(process.execPath,['server/classics/upload.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(plan.status,0,plan.stderr);
  assert.match(plan.stdout,/dry-run/);
  assert.match(plan.stdout,/hrtfhojbhqvaoiulspto/);
  assert.match(plan.stdout,/alice-in-wonderland\/book\.txt/);
  assert.match(plan.stdout,/the-great-gatsby\/cover\.webp/);
  assert.doesNotMatch(plan.stdout,/SERVICE_ROLE_KEY=/);
  const wrong=spawnSync(process.execPath,['server/classics/upload.mjs','--apply'],{
    cwd:root,encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},
  });
  assert.equal(wrong.status,1);
  assert.match(wrong.stderr,/Refusing/);
  assert.doesNotMatch(wrong.stderr,/secret/);
});
