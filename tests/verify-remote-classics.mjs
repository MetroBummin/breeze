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
  assert.deepEqual(catalog.books.map(book=>book.id),[
    'pride-and-prejudice','alice-in-wonderland','the-great-gatsby','backroom-homeward-bound',
    'sherlock-holmes-a-study-in-scarlet','sherlock-holmes-the-sign-of-the-four','sherlock-holmes-the-valley-of-fear',
  ]);
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

const blueCarbuncle={
  id:'sherlock-holmes-blue-carbuncle',
  title:'The Adventure of the Blue Carbuncle',
  author:'Arthur Conan Doyle',
  cover:'https://cdn.example/classics/sherlock-holmes-blue-carbuncle/cover.webp',
  coverPosition:'center top',
  bytes:120,
  content:'https://cdn.example/classics/sherlock-holmes-blue-carbuncle/book.txt',
  contentVersion:'cd'.repeat(32),
  wordCount:40,
  sourceUrl:'https://www.gutenberg.org/ebooks/1661',
  site:'Project Gutenberg',
  license:'Original: public domain in the USA',
  licenseUrl:'https://www.gutenberg.org/ebooks/1661',
  originalTitle:'The Adventure of the Blue Carbuncle (1892)',
  series:'SHERLOCK HOLMES · LIGHTLY MODERNIZED',
  presentation:'story',
  hook:'크리스마스 아침, 길에서 주운 낡은 모자 하나와 거위 한 마리.',
  edition:'Lightly modernized English edition',
  sections:[
    {paragraph:2, text:'II.', role:'section'},
    {paragraph:4, text:'Chapter 2. The Goose', role:'chapter'},
    {paragraph:0, text:'Not the real opening', role:'title'},
  ],
  illustrations:[
    {
      id:'blue-carbuncle-01',
      before:'“You are engaged,” said I; “perhaps I interrupt you.”',
      after:'I had called upon my friend Sherlock Holmes upon the second morning after Christmas, with the',
      paragraph:1,
      file:'https://cdn.example/classics/sherlock-holmes-blue-carbuncle/illustrations/blue-carbuncle-01.webp',
      alt:'A battered felt hat hangs on a chair beside Holmes',
      width:1400,
      height:700,
    },
    {id:'blue-carbuncle-01', before:'duplicate', after:'duplicate', paragraph:2, file:'https://cdn.example/dup.webp', alt:'dup', width:10, height:10},
    {id:'broken', before:'x', after:'y', paragraph:1, file:'http://insecure.example/a.webp', alt:'no', width:10, height:10},
    {id:'short', before:'x', after:'y', paragraph:0, file:'https://cdn.example/a.webp', alt:'no', width:10, height:10},
  ],
};
const blueParagraphs=[
  'I had called upon my friend Sherlock Holmes upon the second morning after Christmas, with the intention of wishing him the compliments of the season.',
  '“You are engaged,” said I; “perhaps I interrupt you.”',
  'II.',
  'Holmes waved me toward the chair beside the fire.',
  'Chapter 2. The Goose',
  'The salesman opened his ledger under the market lamp.',
];

