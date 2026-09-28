import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const allowed=url;
const browser=await chromium.launch({...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
const errors=[];
try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  page.on('pageerror',error=>errors.push(String(error)));
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>route.request().url().startsWith(allowed)||route.request().url().startsWith('blob:')?route.continue():route.abort());
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.locator('#fileinput').setInputFiles({name:'lightning-fixture.txt',mimeType:'text/plain',buffer:Buffer.from(
    'The patient reader sat on the bank beside the river. She gave the entire plan up and smiled.\n\n'+
    'An unfamiliar visitor watched the narrow entrance. A quiet light appeared beyond the door.\n\n'+
    'A distant signal reached the empty station. Nobody recognized the strange message.\n\n'+
    ('Another story begins here. Readers can move between paragraphs.\n\n').repeat(20))});
  await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
  await page.evaluate(()=>openBook(books.find(book=>book.kind==='txt')));
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20);
  await page.evaluate(()=>{
    sbUser={id:'lightning-fixture'};fillDictionaryMetadata=async()=>{};
    window.__calls=[];window.__delay=40;window.__serverError='';
    dictCall=async(payload,signal)=>{
      if(!['prefetch','look'].includes(payload.op))return {ok:true};
      window.__calls.push(payload);
      await new Promise(done=>setTimeout(done,window.__delay));
      if(signal?.aborted)return null;
      if(payload.op==='prefetch'){
        if(window.__serverError)return {error:window.__serverError};
        return {version:1,left:299,usage:{input_tokens:100,output_tokens:200},sentences:payload.sentences.map(input=>{
          const units=input.tokens.map((token,index)=>({kind:'word',canonical:token.text.toLowerCase(),members:[index],
            ko:token.text.toLowerCase()==='bank'?'강둑':token.text.toLowerCase()==='patient'?'참을성 있는':'뜻'}));
          const gave=input.tokens.findIndex(token=>token.text==='gave'),up=input.tokens.findIndex(token=>token.text==='up');
          if(gave>=0&&up>=0){units[gave]={kind:'expression',canonical:'give up',members:[gave,up],ko:'포기하다'};units.splice(up,1);}
          return {sentence:input.sentence,units};
        })};
      }
      return {kind:'word',canonical:payload.word,members:[payload.clickedIndex],ko:'새로운 뜻',left:298};
    };
  });
  assert.equal(await page.locator('#aa-lightning').getAttribute('aria-checked'),'false');
  await page.waitForTimeout(1400);
  assert.equal(await page.evaluate(()=>window.__calls.length),0,'OFF must not send any speculative requests');
  await page.locator('#aafab').click();await page.locator('#aa-lightning').click();
  assert.equal(await page.locator('#aa-lightning').getAttribute('aria-checked'),'true');
  await page.evaluate(()=>closeAa());
  await page.waitForFunction(()=>BreezeLightning.stats().inputTokens>0);
  assert.equal(await page.evaluate(()=>Object.keys(words).length),0,'prefetch must not create Wordbook entries');
  const result=await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent==='bank');
    const before=readerScrollTop(),start=performance.now();openWord(keyOf('bank'),span);
    return {text:document.getElementById('word-peek-meaning').textContent,elapsed:performance.now()-start,
      loading:document.getElementById('word-peek').classList.contains('loading'),scroll:readerScrollTop()-before,
      animated:document.getElementById('word-peek-meaning').getAnimations().length};
  });
  assert.equal(result.text,'강둑','warm hit must be synchronous, with no pending label');assert.equal(result.loading,false);
  assert.equal(result.scroll,0);assert.equal(result.animated,1);
  await page.waitForFunction(()=>words[keyOf('bank')]?.ko==='강둑');
  assert.equal(await page.evaluate(()=>window.__calls.filter(call=>call.op==='look').length),0,'hit must not bill a second lookup');
  await page.evaluate(()=>{
    closePanel();words[keyOf('bank')].ko='내가 저장한 뜻';words[keyOf('bank')].koEdited=true;
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent==='bank');openWord(keyOf('bank'),span);
  });
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'내가 저장한 뜻');
  assert.equal(await page.locator('#word-peek-meaning').evaluate(el=>el.getAnimations().length),0,'saved meaning must be static');
  await page.evaluate(()=>retryWordPeek());
  assert.equal(await page.evaluate(()=>window.__calls.filter(call=>call.op==='look').length),1,'explicit retry must bypass prefetch');
  assert.equal(await page.evaluate(()=>words[keyOf('bank')].ko),'내가 저장한 뜻','retry must preserve manually saved meaning');
  await page.evaluate(()=>{
    closePanel();const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent==='gave');openWord(keyOf('gave'),span);
  });
  assert.equal(await page.locator('#word-peek-meaning').textContent(),'포기하다');
  await page.waitForFunction(()=>words['phrase:give up']?.ko==='포기하다');
  assert.equal(await page.evaluate(()=>words[keyOf('gave')]||null),null,'expression promotion must not leave an empty word');
  await page.evaluate(()=>closePanel());
  await page.emulateMedia({reducedMotion:'reduce'});
  const reduced=await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent==='patient');openWord(keyOf('patient'),span);
    return {text:document.getElementById('word-peek-meaning').textContent,animations:document.getElementById('word-peek-meaning').getAnimations().length};
  });
  assert.equal(reduced.text,'참을성 있는');assert.equal(reduced.animations,0);
  await page.waitForTimeout(100);await page.evaluate(()=>closePanel());
  const wrongContext=await page.evaluate(()=>BreezeLightning.peek({sentence:'The patient reader sat on the bank beside the river.',before:'Different context.',after:'',clickedIndex:7}));
  assert.equal(wrongContext,null,'a different context must not reuse the sentence map');
  // Start an uncached batch, tap while it is in flight, and ensure a single request is shared.
  await page.evaluate(()=>{window.__delay=700;document.querySelector('#rtext [data-pi="1"]').scrollIntoView();});
  await page.waitForFunction(()=>window.__calls.some(call=>call.op==='prefetch'&&call.sentences.some(s=>s.sentence.includes('unfamiliar'))));
  const beforeLook=await page.evaluate(()=>window.__calls.filter(call=>call.op==='look').length);
  await page.evaluate(()=>{
    const span=[...document.querySelectorAll('#rtext .w')].find(node=>node.textContent==='unfamiliar');openWord(keyOf('unfamiliar'),span);
  });
  await page.waitForFunction(()=>words[keyOf('unfamiliar')]?.ko);
  assert.equal(await page.evaluate(()=>window.__calls.filter(call=>call.op==='look').length),beforeLook,'in-flight hit must not duplicate AI work');
  await page.evaluate(()=>closePanel());
  // OFF during a delayed response must not accept the response or keep scheduling.
  await page.evaluate(()=>{window.__delay=900;document.querySelector('#rtext [data-pi="2"]').scrollIntoView();});
  await page.waitForFunction(()=>window.__calls.some(call=>call.op==='prefetch'&&call.sentences.some(s=>s.sentence.includes('distant'))));
  await page.evaluate(()=>BreezeLightning.setEnabled(false));
  const stoppedAt=await page.evaluate(()=>window.__calls.length);
  await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.__calls.length),stoppedAt);
  assert.equal(await page.evaluate(()=>words[keyOf('distant')]||null),null);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('breeze.lightning'))),false);
  // Older/disabled server must fail softly and stop repeated failed prefetch.
  await page.evaluate(()=>{window.__delay=10;window.__serverError='prefetch_disabled';BreezeLightning.setEnabled(true);});
  await page.waitForFunction(()=>BreezeLightning.stats().stopped==='server');
  assert.match(await page.locator('#aa-lightning-note').textContent(),/서버/);
  const failedAt=await page.evaluate(()=>window.__calls.length);await page.waitForTimeout(1600);
  assert.equal(await page.evaluate(()=>window.__calls.length),failedAt);
  if(process.env.LIGHTNING_SCREENSHOT)await page.screenshot({path:process.env.LIGHTNING_SCREENSHOT});
  console.log(JSON.stringify({status:'PASS',browser:await browser.version(),warmHit:result,stats:await page.evaluate(()=>BreezeLightning.stats()),errors},null,2));
  assert.deepEqual(errors,[]);
}finally{await browser.close();await new Promise(done=>server.close(done));}
