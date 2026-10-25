import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});

let page;
try{
  page=await browser.newPage({viewport:{width:1100,height:800},serviceWorkers:'block'});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>{
    const href=route.request().url();
    return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'word-overlay.txt',mimeType:'text/plain',
    buffer:Buffer.from(('A patient reader keeps resilient words close to their context. Selfies are popular. Brownies are tasty. '+
      'Another patient reader checks every repeated word carefully. '+
      'The patient waited calmly for the doctor.\n\n').repeat(50))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20&&readerPositionRestoration===null);await page.evaluate(()=>document.fonts.ready);



  const pill=page.locator('#word-peek'),requests=[];
  let failures=0,responseGate=null,releaseResponse=null;
  await page.route(url+'functions/v1/dict',async route=>{
    const payload=route.request().postDataJSON();
    if(payload.op==='lookup_failure'){
      assert.equal(route.request().headers().authorization,'Bearer qa');
      assert.deepEqual(Object.keys(payload).sort(),['op','reason']);
      return route.fulfill({contentType:'application/json',body:JSON.stringify({ok:true})});
    }
    assert.equal(route.request().headers().authorization,'Bearer synthetic-qa-user');
    requests.push(payload);
    if(failures>0){failures--;return route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'lookup_failed'})});}
    if(responseGate)await responseGate;
    const canonical=({selfies:'selfie',brownies:'brownie'})[String(payload.clicked||'').toLowerCase()]||payload.word;
    const body=JSON.stringify({kind:'word',canonical,lemma:canonical,members:[payload.clickedIndex],ko:'참을성 있는',left:299,lookupId:payload.lookupId});
    try{return await route.fulfill({contentType:'application/json',body});}catch{return;}
  });
  await page.evaluate(async url=>{
    sbUser={id:'qa-user'};
    window.qaAuthSession={data:{session:{user:{id:'qa-user'},access_token:'synthetic-qa-user'}}};
    dictAuthCredential={userId:'qa-user',accessToken:'synthetic-qa-user'};
    sb={auth:{getSession:async()=>qaAuthSession,refreshSession:async()=>qaAuthSession}};SB_URL=url;SB_KEY='qa';
    await switchLearningAccount(sbUser.id);
    dictGet=async()=>null;fillDictionaryMetadata=async()=>{};
    const bounds=readerScroller().getBoundingClientRect();
    const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()==='patient'&&n.getBoundingClientRect().top>bounds.top+80&&n.getBoundingClientRect().bottom<bounds.bottom-80);
    if(!node)throw Error('Missing interior word-arrival fixture');
    const key=keyOf('patient');
    words[key]={word:'patient',clicked:'patient',forms:[key],ko:'',defs:[],kodict:[],example:sentenceOf(node),book:curBook.title,status:1,addedAt:1,up:1};
    const input=lookupRequestFor(words[key],node,true);contextView={key,...input,loading:'checking'};
    selectWord(key,node,true);window.qaNode=node;
    window.qaPromise=resolveCurrentLookup(key,input,wordLookupLife,node);
  },url);
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await page.evaluate(()=>captureLearningScope().id),'user:qa-user');
  assert.equal(requests.length,1);assert.equal(requests[0].op,'look_v2');
  assert.equal(await page.evaluate(()=>words[selKey].ko),'참을성 있는');
  assert.equal(await pill.evaluate(n=>n.classList.contains('result-accent')),false);
  const rect=await pill.boundingBox();
  await page.waitForTimeout(250);
  assert.equal(await pill.evaluate(n=>getComputedStyle(n,'::after').content),'none','arrival added a decorative overlay');
  assert.deepEqual(await pill.boundingBox(),rect,'accent moved the pill');
  // Under 750ms of continuous visibility remains unseen and can reveal again.
  // Protocol round trips above can exceed that interval on a slow WebKit runner.
  // Set the fixture's visibility age at the same turn that initiates the scroll.
  const scrollStart=await page.evaluate(()=>{
    window.qaArrivalScrollTrace=[];const nativeScroll=wordPeekUserScrolled,nativeClose=closePanel;
    const state=()=>({key:selKey,life:wordLookupLife,active:wordPeekActive,hadPending:wordPeekHadPending,presentation:wordPeekPresentation,age:wordPeekShownAt===null?null:performance.now()-wordPeekShownAt,visible:!!activeSelectedWordNode&&wordPeekTargetVisible(activeSelectedWordNode),connected:!!activeSelectedWordNode?.isConnected,scroll:readerScroller().scrollTop});
    wordPeekUserScrolled=function(...args){const before=state(),result=nativeScroll.apply(this,args);qaArrivalScrollTrace.push({kind:'scroll',args,before,after:state()});return result;};
    closePanel=function(...args){qaArrivalScrollTrace.push({kind:'close',state:state(),stack:new Error().stack});return nativeClose.apply(this,args);};
    const start=state();if(!start.active||!start.key||!start.visible||!start.connected||!start.hadPending)throw Error('Arrival scroll fixture lost its pending-to-ready precondition: '+JSON.stringify(start));
    wordPeekShownAt=performance.now();readerScroller().scrollTop+=8;return start;
  });
  assert.equal(scrollStart.hadPending,true,'this case tests a genuinely pending answer, not an already saved meaning');
  await page.waitForFunction(()=>document.getElementById('word-peek').hidden);
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(await pill.evaluate(n=>n.classList.contains('result-accent')),false,'reveal repeated arrival bloom');
  // Explicit retry after a usable answer is a new logical lookup.
  await page.evaluate(()=>retryWordPeek());
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden&&!wordPeekPending());
  assert.equal(requests.length,2);assert.notEqual(requests[1].lookupId,requests[0].lookupId);
  assert.equal(requests[1].retry,true);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await pill.evaluate(n=>getComputedStyle(n,'::after').animationName),'none');
  // Saved/cache opening has no arrival accent and makes no AI call.
  await page.evaluate(()=>{const node=qaNode;closePanel();openWord('patient',node);});
  await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
  assert.equal(requests.length,2);assert.equal(await pill.evaluate(n=>n.classList.contains('result-accent')),false);
  // Existing unresolved cards own a context view. Exhaust initial recovery, then
  // exercise both actual retry controls: stale context errors must not hide
  // pending feedback or the successful meaning already saved in the card.
  for(const [surface,mode] of [['Selfies','mini'],['reader','detail']]){
    const before=requests.length;failures=1;
    await page.evaluate(surface=>{
      closePanel();
      const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()===surface.toLowerCase()&&n.getBoundingClientRect().top>100&&n.getBoundingClientRect().bottom<innerHeight-100);
      if(!node)throw Error('Missing visible retry fixture '+surface);
      const key=keyOf(surface);
      words[key]={word:key,clicked:surface,forms:[key],ko:'',defs:[],example:sentenceOf(node),book:curBook.title,status:1,addedAt:1,up:1};
      openWord(key,node);
    },surface);
    await page.waitForFunction(()=>currentContext(selKey)?.error==='error'&&!words[selKey].aiLoading&&!document.getElementById('word-peek').hidden);
    assert.equal(requests.length,before+1);
    responseGate=new Promise(done=>{releaseResponse=done;});
    if(mode==='detail'){
      await page.locator('#word-peek-more').click();
      await page.locator('#p-aibtn').click();
      await page.waitForFunction(()=>document.getElementById('p-ai').classList.contains('load'));
      releaseResponse();
      await page.waitForFunction(()=>document.getElementById('p-ai-ko').textContent==='참을성 있는');
      assert.equal(await page.locator('#p-ai-note').textContent(),'');
    }else{
      await page.locator('#word-peek-retry').click();
      await page.waitForFunction(()=>wordPeekPending()&&document.getElementById('word-peek').hidden);
      releaseResponse();
      await page.waitForFunction(()=>!wordPeekPending()&&!document.getElementById('word-peek').hidden&&document.getElementById('word-peek-meaning').textContent==='참을성 있는');
    }
    responseGate=null;releaseResponse=null;
    assert.equal(await page.evaluate(()=>words[selKey].ko),'참을성 있는');
    if(surface==='Selfies'){
      assert.deepEqual(await page.evaluate(()=>({key:selKey,word:words[selKey].word,clicked:words[selKey].clicked,hasRenamedKey:!!words.selfie})),
        {key:'selfy',word:'selfie',clicked:'Selfies',hasRenamedKey:false});
      await page.locator('#word-peek-more').click();
      assert.equal(await page.locator('#p-word').textContent(),'selfie');
    }
    assert.equal(requests.length,before+2,'manual retry repeated the failed lookup');
    assert.equal(requests.at(-1).lookupId,requests[before].lookupId,'manual retry lost its recovery ID');
    assert.equal(await page.evaluate(()=>currentContext(selKey)?.error||''),'');
  }
  // An existing unresolved card's context-specific lookup also preserves the
  // AI canonical without moving its storage key or starting a second AI call.
  const beforeContext=requests.length;
  await page.evaluate(()=>{
    closePanel();
    const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()==='brownies'&&n.getBoundingClientRect().top>100&&n.getBoundingClientRect().bottom<innerHeight-100);
    if(!node)throw Error('Missing visible canonical context fixture');
    words.browny={word:'browny',clicked:'Brownies',forms:['browny','brownies'],ko:'',defs:[],example:sentenceOf(node),book:curBook.title,status:1,addedAt:1,up:1};
    openWord('browny',node);
  });
  await page.waitForFunction(()=>words.browny.ko==='참을성 있는'&&!words.browny.aiLoading);
  assert.deepEqual(await page.evaluate(()=>({key:selKey,word:words.browny.word,clicked:words.browny.clicked,hasRenamedKey:!!words.brownie})),
    {key:'browny',word:'brownie',clicked:'Brownies',hasRenamedKey:false});
  assert.equal(requests.length,beforeContext+1);
  await page.locator('#word-peek-more').click();
  assert.equal(await page.locator('#p-word').textContent(),'brownie');
  // Keep production deadline values, but advance only those timers explicitly.
  // Real buttons and transport run against deferred synthetic authentication.
  await page.evaluate(()=>{
    window.qaNativeSetTimeout=window.setTimeout;window.qaNativeClearTimeout=window.clearTimeout;
    window.qaDeadlines=new Map();window.qaAuthPending=[];window.qaAuthReady=false;
    window.setTimeout=(fn,ms,...args)=>{
      if(ms!==9000&&ms!==30000)return qaNativeSetTimeout(fn,ms,...args);
      const id=qaNativeSetTimeout(()=>fn(...args),60000);qaDeadlines.set(id,{fn,ms,args});return id;
    };
    window.clearTimeout=id=>{qaDeadlines.delete(id);qaNativeClearTimeout(id);};
    window.qaFireDeadline=ms=>{
      const entry=[...qaDeadlines].find(([,item])=>item.ms===ms);
      if(!entry)throw Error('Missing deadline '+ms);
      const [id,item]=entry;clearTimeout(id);item.fn(...item.args);
    };
    sb.auth.getSession=()=>new Promise(resolve=>qaAuthPending.push(resolve));
    sb.auth.refreshSession=()=>new Promise(resolve=>qaAuthPending.push(resolve));
    dictAuthCredential={userId:'qa-user',accessToken:'synthetic-qa-user'};
    window.qaOpenUnresolved=surface=>{
      closePanel();
      const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent.toLowerCase()===surface&&n.getBoundingClientRect().top>100&&n.getBoundingClientRect().bottom<innerHeight-100);
      if(!node)throw Error('Missing auth fixture '+surface);
      const key=keyOf(surface);words[key]={word:surface,clicked:surface,forms:[key],ko:'',defs:[],example:sentenceOf(node),book:curBook.title,status:1,addedAt:1,up:1};
      window.qaAuthWord=words[key];window.qaAuthNode=node;openWord(key,node);
    };
  });
  responseGate=new Promise(done=>{releaseResponse=done;});
  const beforeDeadline=requests.length;
  await page.evaluate(()=>qaOpenUnresolved('resilient'));
  await page.waitForFunction(()=>qaAuthWord.aiLoading);
  assert.equal(requests.length,beforeDeadline+1,'cached credential did not send while getSession was pending');
  assert.equal(await page.evaluate(()=>qaAuthPending.length),0);
  await page.evaluate(()=>qaFireDeadline(9000));
  await page.waitForFunction(()=>!qaAuthWord.aiLoading&&currentContext(selKey)?.error==='error');
  releaseResponse();responseGate=null;releaseResponse=null;
  assert.equal(requests.length,beforeDeadline+1);
  await page.locator('#word-peek-retry').click();
  await page.waitForFunction(()=>!wordPeekPending()&&!document.getElementById('word-peek').hidden&&document.getElementById('word-peek-meaning').textContent==='참을성 있는');
  assert.equal(requests.length,beforeDeadline+2,'manual retry did not send exactly one more request');
  await page.evaluate(()=>qaAuthPending.forEach(resolve=>resolve(qaAuthSession)));
  await page.waitForTimeout(50);assert.equal(requests.length,beforeDeadline+2,'late auth dispatched an expired attempt');
  const beforeClose=requests.length;
  responseGate=new Promise(done=>{releaseResponse=done;});
  await page.evaluate(()=>qaOpenUnresolved('resilient'));
  await page.waitForFunction(()=>qaAuthWord.aiLoading);
  await page.evaluate(()=>closePanel());
  await page.waitForFunction(()=>!qaAuthWord.aiLoading);
  releaseResponse();responseGate=null;releaseResponse=null;
  await page.waitForTimeout(50);assert.equal(requests.length,beforeClose+1,'closed word sent a follow-up after its in-flight lookup');
  // Sentence translation uses the same cached credential. A held response still dies at 30s.
  responseGate=new Promise(done=>{releaseResponse=done;});
  const beforeSentence=requests.length;
  await page.evaluate(()=>{qaAuthPending=[];void openSentence('A patient reader.',{peekTarget:qaAuthNode,owner:qaAuthNode});});
  await page.waitForFunction(()=>sentenceWaitingActive());
  assert.equal(requests.length,beforeSentence+1);assert.equal(await page.evaluate(()=>qaAuthPending.length),0);
  await page.evaluate(()=>qaFireDeadline(30000));
  releaseResponse();responseGate=null;releaseResponse=null;
  await page.waitForFunction(()=>!sentenceWaitingActive()&&!document.getElementById('sentence-peek').hidden);
  assert.equal(await page.locator('#sentence-peek-meaning').textContent(),'해석하지 못했어요');
  await page.locator('#sentence-peek-retry').click();
  await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden&&document.getElementById('ps-ko').textContent==='참을성 있는');
  assert.equal(requests.length,beforeSentence+2);
  await page.evaluate(()=>{
    qaAuthPending.forEach(resolve=>resolve(qaAuthSession));
    window.setTimeout=qaNativeSetTimeout;window.clearTimeout=qaNativeClearTimeout;
    sb.auth.getSession=async()=>qaAuthSession;closeSentence();
  });
  await page.waitForTimeout(50);assert.equal(requests.length,beforeSentence+2);
  console.log(`${process.env.BROWSER||'chromium'} word recovery + auth deadlines + neutral arrival browser: passed`);
}catch(error){
  if(page)console.error('word recovery fixture state',await page.evaluate(()=>({
    arrivalScrollTrace:window.qaArrivalScrollTrace||[],selected:selKey,active:wordPeekActive,hidden:document.getElementById('word-peek').hidden,
    presentation:wordPeekPresentation,ended:wordPeekPresentationEnded,hadPending:wordPeekHadPending,
    shownAge:wordPeekShownAt===null?null:performance.now()-wordPeekShownAt,
    contextError:currentContext(selKey)?.error||'',loading:!!words[selKey]?.aiLoading,
    meaningVisible:document.getElementById('p-ai-ko').textContent,
    authPending:window.qaAuthPending?.length,authReady:window.qaAuthReady,
    deadlines:window.qaDeadlines?[...qaDeadlines.values()].map(item=>item.ms):[],
    sentenceState:sentenceView,sentenceError:document.getElementById('sentence-peek-meaning').textContent,
  })).catch(()=>null));
  throw error;
}finally{await browser.close();await new Promise(done=>server.close(done));}