test('a remote Holmes entry keeps illustrations, Holmes style, and exact section headings',async()=>{
  const {context}=harness(async()=>new Response(JSON.stringify({version:1,books:[blueCarbuncle]}),{status:200,headers:{'content-type':'application/json'}}));
  const loaded=await context.refreshRemoteClassics();
  const read=loaded.find(item=>item.id==='sherlock-holmes-blue-carbuncle');
  assert.equal(read.remote,true);
  assert.equal(read.style,'holmes');
  assert.equal(read.presentation,'story');
  assert.equal(read.series,'SHERLOCK HOLMES · LIGHTLY MODERNIZED');
  assert.equal(read.hook,'크리스마스 아침, 길에서 주운 낡은 모자 하나와 거위 한 마리.');
  assert.equal(read.illustrations.length,1);
  assert.equal(read.illustrations[0].id,'blue-carbuncle-01');
  assert.equal(read.illustrations[0].width,1400);
  assert.deepEqual([...read.sections.map(section=>section.role)],['section','chapter','title']);
  const book={id:'saved-blue',longReadId:read.id,title:read.title,author:read.author,paras:blueParagraphs,illustrations:read.illustrations,sections:read.sections};
  assert.equal(context.longReadHolmesDefinition(book).id,read.id);
  assert.equal(context.longReadIllustrationBefore(book,blueParagraphs[1],1).id,'blue-carbuncle-01');
  assert.equal(context.longReadIllustrationBefore(book,blueParagraphs[1],2),null);
  const edited={...book,paras:blueParagraphs.slice()};
  edited.paras[0]='User edited this passage.';
  assert.equal(context.longReadIllustrationBefore(edited,edited.paras[1],1),null);
  assert.equal(context.longReadBlockRole(book,{f:2,t:'II.'}),'section');
  assert.equal(context.longReadBlockRole(book,{f:4,t:'Chapter 2. The Goose'}),'chapter');
  assert.equal(context.longReadBlockRole(book,{f:4,t:'User edited this chapter'}),'');
  assert.equal(context.longReadSourceTitleActive({...book,title:'Other title'},{...read,sourceTitle:true}),false);
  const titled={...read,sourceTitle:true,sections:[{paragraph:0,text:blueParagraphs[0],role:'title'}]};
  assert.equal(context.longReadSourceTitleActive(book,titled),true);
  assert.equal(JSON.stringify(book.paras),JSON.stringify(blueParagraphs));
});

test('remote scene files are stored with the saved book for offline reading',async()=>{
  const blobs=[];
  const {context}=harness(async()=>new Response(Uint8Array.from([1,2,3]),{status:200,headers:{'content-type':'image/webp'}}));
  context.imgPut=async(key,blob)=>{blobs.push([key,blob.type,blob.size]);};
  const book={id:'saved-blue',longReadId:'sherlock-holmes-blue-carbuncle'};
  context.books.push(book);
  const stored=await context.cacheLongReadIllustrations({
    remote:true,
    illustrations:[{id:'blue-carbuncle-01',file:'https://cdn.example/blue-carbuncle-01.webp'}],
  },book);
  assert.equal(stored,1);
  assert.deepEqual(blobs,[['saved-blue|scene|blue-carbuncle-01','image/webp',3]]);
  context.books.length=0;
  const skipped=await context.cacheLongReadIllustrations({
    illustrations:[{id:'blue-carbuncle-02',file:'https://cdn.example/blue-carbuncle-02.webp'}],
  },book);
  assert.equal(skipped,0);
  assert.equal(blobs.length,1);
});

test('a dormant bundled book is offered from the remote catalog without replacing its local text',async()=>{
  const saved={id:'saved-backrooms',longReadId:'backroom-homeward-bound',paras:['My saved text'],cover:'custom-cover'};
  const before=JSON.stringify(saved);
  let failed=false;
  const {context,store}=harness(async()=>{
    if(failed)throw new Error('offline');
    return new Response(JSON.stringify({version:1,books:[
      {id:'backroom-homeward-bound',title:'Backroom - Homeward Bound',author:'DivineAtlas',
        content:'https://cdn.example/backrooms/book.txt',contentVersion:'ab'.repeat(32),
        cover:'https://cdn.example/backrooms/cover.png'},
      {id:'sherlock-holmes-speckled-band',title:'Duplicate',author:'Nobody',
        content:'https://cdn.example/no.txt',contentVersion:'cd'.repeat(32)},
      {id:'backroom-homeward-bound'},
    ]}),{status:200,headers:{'content-type':'application/json'}});
  });
  context.books.push(saved);
  const loaded=await context.refreshRemoteClassics();
  assert.deepEqual([...loaded.map(read=>read.id)],['backroom-homeward-bound']);
  const offer=loaded[0];
  assert.equal(offer.surfacedDormant,true);
  assert.equal(offer.remote,false);
  assert.equal(offer.dormant,false);
  assert.equal(offer.file,'assets/longreads/homewardbound.txt');
  assert.equal(offer.cover,'assets/longreads/covers/backroom-homeward-bound.png');
  assert.equal(offer.series,'BACKROOMS TALE SERIES');
  assert.equal(new Script("LONG_READS.find(read=>read.id==='backroom-homeward-bound').dormant").runInNewContext(context),true);
  assert.equal(context.pendingLongReads().some(read=>read.id==='backroom-homeward-bound'),false);
  assert.equal(context.classicCatalogOffers().some(read=>read.id==='backroom-homeward-bound'&&read.file==='assets/longreads/homewardbound.txt'),true);
  assert.equal(JSON.stringify(saved),before);
  const paras=['I sat stunned as the police arrived.'];
  assert.equal(context.longReadIllustrationBefore({longReadId:'backroom-homeward-bound',paras},paras[0],0).file.endsWith('homeward-01-police-search.jpg'),true);
  failed=true;
  const cached=await context.refreshRemoteClassics();
  assert.equal(cached[0].file,'assets/longreads/homewardbound.txt');
  assert.equal(store.has('breeze.remote-classics'),true);
});

