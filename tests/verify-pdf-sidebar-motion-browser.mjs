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
    const measure=async route=>{
      await page.evaluate(route=>qaSidebarArm(route),route);
      if(route==='button-open')await page.locator('#pdf-page-button').tap();
      if(route==='close-button')await page.locator('#pdf-navigation-toggle').tap();
      if(route==='body-tap')await page.touchscreen.tap(300,180);
      if(route==='escape')await page.keyboard.press('Escape');
      if(route==='edge-open'){
        await page.evaluate(()=>{qaSidebarEdge.start();qaSidebarEdge.move();});
        const start=Date.now();await page.waitForTimeout(180);
        assert.equal(await page.evaluate(()=>!!pdfNavigation),false,'Holding the edge contact never starts a timed sidebar animation');
        await page.evaluate(()=>qaSidebarEdge.end());
        reports.push({engine:engine.name(),kind:'contact',heldMs:Date.now()-start,note:'Synthetic contact duration, excluded from settlement timing'});
      }
      if(route==='trusted-edge-open'){
        const cdp=await context.newCDPSession(page);
        try{
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:12,y:170,id:1}]});
          await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:110,y:170,id:1}]});
          const start=Date.now();await page.waitForTimeout(180);
          assert.equal(await page.evaluate(()=>!!pdfNavigation),false,'Trusted edge contact starts no sidebar motion before release');
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          reports.push({engine:engine.name(),kind:'contact',heldMs:Date.now()-start,note:'Trusted Chromium CDP contact duration, excluded from settlement timing'});
        }finally{await cdp.detach();}
      }
      await page.waitForFunction(()=>window.qaSidebarResult);
      const result=await page.evaluate(()=>qaSidebarResult);
      // Persist a failing route too; a following engine must not erase its proof.
      reports.push({engine:engine.name(),kind:'raw-route-capture',...result});
      const opening=route.endsWith('open'),animated=result.trajectory.find(s=>s.name)||result.samples.find(s=>s.name);
      assert.ok(animated,'A real sidebar CSS animation must be sampled');
      assert.equal(animated.duration,220);
      assert.ok(result.trajectory.some(s=>s.x>-11.8&&s.x<-.2),'Intermediate translation must be observed');
      assert.equal(result.trajectory.length,5,'Every real input route exposes a seekable CSS effect');
      assert.ok(result.trajectory.every(s=>s.x>=-12.001&&s.x<=.001),'Real effect remains within its 12px travel');
      assert.ok(result.trajectory.every((s,i,a)=>!i||(opening?s.x>=a[i-1].x:s.x<=a[i-1].x)),'Real effect travels in the requested direction');
      if(!measureOnly){
        assert.equal(animated.easing,'cubic-bezier(0.45, 0, 0.8, 0.35)');
        assert.ok([...result.samples,...result.trajectory].filter(s=>!s.panelHidden).every(s=>s.contentOpacity===1),'One opacity owner, including navigation contents');
      }
      const crossed=p=>{
        const index=result.samples.findIndex(s=>(opening?1+s.x/12:-s.x/12)>=p);
        return index<0?null:[index?result.samples[index-1].ms:0,result.samples[index].ms];
      };
      const halfIndex=result.samples.findIndex(s=>(opening?1+s.x/12:-s.x/12)>=.5);
      const summary={engine:engine.name(),route,viewport:page.viewportSize(),duration:animated.duration,easing:animated.easing,
        firstFrameMs:result.samples[0].ms,halfTravelMs:crossed(.5),ninetyTravelMs:crossed(.9),
        halfTravelTimelineMs:halfIndex<0?null:[result.samples[halfIndex-1]?.timelineMs??0,result.samples[halfIndex].timelineMs],
        finishedFrameMs:result.samples.find(s=>opening?s.x===0:s.panelHidden)?.ms??null,
        observedIntermediateFrames:result.samples.filter(s=>s.x>-11.8&&s.x<-.2).length,
        capture:'Real effect seek, restored playback; diagnostic frame brackets, not untouched latency'};
      console.log(JSON.stringify(summary));reports.push({...summary,samples:result.samples});
      if(opening)await settled();else await closed();
    };
    for(let trial=0;trial<3;trial++){
      await measure('button-open');await measure('close-button');
      await measure('edge-open');await measure(trial===1?'escape':'body-tap');
    }
    if(engine===chromium)for(let trial=0;trial<3;trial++){
      await measure('trusted-edge-open');await measure('close-button');
    }
    if(!measureOnly){
      const trajectory=await page.evaluate(()=>{
        const control=document.getElementById('pdf-page-control');
        const seek=()=>{
          getComputedStyle(control).transform;
          const animation=control.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
          animation.pause();
          return [0,55,110,165,220].map(ms=>{
            animation.currentTime=ms;const css=getComputedStyle(control);
            return {ms,x:new DOMMatrixReadOnly(css.transform).m41,opacity:+css.opacity,width:control.getBoundingClientRect().width};
          });
        };
        togglePdfNavigation();const opening=seek();closePdfNavigation();const closing=seek();
        return {opening,closing};
      });
      for(let i=0;i<trajectory.opening.length;i++){
        const open=trajectory.opening[i],close=trajectory.closing[i];
        assert.ok(Math.abs(open.x+close.x+12)<.001,'Equal normalized travel at '+open.ms+'ms');
        assert.ok(Math.abs(open.opacity+close.opacity-1)<.001,'Equal normalized opacity at '+open.ms+'ms');
        assert.equal(open.width,close.width);
      }
      reports.push({engine:engine.name(),kind:'seeked-browser-trajectory',...trajectory});
      await closed();
      // Compare the exact handoff frame, not two samples of an advancing clock.
      // WebKit can advance between synchronous style reads; keep the strict
      // no-jump assertion by seeking the outgoing effect and the new frame zero.
      for(const delay of [35,90,170]){
        await page.evaluate(()=>togglePdfNavigation());await page.waitForTimeout(delay);
        const closeJump=await page.evaluate(delay=>{
          const control=document.getElementById('pdf-page-control');
          const read=()=>{const css=getComputedStyle(control);return {x:new DOMMatrixReadOnly(css.transform).m41,opacity:+css.opacity};};
          const animation=()=>control.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
          const outgoing=animation();outgoing.pause();outgoing.currentTime=delay;
          const before=read();closePdfNavigation();
          const incoming=animation();incoming.pause();incoming.currentTime=0;
          const after=read();incoming.play();return {before,after};
        },delay);
        reports.push({engine:engine.name(),kind:'closing-handoff',delayMs:delay,...closeJump});
        assert.ok(Math.abs(closeJump.before.x-closeJump.after.x)<.001&&Math.abs(closeJump.before.opacity-closeJump.after.opacity)<.001,'Closing during entry must start at the rendered frame');
        await page.waitForTimeout(delay);
        const openJump=await page.evaluate(delay=>{
          const control=document.getElementById('pdf-page-control');
          const read=()=>{const css=getComputedStyle(control);return {x:new DOMMatrixReadOnly(css.transform).m41,opacity:+css.opacity};};
          const animation=()=>control.getAnimations().find(a=>a.animationName?.startsWith('pdf-sidebar-'));
          const outgoing=animation();outgoing.pause();outgoing.currentTime=delay;
          const before=read();togglePdfNavigation();
          const incoming=animation();incoming.pause();incoming.currentTime=0;
          const after=read();incoming.play();return {before,after};
        },delay);
        reports.push({engine:engine.name(),kind:'reopening-handoff',delayMs:delay,...openJump});
        assert.ok(Math.abs(openJump.before.x-openJump.after.x)<.001&&Math.abs(openJump.before.opacity-openJump.after.opacity)<.001,'Reopening during exit must start at the rendered frame');
        reports.push({engine:engine.name(),kind:'interruption',delayMs:delay,closeJump,openJump});
        await page.waitForTimeout(280);
        assert.equal(await page.evaluate(()=>!!pdfNavigation&&!document.getElementById('pdf-page-navigation').hidden&&!document.getElementById('pdf-page-navigation').inert),true,'Old close cleanup must not hide a reopened sidebar');
        await page.evaluate(()=>closePdfNavigation());await closed();
      }
      for(let i=0;i<12;i++){await page.evaluate(()=>togglePdfNavigation());await page.waitForTimeout(15);}
      await closed();
      assert.equal(await page.locator('#pdf-navigation-dismiss').count(),0,'Paper has no input-blocking backdrop');
      assert.equal(await page.evaluate(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')),'false');

      // Short/cancelled/vertical/extra-contact input, zoom pan and resize keep their owners.
      for(const kind of ['short','cancel','vertical','extra','zoom','resize']){
        if(kind==='zoom'){await page.evaluate(()=>setOriginalZoom(1.5));await page.waitForTimeout(350);}
        await page.evaluate(kind=>{qaSidebarEdge.start();qaSidebarEdge.move(kind==='short'?40:110,kind==='vertical'?300:170);if(kind==='extra')qaSidebarEdge.extra();},kind);
        if(kind==='resize'){await page.setViewportSize({width:400,height:844});await page.waitForTimeout(100);}
        await page.evaluate(kind=>qaSidebarEdge.end(kind==='cancel'),kind);
        assert.equal(await page.evaluate(()=>!!pdfNavigation),false,kind+' cannot open navigation');
        if(kind==='zoom'){await page.evaluate(()=>setOriginalZoom(1));await page.waitForTimeout(350);}
      }
      for(const [width,height] of [[320,568],[390,844],[650,600],[760,900],[761,900],[820,1180],[1440,900],[844,390]])for(const dark of [false,true]){
        await page.setViewportSize({width,height});await page.evaluate(d=>{darkMode=d;applyDark();expandReaderChrome();},dark);await page.waitForTimeout(350);
        const before=await page.locator('.pdf-source-page').first().boundingBox();
        await page.locator('#pdf-page-button').tap();await settled();
        const rect=await page.locator('#pdf-page-control').boundingBox(),after=await page.locator('.pdf-source-page').first().boundingBox();
        assert.ok(Math.abs(rect.x)<1&&rect.width>=144&&rect.width<=184&&rect.y>=-1&&rect.y+rect.height<=height+1,JSON.stringify({width,height,dark,rect}));
        assert.ok(Math.abs(before.width-after.width)<1&&Math.abs(before.x-after.x)<1,'Opening never reflows paper');
        await page.screenshot({path:resolve(proof,`${engine.name()}-${width}-${height}-${dark?'dark':'light'}.png`)});
        await page.locator('#pdf-navigation-toggle').tap();await closed();
      }
      // Resize during each direction must not leave stale inert/closing state.
      for(const opening of [true,false]){
        if(!opening){await page.evaluate(()=>togglePdfNavigation());await settled();}
        await page.evaluate(open=>open?togglePdfNavigation():closePdfNavigation(),opening);
        await page.waitForTimeout(65);await page.setViewportSize({width:820,height:600});await page.waitForTimeout(350);
        if(opening){await settled();await page.evaluate(()=>closePdfNavigation());}await closed();
        await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);
      }
      await page.emulateMedia({reducedMotion:'reduce'});
      const reduced=await page.evaluate(()=>{
        togglePdfNavigation();const control=document.getElementById('pdf-page-control'),panel=document.getElementById('pdf-page-navigation');
        const open={animations:control.getAnimations().length,opacity:getComputedStyle(control).opacity,transform:getComputedStyle(control).transform};
        closePdfNavigation();return {open,closed:panel.hidden,timer:pdfNavigationCloseTimer,closing:control.classList.contains('pdf-navigation-closing')};
      });
      assert.deepEqual(reduced,{open:{animations:0,opacity:'1',transform:'none'},closed:true,timer:null,closing:false});
      reports.push({engine:engine.name(),checks:'interruption, repeated toggle, ownership, zoom, resize, 16 viewport/theme states, reduced motion passed'});
    }
    assert.deepEqual(errors,[]);
    reports.push({engine:engine.name(),browserVersion:context.browser()?.version()||'persistent context',pageErrors:errors});
    console.log(engine.name()+': PDF sidebar frame measurements'+(measureOnly?' recorded':' and focused motion regressions passed'));
  }finally{await browser.close();}
}}finally{
  writeFileSync(resolve(proof,'measurements.json'),JSON.stringify(reports,null,2));
  await new Promise(done=>server.close(done));
}
