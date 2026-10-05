/* Real CSS timelines with PDF.js; synthetic edge delivery is not device latency evidence. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';

const root=process.env.BREEZE_QA_ROOT?resolve(process.env.BREEZE_QA_ROOT)+'/':fileURLToPath(new URL('../',import.meta.url));
const proof=process.env.BREEZE_SIDEBAR_PROOF||'/tmp/breeze-pdf-sidebar-motion';
const measureOnly=process.argv.includes('--measure-only');
mkdirSync(proof,{recursive:true});
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}`;
const reports=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const options={viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'};
  const browser=engine===webkit?await engine.launchPersistentContext('',{...options,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}):await engine.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
  try{
    const context=engine===webkit?browser:await browser.newContext(options);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
    await page.goto(url);await page.evaluate(()=>homeReady);
    await page.locator('#fileinput').setInputFiles({name:'Sidebar.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
    await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
    await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});
    await page.waitForSelector('.pdf-source-page canvas');
    await page.waitForFunction(()=>!readerPositionPending());
    await page.waitForTimeout(500);
    await page.evaluate(()=>{
      const control=document.getElementById('pdf-page-control'),panel=document.getElementById('pdf-page-navigation');
      let pending=null,touch=null,id=700;
      window.qaSidebarArm=route=>{window.qaSidebarResult=null;pending=route;};
      const record=()=>{
        if(!pending)return;
        const route=pending;pending=null;
        const start=performance.now(),samples=[],trajectory=[];
        const read=()=>{
          const css=getComputedStyle(control),inner=getComputedStyle(panel);
          const animation=control.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
          return {ms:performance.now()-start,timelineMs:animation?.currentTime??null,
            x:new DOMMatrixReadOnly(css.transform).m41,opacity:+css.opacity,contentOpacity:+inner.opacity,
            width:control.getBoundingClientRect().width,height:control.getBoundingClientRect().height,
            panelHidden:panel.hidden,inert:panel.inert,
            name:animation?.animationName??null,duration:animation?.effect.getTiming().duration??null,
            easing:animation?.effect.getKeyframes()[0].easing??null};
        };
        const sample=()=>{
          samples.push(read());
          if(performance.now()-start<320)requestAnimationFrame(sample);
          else window.qaSidebarResult={route,samples,trajectory};
        };
        // Run after the complete input dispatch, including its actual handler.
        // A headless renderer can omit all intermediate rAF frames. Check the real
        // effect at fixed timeline positions too, without treating seeks as latency.
        setTimeout(()=>{
          const animation=control.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
          if(animation){
            const time=animation.currentTime,state=animation.playState;
            animation.pause();
            for(const ms of [0,55,110,165,220]){
              animation.currentTime=ms;trajectory.push({...read(),seekMs:ms});
            }
            animation.currentTime=time??0;
            if(state!=='paused')animation.play();
          }
          requestAnimationFrame(sample);
        },0);
      };
      document.addEventListener('click',event=>{
        if(event.target.closest('#pdf-page-button,#pdf-navigation-toggle'))record();
      },true);
      document.addEventListener('pointerup',()=>{if(pending==='body-tap')record();},true);
      document.addEventListener('keydown',event=>{if(event.key==='Escape')record();},true);
      document.addEventListener('touchend',()=>{if(pending?.endsWith('edge-open'))record();},true);
      const send=(type,live,changed)=>{
        const event=new Event(type,{bubbles:true,cancelable:true});
        Object.defineProperties(event,{touches:{value:live},changedTouches:{value:changed}});
        changed[0].target.dispatchEvent(event);return event.defaultPrevented;
      };
      window.qaSidebarEdge={
        start(){touch={identifier:++id,target:document.getElementById('original-stage'),touchType:'direct',clientX:12,clientY:170};send('touchstart',[touch],[touch]);},
        move(x=110,y=170){touch={...touch,clientX:x,clientY:y};return send('touchmove',[touch],[touch]);},
        end(cancel=false){send(cancel?'touchcancel':'touchend',[],[touch]);touch=null;},
        extra(){const other={...touch,identifier:++id,target:document.getElementById('aafab')};send('touchstart',[touch,other],[other]);send('touchend',[touch],[other]);}
      };
    });
    const closed=async()=>{await page.waitForFunction(()=>!pdfNavigation&&!pdfNavigationCloseTimer);};
    const settled=async()=>{await page.waitForFunction(()=>!!pdfNavigation);await page.evaluate(async()=>{await Promise.allSettled(document.getElementById('pdf-page-control').getAnimations().map(a=>a.finished));});};
    for(const variant of ['baseline','snapshot'])for(const frozen of [false,true])for(const delay of [35,90,170]){
      await page.evaluate(variant=>{
        window.originalMotionStart ||= setPdfNavigationMotionStart;
        setPdfNavigationMotionStart=variant==='baseline'?originalMotionStart:function(opening){
          const control=document.getElementById('pdf-page-control');
          const current=!opening||control.classList.contains('pdf-navigation-closing');
          const style=current?getComputedStyle(control):null;
          const opacity=style?style.opacity:'0',x=style?`${new DOMMatrixReadOnly(style.transform).m41}px`:'-12px';
          control.style.setProperty('--pdf-sidebar-start-opacity',opacity);
          control.style.setProperty('--pdf-sidebar-start-x',x);
        };
        closePdfNavigation({release:true});
      },variant);
      await closed();
      await page.evaluate(()=>togglePdfNavigation());await page.waitForTimeout(delay);
      const closeJump=await page.evaluate(({frozen,delay})=>{
        const c=document.getElementById('pdf-page-control');
        const anim=()=>c.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
        const read=()=>{const s=getComputedStyle(c),a=anim();return {x:new DOMMatrixReadOnly(s.transform).m41,opacity:+s.opacity,time:a?.currentTime,state:a?.playState,name:a?.animationName,startX:c.style.getPropertyValue('--pdf-sidebar-start-x'),startOpacity:c.style.getPropertyValue('--pdf-sidebar-start-opacity')};};
        if(frozen){const a=anim();a.pause();a.currentTime=delay;}
        const before=read();closePdfNavigation();const immediate=read();
        if(frozen){const a=anim();a.pause();a.currentTime=0;}
        return {before,immediate,after:read()};
      },{frozen,delay});
      await page.waitForTimeout(frozen?0:delay);
      const openJump=await page.evaluate(({frozen,delay})=>{
        const c=document.getElementById('pdf-page-control');
        const anim=()=>c.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
        const read=()=>{const s=getComputedStyle(c),a=anim();return {x:new DOMMatrixReadOnly(s.transform).m41,opacity:+s.opacity,time:a?.currentTime,state:a?.playState,name:a?.animationName,startX:c.style.getPropertyValue('--pdf-sidebar-start-x'),startOpacity:c.style.getPropertyValue('--pdf-sidebar-start-opacity')};};
        if(frozen){const a=anim();if(a){a.pause();a.currentTime=delay;}}
        const before=read();togglePdfNavigation();const immediate=read();
        if(frozen){const a=anim();a.pause();a.currentTime=0;}
        const after=read();if(frozen)anim().play();return {before,immediate,after};
      },{frozen,delay});
      const report={engine:engine.name(),variant,frozen,delay,closeJump,openJump};reports.push(report);console.log(JSON.stringify(report));
      await page.waitForTimeout(280);await page.evaluate(()=>closePdfNavigation());await closed();
    }
  }finally{await browser.close();}
}}finally{writeFileSync(resolve(proof,'reversal-diagnostic.json'),JSON.stringify(reports,null,2));await new Promise(done=>server.close(done));}