test('the novels publish chapter headings as sections for the opening composer',async()=>{
  const catalog=JSON.parse(text('server/classics/catalog.json'));
  const paragraphs=file=>text('server/classics/'+file+'/book.txt').replace(/\r/g,'').trim().split(/\n\s*\n+/);
  const pp=catalog.books.find(book=>book.id==='pride-and-prejudice');
  const ppText=paragraphs('pride-and-prejudice');
  assert.equal(pp.sections.length,61);
  assert.deepEqual(pp.sections.map(section=>section.role),Array.from({length:61},()=>'chapter'));
  assert.equal(pp.sections.every(section=>ppText[section.paragraph]===section.text&&section.text===`Chapter ${pp.sections.indexOf(section)+1}`),true);
  assert.equal(ppText[1].startsWith('It is a truth universally acknowledged'),true);
  const alice=catalog.books.find(book=>book.id==='alice-in-wonderland');
  const aliceText=paragraphs('alice-in-wonderland');
  assert.equal(alice.sections.filter(section=>section.role==='chapter').length,12);
  assert.equal(alice.sections.at(-1).role,'end');
  assert.equal(alice.sections.every(section=>aliceText[section.paragraph]===section.text),true);
  const gatsby=catalog.books.find(book=>book.id==='the-great-gatsby');
  const gatsbyText=paragraphs('the-great-gatsby');
  assert.deepEqual(gatsby.sections.slice(0,8).map(section=>section.role),['inscription','inscription','inscription','verse','verse','verse','verse','signature']);
  assert.equal(gatsby.sections.filter(section=>section.role==='chapter').length,9);
  assert.equal(gatsby.sections.every(section=>gatsbyText[section.paragraph]===section.text),true);
  const opening={};
  new Script(text('scripts/reader/book-opening.js')).runInNewContext(opening);
  const blocks=gatsby.sections.slice(0,9).map(section=>({bookRole:section.role,t:section.text,f:section.paragraph}));
  opening.composeBookOpening(blocks);
  assert.deepEqual(blocks.slice(0,3).map(block=>block.openingDedication),[true,true,true]);
  assert.equal(blocks[3].before,'page');
  assert.equal(blocks[7].openingAttribution,true);
  assert.equal(blocks[8].bookRole,'chapter');
  assert.equal(blocks[8].openingDedication,undefined);
  const {context}=harness(async()=>new Response(JSON.stringify({version:1,books:[{
    id:'sample-novel',title:'Sample Novel',author:'A Writer',
    content:'https://cdn.example/sample-novel/book.txt',contentVersion:'ab'.repeat(32),
    headings:[{paragraph:0,text:'Part I',role:'heading'},{paragraph:4,text:'Chapter 1',role:'chapter'}],
  }]}),{status:200,headers:{'content-type':'application/json'}}));
  const loaded=await context.refreshRemoteClassics();
  assert.deepEqual([...loaded[0].sections.map(section=>section.role)],['section','chapter']);
  const book={id:'saved-novel',longReadId:'sample-novel',kind:'txt',readingStyle:'original',title:'Sample Novel',author:'A Writer',paras:['Part I','Opening.','More.','Still.','Chapter 1'],sections:loaded[0].sections};
  assert.equal(context.longReadBlockRole(book,{f:0,t:'Part I'}),'section');
  assert.equal(context.longReadBlockRole(book,{f:4,t:'Chapter 1'}),'chapter');
});

