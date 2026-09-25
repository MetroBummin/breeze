/* Actual Preview JS/CSS in browsers; Reader, auth, storage and HTTP are controlled doubles.
   This is deliberately not Supabase E2E or whole-application regression. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
const root=new URL('../',import.meta.url);
const script=readFileSync(new URL('scripts/library/article-preview.js',root),'utf8');
const css=readFileSync(new URL('styles/article-preview.css',root),'utf8');
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{--ui:Arial,sans-serif;--display:Georgia,serif;--serif:Georgia,serif;--sentence-glass-solid:#fafafa;--sentence-glass-surface:rgba(250,250,250,.94);--sentence-glass-shadow:0 20px 70px #0003;--sentence-glass-line-soft:#ddd;--sentence-glass-ink:#111;--sentence-glass-muted:#555;--sentence-glass-secondary:#444;--sentence-glass-line:#ddd;--sentence-glass-scrim:#0005;--sentence-glass-action:#eee;--s1:#ddd;}body{margin:0;height:2000px;}button{box-sizing:border-box;}${css}</style></head><body>
<button id="launch">Open article</button><div id="reader" hidden></div>
<dialog id="article-preview" aria-labelledby="ap-hook"><div class="ap-sheet"><button class="ap-close" type="button" aria-label="미리보기 닫기">✕</button><div class="ap-scroll"><div class="ap-hero"><img alt="" hidden><div class="ap-art" aria-hidden="true"></div></div><div class="ap-content"><p class="ap-source"></p><h2 id="ap-hook" hidden></h2><h3 class="ap-title"></h3><p class="ap-teaser" hidden></p><div class="ap-excerpt" aria-label="원문 미리보기"></div></div></div><div class="ap-actions"><button class="ap-start" type="button">읽기 시작</button></div></div></dialog>
<script>
const IMG_MARK='__IMG__',SB_URL='https://preview.fixture',SB_KEY='fixture-public-key';
class FixtureStorage{constructor(){this.values=new Map();}getItem(k){return this.values.get(k)||null;}setItem(k,v){this.values.set(k,String(v));}}
window.Storage=FixtureStorage;Object.defineProperty(window,'localStorage',{value:new FixtureStorage(),configurable:true});
const QA={opens:[],fail:false,hold:false,image:null,toasts:[],requests:[]},positions={};
window.fetch=(url,options)=>new Promise(resolve=>QA.requests.push({url,options,resolve}));
const sb={auth:{getSession:async()=>({data:{session:null}})}};
function articleUrlKey(raw){const u=new URL(raw);u.hash='';for(const k of [...u.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(k))u.searchParams.delete(k);return u.href;}
function deviceId(){return 'fixture-device';}function posOf(id){return positions[id]||{t:0};}
function coverArtwork(){return '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="20"/></svg>';}
function bookImageBlob(){return Promise.resolve(QA.image);}function toast(s){QA.toasts.push(s);}
async function openBook(book,options={}){QA.opens.push(book.id);if(QA.hold)await new Promise(r=>QA.resume=r);if(QA.fail)throw Error('read failure');positions[book.id]={t:1};document.querySelector('#reader').hidden=false;if(options.onPresented)options.onPresented();return book;}
function book(id='a'){return {id,kind:'article',sourceUrl:'https://example.test/'+id,title:'Original article '+id,site:'Example',paras:['Original article '+id,'The first source paragraph describes the subject with enough detail to let readers decide whether to continue reading the article.']};}
</script><script>${script}</script><script>document.querySelector('#launch').onclick=()=>openCasualPreviewOrReader(book());</script></body></html>`;
const meta={hookTitle:'이 글에 담긴 질문은 무엇일까요',translatedTitle:'원문 제목의 충실한 번역',teaser:'이 글은 구체적인 사례를 바탕으로 주제를 소개합니다. 서로 다른 설명과 그 배경을 함께 살펴봅니다.'};
let count=0;
try{
  const engines=process.env.BREEZE_TEST_BROWSER==='chromium'?[chromium]:[chromium,webkit];
  for(const engine of engines){
    const browser=await engine.launch(engine===chromium && process.env.BREEZE_CHROMIUM_PATH
      ? {executablePath:process.env.BREEZE_CHROMIUM_PATH,args:['--no-sandbox']} : {});
    async function run(name,test,size={width:390,height:844}){
      const page=await browser.newPage({viewport:size,serviceWorkers:'block'}),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));
      const respond=async(index=0,data=meta,status=200)=>{
        await page.waitForFunction(i=>QA.requests.length>i,index);
        await page.evaluate(({index,data,status})=>QA.requests[index].resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}})),{index,data,status});
      };
      try{await page.setContent(html);await test(page,requests,respond);assert.deepEqual(errors,[]);console.log('PASS',engine.name(),name);count++;}
      finally{await page.close();}
    }
    try{
      for(const [width,height] of [[320,568],[390,844],[820,1024],[1280,800],[844,390]]){
        await run(`stable layout ${width}x${height}`,async(p,rs,respond)=>{
          await p.click('#launch');await p.waitForTimeout(180);
          assert.equal(await p.getAttribute('#article-preview','aria-labelledby'),'ap-original-title');
          assert.equal(await p.isEnabled('.ap-start'),true);
          const before=await p.locator('#article-preview').boundingBox(),cta=await p.locator('.ap-start').boundingBox();
          await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond();
          await p.waitForFunction(()=>!document.querySelector('#ap-hook').hidden);
          const after=await p.locator('#article-preview').boundingBox(),next=await p.locator('.ap-start').boundingBox();
          assert.deepEqual(after,before);assert.deepEqual(next,cta);
          assert(Math.abs(after.x+after.width/2-width/2)<2 && Math.abs(after.y+after.height/2-height/2)<2);
          assert(next.y>=0 && next.y+next.height<=height);
          assert(await p.locator('.ap-scroll').evaluate(n=>n.scrollHeight<=n.clientHeight+2),'normal text must fit without internal scrolling');
          if(process.env.BREEZE_PREVIEW_CAPTURE && width===390)await p.screenshot({path:process.env.BREEZE_PREVIEW_CAPTURE});
        },{width,height});
      }
      await run('A/B out-of-order responses cannot cross-paint',async(p,rs,respond)=>{
        await p.evaluate(()=>openCasualPreviewOrReader(book('a')));await p.waitForFunction(()=>articlePreviewJobs.size===1);
        await p.evaluate(()=>openCasualPreviewOrReader(book('b')));await p.waitForFunction(()=>articlePreviewJobs.size===2);
        await respond(1,{...meta,hookTitle:'두 번째 글의 한국어 소개입니다'});await respond(0);
        await p.waitForTimeout(40);assert.equal(await p.textContent('#ap-hook'),'두 번째 글의 한국어 소개입니다');
      });
      await run('close/reopen shares request; queued close is harmless',async(p,rs,respond)=>{
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);
        await p.evaluate(()=>{articlePreviewClose();openCasualPreviewOrReader(book());});await respond();
        await p.waitForFunction(()=>!document.querySelector('#ap-hook').hidden);
        assert.equal(await p.evaluate(()=>QA.requests.length),1);assert(await p.locator('#article-preview').evaluate(n=>n.open));
        await p.keyboard.press('Escape');assert(!await p.locator('#article-preview').evaluate(n=>n.open));
      });
      await run('cached reopen is synchronous; title/body edits invalidate',async(p,rs,respond)=>{
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond();await p.waitForFunction(()=>articlePreviewJobs.size===0);
        assert(await p.evaluate(()=>{articlePreviewClose();openCasualPreviewOrReader(book());return !document.querySelector('#ap-hook').hidden;}));
        assert.equal(await p.evaluate(()=>QA.requests.length),1);
        await p.evaluate(()=>{articlePreviewClose();const b=book();b.title='Changed headline';openCasualPreviewOrReader(b);});
        await p.waitForFunction(()=>articlePreviewJobs.size===1);assert.equal(await p.evaluate(()=>QA.requests.length),2);await respond(1);
      });
      await run('Reader does not wait for metadata and late result stays closed',async(p,rs,respond)=>{
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);await p.click('.ap-start');
        assert.equal(await p.evaluate(()=>QA.opens.length),1);assert(!await p.locator('#article-preview').evaluate(n=>n.open));
        await respond();await p.waitForFunction(()=>articlePreviewJobs.size===0);assert(!await p.locator('#article-preview').evaluate(n=>n.open));
        await p.evaluate(()=>openCasualPreviewOrReader(book()));assert.equal(await p.evaluate(()=>QA.opens.length),2);
      });
      await run('Reader failure remains retryable; duplicate CTA is gated',async(p,rs,respond)=>{
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond();
        await p.evaluate(()=>{QA.fail=true;QA.hold=true;document.querySelector('.ap-start').click();document.querySelector('.ap-start').click();});
        await p.waitForFunction(()=>QA.resume);assert.equal(await p.evaluate(()=>QA.opens.length),1);
        await p.evaluate(()=>QA.resume());await p.waitForFunction(()=>!document.querySelector('.ap-start').disabled);
        assert.match(await p.textContent('.ap-status'),/다시/);assert(await p.locator('#article-preview').evaluate(n=>n.open));
        await p.evaluate(()=>{QA.fail=false;QA.hold=false;});await p.click('.ap-start');assert.equal(await p.evaluate(()=>QA.opens.length),2);
      });
      await run('malformed/expired cache and storage failure are nonfatal',async(p,rs,respond)=>{
        await p.evaluate(()=>localStorage.setItem(ARTICLE_PREVIEW_CACHE,'null'));
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);
        await respond(0,{...meta,hookTitle:'',teaser:'x'});await p.waitForFunction(()=>articlePreviewJobs.size===0);
        assert(await p.locator('#ap-hook').evaluate(n=>n.hidden));
        await p.evaluate(m=>{articlePreviewClose();localStorage.setItem(ARTICLE_PREVIEW_CACHE,JSON.stringify({[articlePreviewKey(book())]:{at:Date.now()-31*86400000,meta:m}}));Storage.prototype.setItem=()=>{throw Error('quota');};openCasualPreviewOrReader(book());},meta);
        await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond(1);await p.waitForFunction(()=>!document.querySelector('#ap-hook').hidden);
      });
      await run('hung auth hits total deadline and releases dedupe for retry',async(p,rs,respond)=>{
        await p.clock.install();await p.evaluate(()=>{sb.auth.getSession=()=>new Promise(()=>{});openCasualPreviewOrReader(book());});
        await p.clock.runFor(15010);assert.equal(await p.evaluate(()=>articlePreviewJobs.size),0);assert.equal(await p.evaluate(()=>QA.requests.length),0);
        assert(await p.isEnabled('.ap-start'));
        await p.evaluate(()=>{articlePreviewClose();sb.auth.getSession=async()=>({data:{session:null}});openCasualPreviewOrReader(book());});
        await p.waitForFunction(()=>articlePreviewJobs.size===1);await p.clock.runFor(10);await p.waitForTimeout(30);await respond();
      });
      await run('hung response body cannot pin jobs indefinitely',async(p)=>{
        await p.clock.install();await p.evaluate(()=>{window.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});openCasualPreviewOrReader(book());});
        await p.clock.runFor(15010);assert.equal(await p.evaluate(()=>articlePreviewJobs.size),0);assert(await p.isEnabled('.ap-start'));
      });
      await run('invalid URL/offline/excerpt never requests AI',async(p,rs)=>{
        await p.evaluate(()=>{const b=book();b.sourceUrl='javascript:bad';openCasualPreviewOrReader(b);});
        await p.waitForTimeout(30);assert.equal(await p.evaluate(()=>QA.requests.length),0);assert(await p.isEnabled('.ap-start'));
        await p.context().setOffline(true);await p.evaluate(()=>{articlePreviewClose();openCasualPreviewOrReader(book());});
        assert.equal(await p.evaluate(()=>QA.requests.length),0);
      });
      await run('HTTP failure is not cached; reopening can retry',async(p,rs,respond)=>{
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond(0,{error:'quota'},429);
        await p.waitForFunction(()=>articlePreviewJobs.size===0);assert(await p.isEnabled('.ap-start'));
        await p.evaluate(()=>{articlePreviewClose();openCasualPreviewOrReader(book());});
        await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond(1);
        await p.waitForFunction(()=>!document.querySelector('#ap-hook').hidden);
        assert.equal(await p.evaluate(()=>QA.requests.length),2);
      });
      await run('rapid different previews bound concurrent optional work',async(p,rs,respond)=>{
        await p.evaluate(()=>{for(let i=0;i<5;i++)openCasualPreviewOrReader(book('burst'+i));});
        await p.waitForFunction(()=>QA.requests.length===4);assert.equal(await p.evaluate(()=>articlePreviewJobs.size),4);
        assert(await p.isEnabled('.ap-start'));
        for(let i=0;i<4;i++)await respond(i);
        await p.waitForFunction(()=>articlePreviewJobs.size===0);
        assert.equal(await p.textContent('.ap-title'),'Original article burst4');
        assert(await p.locator('#ap-hook').evaluate(n=>n.hidden));
      });
      await run('formatting prose and bounded cache contract',async(p)=>{
        const out=await p.evaluate(m=>{
          const b=book();b.formatting={blocks:[{r:'p',t:'Actual formatting paragraph '+'.'.repeat(100)}]};
          const excerpt=articlePreviewExcerpt(b)[0];
          for(let i=0;i<110;i++)articlePreviewSave('k'+i,m);
          return {excerpt,keys:Object.keys(articlePreviewCacheEntries()).length,
            alias:articlePreviewKey(book())===articlePreviewKey({...book(),sourceUrl:book().sourceUrl+'?utm_source=x#frag'})};
        },meta);
        assert.match(out.excerpt,/Actual formatting/);assert.equal(out.keys,100);assert(out.alias);
      });
      await run('native close cleans image URLs; bad cover retains artwork',async(p,rs,respond)=>{
        await p.evaluate(()=>{QA.revoked=[];const revoke=URL.revokeObjectURL.bind(URL);URL.revokeObjectURL=u=>{QA.revoked.push(u);revoke(u);};QA.image=new Blob(['broken'],{type:'image/png'});openCasualPreviewOrReader({...book(),cover:'test'});});
        await p.waitForFunction(()=>QA.revoked.length===1);assert(await p.locator('.ap-hero img').evaluate(n=>n.hidden));
        await p.evaluate(()=>document.querySelector('#article-preview').close());await p.waitForFunction(()=>articlePreviewBook===null);
        await respond();assert(!await p.locator('#article-preview').evaluate(n=>n.open));
      });
      await run('backdrop drag does not dismiss; actual outside tap does',async(p,rs,respond)=>{
        await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond();
        await p.locator('.ap-title').dispatchEvent('pointerdown',{bubbles:true});
        await p.locator('#article-preview').dispatchEvent('click',{bubbles:true});assert(await p.locator('#article-preview').evaluate(n=>n.open));
        await p.mouse.click(2,2);assert(!await p.locator('#article-preview').evaluate(n=>n.open));
      });
      await run('reduced motion, enlarged text and keyboard focus',async(p,rs,respond)=>{
        await p.emulateMedia({reducedMotion:'reduce'});await p.click('#launch');await p.waitForFunction(()=>articlePreviewJobs.size===1);await respond();
        assert.equal(await p.locator('#article-preview').evaluate(n=>getComputedStyle(n).animationName),'none');
        await p.keyboard.press('Tab');assert.equal(await p.evaluate(()=>document.activeElement.className),'ap-start');
        await p.addStyleTag({content:'.ap-content h2,.ap-content h3,.ap-content p{font-size:32px!important}'});
        const cta=await p.locator('.ap-start').boundingBox();assert(cta.y+cta.height<=844);
        assert.equal(await p.locator('.ap-scroll').evaluate(n=>getComputedStyle(n).overflowY),'auto');
      });
    }finally{await browser.close();}
  }
  console.log(`${count} browser resilience cases passed. API/auth/storage/Reader are doubles; no live AI calls.`);
}finally{/* Each case/browser owns and closes its fixture. */}
