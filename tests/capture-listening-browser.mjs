// 듣기 모드 browser walk-through and review captures (not part of `npm test`).
//
//   node tests/capture-listening-browser.mjs [outDir]
//
// Headless engines have no audible voices, so the page gets a scripted
// speechSynthesis that emits word boundaries on a timer. Everything else is the
// real app: Alice's Adventures in Wonderland imported from the bundled
// fallback text, the real reader, gesture controller and sentence surface.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(process.argv[2]||resolve(root,'docs/reviews/listening-mode'));
mkdirSync(out,{recursive:true});
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpg':'image/jpeg',
  '.webp':'image/webp','.avif':'image/avif','.woff2':'font/woff2','.svg':'image/svg+xml','.json':'application/json'};
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const path=resolve(root,'.'+(pathname==='/'?'/index.html':decodeURIComponent(pathname)));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'text/plain; charset=utf-8');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;

function fakeSpeech(){
  const log=window.__speech={spoken:[],cancels:0,current:null};
  class Utterance{
    constructor(text){this.text=String(text);this.rate=1;this.lang='';this.voice=null;
      this.onstart=null;this.onend=null;this.onerror=null;this.onboundary=null;}
  }
  const voice={name:'Scripted English',lang:'en-US',localService:true,default:true,voiceURI:'scripted'};
  const synth={speaking:false,paused:false,pending:false,
    getVoices(){return [voice];},
    addEventListener(){},removeEventListener(){},
    resume(){this.paused=false;},pause(){this.paused=true;},
    cancel(){
      log.cancels++;
      const current=log.current;log.current=null;this.speaking=false;
      if(current){clearTimeout(current.timer);current.u.onerror?.({error:'interrupted'});}
    },
    speak(u){
      const words=[...u.text.matchAll(/[A-Za-z0-9’']+/g)];
      const job={u,i:0,timer:0};log.current=job;log.spoken.push({text:u.text,rate:u.rate,lang:u.lang});
      this.speaking=true;
      const tick=()=>{
        if(log.current!==job)return;
        if(window.__speechHold){job.timer=setTimeout(tick,60);return;}
        if(job.i>=words.length){log.current=null;this.speaking=false;u.onend?.({});return;}
        const w=words[job.i++];
        u.onboundary?.({name:'word',charIndex:w.index,charLength:w[0].length});
        job.timer=setTimeout(tick,260/(u.rate||1));
      };
      u.onstart?.({});job.timer=setTimeout(tick,40);
    }};
  Object.defineProperty(window,'speechSynthesis',{value:synth,configurable:true});
  Object.defineProperty(window,'SpeechSynthesisUtterance',{value:Utterance,configurable:true});
}

const engines=[chromium,webkit].filter(engine=>!process.env.BROWSER||engine.name()===process.env.BROWSER);
try{
  for(const engine of engines){
    const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
    try{
      const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,
        serviceWorkers:'block',reducedMotion:'reduce'});
      const page=await context.newPage();
      page.on('pageerror',error=>{console.error('pageerror',error);});
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.addInitScript(fakeSpeech);
      await page.route('**/*',route=>{
        const href=route.request().url();
        return href.startsWith(url)||href.startsWith('blob:')||href.startsWith('data:')?route.continue():route.abort();
      });
      await page.goto(url,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>homeReady);
      // CI images may have no Korean system font. BREEZE_CAPTURE_KO_FONT points
      // at any local Hangul TTF; it stands in for the system face in captures only.
      if(process.env.BREEZE_CAPTURE_KO_FONT){
        const font=readFileSync(process.env.BREEZE_CAPTURE_KO_FONT).toString('base64');
        await page.addStyleTag({content:`@font-face{font-family:'Apple SD Gothic Neo';src:url(data:font/ttf;base64,${font});}`});
      }

      // Gating: a user upload of plain text gets no listening button.
      await page.evaluate(async()=>{
        const text='My own notes. They were uploaded by me.\n\nAnother paragraph is here. It ends now.\n'.repeat(4);
        await importFile(new File([text],'notes.txt',{type:'text/plain'}),{title:'My notes'});
        await openBook(books.find(book=>book.title==='My notes'));
      });
      await page.waitForFunction(()=>document.querySelector('#rtext [data-pi]'));
      assert.equal(await page.locator('#listenfab').isVisible(),false,'User TXT shows the listening button');
      assert.equal(await page.evaluate(()=>document.body.classList.contains('listening-available')),false);
      await page.evaluate(()=>show('home'));

      // Alice from the bundled fallback text.
      await page.evaluate(async()=>{
        const book=await importLongRead(CLASSIC_FALLBACKS.find(read=>read.id==='alice-in-wonderland'));
        await openBook(book);
      });
      await page.waitForFunction(()=>curBook?.longReadId==='alice-in-wonderland'&&document.querySelectorAll('#rtext [data-pi]').length>100&&!readerPositionRestoration);
      await page.locator('#listenfab').waitFor({state:'visible'});
      // Read from the opening of Chapter I.
      await page.evaluate(()=>{
        const start=[...document.querySelectorAll('#rtext p[data-pi]')].find(p=>/^Alice was beginning/.test(p.textContent));
        readerScrollTo(readerScrollTop()+start.getBoundingClientRect().top-120);
      });
      await page.waitForTimeout(300);
      await page.locator('#listenfab').click();
      await page.waitForFunction(()=>window.__speech.spoken.length>0&&!document.getElementById('listen-bar').hidden);
      const first=await page.evaluate(()=>window.__speech.spoken[0].text);
      assert.match(first,/^Alice was beginning to get very tired/,'Did not start from the first visible sentence');
      assert.equal(await page.locator('#listen-hint').isVisible(),true,'One-time hint missing');
      await page.locator('#readback').waitFor({state:'hidden'});
      // A few words in, then hold the voice so captures are stable.
      await page.waitForFunction(()=>CSS.highlights?.get('breeze-listen-word')||document.querySelector('.listen-cue-word'));
      await page.waitForTimeout(700);
      await page.evaluate(()=>{window.__speechHold=true;});
      await page.waitForTimeout(100);
      await page.screenshot({path:resolve(out,`${engine.name()}-1-listening-light.png`)});
      await page.evaluate(()=>{darkMode=true;applyDark();});
      await page.waitForTimeout(150);
      await page.screenshot({path:resolve(out,`${engine.name()}-2-listening-dark.png`)});
      await page.evaluate(()=>{darkMode=false;applyDark();window.__speechHold=false;});

      // ⏭ next, ⏮ restart, ⏮⏮ previous.
      const sentences=()=>page.evaluate(()=>window.__speech.spoken.map(item=>item.text));
      await page.locator('#listen-next').click();
      let spoken=await sentences();
      assert.notEqual(spoken.at(-1),first);const second=spoken.at(-1);
      await page.locator('#listen-prev').click();
      spoken=await sentences();assert.equal(spoken.at(-1),second,'⏮ once restarts the current sentence');
      await page.locator('#listen-prev').click();
      spoken=await sentences();assert.equal(spoken.at(-1),first,'⏮⏮ goes to the previous sentence');
      // Speed cycles 1.0 → 1.25 → 0.75 → 1.0 and restarts the sentence at the new rate.
      await page.locator('#listen-rate').click();
      assert.equal(await page.locator('#listen-rate').textContent(),'1.25x');
      assert.equal(await page.evaluate(()=>window.__speech.spoken.at(-1).rate),1.25);
      await page.locator('#listen-rate').click();await page.locator('#listen-rate').click();
      assert.equal(await page.locator('#listen-rate').textContent(),'1.0x');
      // Tapping the current sentence replays it; no word popup.
      const current=async()=>page.evaluate(()=>window.__speech.spoken.at(-1).text);
      const before=await page.evaluate(()=>window.__speech.spoken.length);
      const spanIn=async(predicate)=>page.evaluate(predicate);
      const box=await spanIn(()=>{
        const range=listeningRange(listening.sentence);const rect=range.getClientRects()[0];
        return {x:rect.left+12,y:rect.top+rect.height/2};
      });
      await page.mouse.click(box.x,box.y);
      await page.waitForTimeout(80);
      assert.equal(await page.evaluate(()=>window.__speech.spoken.length),before+1,'Tap on the current sentence did not replay');
      assert.equal(await page.evaluate(()=>listeningWordSurfaceOpen()),false,'Replay tap opened a word popup');
      // A word in another sentence: pause, popup, resume on close at the same sentence.
      const playing=await current();
      // The first word on screen whose sentence is not the one being read.
      const visibleOther=()=>page.evaluate(()=>{
        const range=listeningRange(listening.sentence);
        for(const span of document.querySelectorAll('#rtext .w')){
          const rect=span.getBoundingClientRect();
          if(rect.top<80||rect.bottom>innerHeight-160||range.intersectsNode(span)||!span.closest('p'))continue;
          const found=textSentencePartAt(span);
          if(found.part.text.length<60)continue;
          return {x:rect.left+rect.width/2,y:rect.top+rect.height/2,text:found.part.text,index:listeningIndexOf(found.block),start:found.part.start};
        }
        return null;
      });
      const other=await visibleOther();
      const cancels=await page.evaluate(()=>window.__speech.cancels);
      await page.mouse.click(other.x,other.y);
      await page.waitForFunction(()=>listeningWordSurfaceOpen());
      assert.ok(await page.evaluate(c=>window.__speech.cancels>c&&!listening.playing,cancels),'Word tap did not pause listening');
      await page.evaluate(()=>closePanel());
      await page.waitForFunction(p=>listening.playing&&window.__speech.spoken.at(-1).text===p,playing);
      // Long-press another sentence: menu with "여기서부터 듣기" on top, playback unmoved.
      const target=await visibleOther();
      await page.evaluate(async text=>{
        await dictPut(sentKey(text.replace(/\s+/g,' ').trim()),{ko:'그래서 앨리스는 데이지 화환을 만드는 즐거움이 일어나서 꽃을 따는 수고만큼 가치가 있을지 (더운 날씨 때문에 몹시 졸리고 멍했지만) 곰곰이 생각하고 있었어요. 그때 갑자기 분홍 눈의 흰 토끼가 바로 옆을 달려 지나갔어요.',done:true});
      },target.text);
      const countBefore=await page.evaluate(()=>window.__speech.spoken.length);
      await page.locator('#listen-hint').waitFor({state:'hidden',timeout:8000});
      await page.evaluate(()=>{window.__speechHold=true;});
      await page.mouse.move(target.x,target.y);await page.mouse.down();
      await page.waitForTimeout(900);await page.mouse.up();
      await page.locator('#ps-listen').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>document.querySelector('#ps-content').firstElementChild.id),'ps-listen');
      assert.equal(await page.evaluate(()=>window.__speech.spoken.length),countBefore,'Long-press alone moved playback');
      await page.waitForTimeout(300);
      await page.screenshot({path:resolve(out,`${engine.name()}-3-listen-from-here-menu.png`)});
      await page.evaluate(()=>{window.__speechHold=false;});
      await page.locator('#ps-listen').click();
      await page.waitForFunction(t=>window.__speech.spoken.at(-1).text===t,target.text);

      // Scroll away: auto-scroll pauses and "현재 위치로" appears; it jumps back.
      await page.evaluate(()=>{window.__speechHold=true;});
      await page.mouse.move(195,400);await page.mouse.wheel(0,2400);
      await page.locator('#listen-return').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>listening.follow),false);
      await page.screenshot({path:resolve(out,`${engine.name()}-4-return-to-position.png`)});
      await page.locator('#listen-return').click();
      await page.waitForFunction(()=>{const r=listeningRange(listening.sentence).getBoundingClientRect();return r.top>0&&r.bottom<innerHeight-80;});
      assert.equal(await page.locator('#listen-return').isVisible(),false);
      await page.evaluate(()=>{window.__speechHold=false;});

      // ✕ stops and remembers; reopening resumes there.
      const remembered=await current();
      await page.locator('#listen-close').click();
      assert.equal(await page.locator('#listen-bar').isVisible(),false);
      assert.equal(await page.locator('#listenfab').isVisible(),true);
      await page.evaluate(()=>readerScrollTo(0));
      await page.locator('#listenfab').click();
      assert.equal(await current(),remembered,'Reopening did not resume at the remembered sentence');
      // Leaving the reader stops it.
      await page.evaluate(()=>returnHomeFromReader());
      await page.waitForFunction(()=>!listening.active&&!document.body.classList.contains('reader-listening'));
      console.log(`${engine.name()}: listening walk-through passed`);
      await context.close();
    }finally{await browser.close();}
  }
}finally{server.close();}