test('Backrooms in the repo catalog matches the bundled text and the upload plan',async()=>{
  const catalog=JSON.parse(text('server/classics/catalog.json'));
  const entry=catalog.books.find(book=>book.id==='backroom-homeward-bound');
  const bundled=read('assets/longreads/homewardbound.txt');
  const cover=read('assets/longreads/covers/backroom-homeward-bound.png');
  assert.equal(entry.bytes,bundled.length);
  assert.equal(entry.contentVersion,createHash('sha256').update(bundled).digest('hex'));
  assert.equal(read('server/classics/backroom-homeward-bound/book.txt').equals(bundled),true);
  assert.equal(read('server/classics/backroom-homeward-bound/cover.png').equals(cover),true);
  const {classicUploadPlan}=await import('../server/classics/upload.mjs');
  const plan=classicUploadPlan(catalog).map(object=>object.path);
  assert.deepEqual(plan.slice(0,9),[
    'catalog.json',
    'pride-and-prejudice/book.txt','pride-and-prejudice/cover.webp',
    'alice-in-wonderland/book.txt','alice-in-wonderland/cover.webp',
    'the-great-gatsby/book.txt','the-great-gatsby/cover.webp',
    'backroom-homeward-bound/book.txt','backroom-homeward-bound/cover.png',
  ]);
  const novelPaths=[];
  for(const id of ['sherlock-holmes-a-study-in-scarlet','sherlock-holmes-the-sign-of-the-four','sherlock-holmes-the-valley-of-fear']){
    const entry=catalog.books.find(book=>book.id===id);
    novelPaths.push(`${id}/book.txt`,`${id}/cover-framed.webp`);
    for(const image of entry.illustrations)novelPaths.push(`${id}/illustrations/${image.id}.webp`);
  }
  assert.deepEqual(plan.slice(9),novelPaths);
  const illustrated=classicUploadPlan({books:[{
    id:'sherlock-holmes-blue-carbuncle',
    content:'https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/sherlock-holmes-blue-carbuncle/book.txt',
    cover:'https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/sherlock-holmes-blue-carbuncle/cover.webp',
    illustrations:[{file:'https://hrtfhojbhqvaoiulspto.supabase.co/storage/v1/object/public/classics/sherlock-holmes-blue-carbuncle/illustrations/blue-carbuncle-01.webp'}],
  }]});
  assert.deepEqual(illustrated.map(object=>object.path),[
    'catalog.json',
    'sherlock-holmes-blue-carbuncle/book.txt',
    'sherlock-holmes-blue-carbuncle/cover.webp',
    'sherlock-holmes-blue-carbuncle/illustrations/blue-carbuncle-01.webp',
  ]);
  assert.throws(()=>classicUploadPlan({books:[{id:'x',content:'https://example.supabase.co/storage/v1/object/public/classics/x/book.txt'}]}),/outside/);
});

test('the three Holmes novels are remote illustrated books with opening sections',()=>{
  const catalog=JSON.parse(text('server/classics/catalog.json'));
  const expected=[
    ['sherlock-holmes-a-study-in-scarlet','A Study in Scarlet',43423,'런던의 빈집에서 피 묻은 단어 하나만 남은 밤. 실험실에서 처음 만난 홈즈는, 이 살인에서 무엇을 읽어 낼까?',14],
    ['sherlock-holmes-the-sign-of-the-four','The Sign of the Four',43099,'안개 낀 밤, 진주 한 알과 함께 도착한 편지. 여섯 해를 기다린 메리 모스턴은 그 보물을 찾을 수 있을까?',12],
    ['sherlock-holmes-the-valley-of-fear','The Valley of Fear',57608,'아침 식탁 위의 암호 한 장, 그리고 해자 저택의 죽음. 모리아티의 그림자는 이 사건과 어떻게 이어질까?',15],
  ];
  for(const [id,title,words,hook,chapters] of expected){
    const entry=catalog.books.find(book=>book.id===id);
    const file=read(`server/classics/${id}/book.txt`);
    const cover=read(`server/classics/${id}/cover-framed.webp`);
    assert.equal(entry.cover.endsWith(`/classics/${id}/cover-framed.webp`),true);
    const paragraphs=file.toString('utf8').trim().split(/\n\s*\n+/);
    assert.equal(entry.title,title);
    assert.equal(entry.author,'Arthur Conan Doyle');
    assert.equal(entry.series,'SHERLOCK HOLMES · LIGHTLY MODERNIZED');
    assert.equal(entry.presentation,'story');
    assert.equal(entry.sourceTitle,true);
    assert.equal(entry.hook,hook);
    assert.equal(entry.bytes,file.length);
    assert.equal(entry.wordCount,words);
    assert.equal(paragraphs.join(' ').split(/\s+/).length,words);
    assert.equal(entry.contentVersion,createHash('sha256').update(file).digest('hex'));
    assert.equal(entry.sections.every(section=>paragraphs[section.paragraph]===section.text),true);
    assert.equal(entry.sections.filter(section=>section.role==='chapter').length,chapters);
    assert.equal(entry.sections.some(section=>section.role==='title'),true);
    assert.equal(entry.illustrations.length,9);
    assert.deepEqual(webpSize(cover),{width:768,height:1152});
    assert.doesNotMatch(file.toString('utf8'),/Project Gutenberg|\[Illustration|_/);
    assert.doesNotMatch(file.toString('utf8'),/\b(to-day|to-night|to-morrow|ejaculated|\bwhence\b)\b/i);
    for(const image of entry.illustrations){
      const scene=read(`server/classics/${id}/illustrations/${image.id}.webp`);
      assert.deepEqual(webpSize(scene),{width:1400,height:700});
      assert.equal(image.file.endsWith(`/classics/${id}/illustrations/${image.id}.webp`),true);
      assert.equal(paragraphs[image.paragraph].startsWith(image.before),true);
      assert.equal(paragraphs[image.paragraph-1].startsWith(image.after),true);
    }
  }
  const sign=read('server/classics/sherlock-holmes-the-sign-of-the-four/book.txt').toString('utf8');
  assert.match(sign,/incommodes que ceux qui ont de l’esprit/);
  const valley=read('server/classics/sherlock-holmes-the-valley-of-fear/book.txt').toString('utf8');
  assert.match(valley,/534 C2 13 127 36 31 4 17 21 41 DOUGLAS/);
});

test('the upload script stays a dry run and refuses any other Supabase project',()=>{
  const plan=spawnSync(process.execPath,['server/classics/upload.mjs'],{cwd:root,encoding:'utf8'});
  assert.equal(plan.status,0,plan.stderr);
  assert.match(plan.stdout,/dry-run/);
  assert.match(plan.stdout,/hrtfhojbhqvaoiulspto/);
  assert.match(plan.stdout,/alice-in-wonderland\/book\.txt/);
  assert.match(plan.stdout,/the-great-gatsby\/cover\.webp/);
  assert.match(plan.stdout,/sherlock-holmes-a-study-in-scarlet\/illustrations\/scarlet-01\.webp/);
  assert.match(plan.stdout,/sherlock-holmes-the-valley-of-fear\/book\.txt/);
  assert.doesNotMatch(plan.stdout,/SERVICE_ROLE_KEY=/);
  const wrong=spawnSync(process.execPath,['server/classics/upload.mjs','--apply'],{
    cwd:root,encoding:'utf8',env:{...process.env,SUPABASE_URL:'https://example.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'secret'},
  });
  assert.equal(wrong.status,1);
  assert.match(wrong.stderr,/Refusing/);
  assert.doesNotMatch(wrong.stderr,/secret/);
});
