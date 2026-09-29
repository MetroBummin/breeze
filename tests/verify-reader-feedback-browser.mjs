/* The app's real renderers and both browser engines; synthetic fixtures are not
   a physical iPhone/iPad visual or Pencil performance sign-off. */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!p.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const output=process.env.BREEZE_QA_OUTPUT;if(output)mkdirSync(output,{recursive:true});
try{
  for(const engine of [chromium,webkit]){
    const browser=await engine.launch();
    try{
      const page=await browser.newPage({viewport:{width:820,height:900},serviceWorkers:'block'}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
      await page.goto(url);await page.evaluate(()=>homeReady);
      // No AI, imports or device data. Keep all material fixtures in the app.
      await page.evaluate(async()=>{
        document.getElementById('app').hidden=true;
        const host=document.createElement('section');host.id='feedback-fixture';
        host.style.cssText='margin:60px auto;padding:32px;width:640px;max-width:90%;font:24px/2.1 Georgia;background:var(--source-page);color:var(--sentence-glass-ink);';
        host.innerHTML='<p id="fixture-text">Read the <span class="w sel">signal</span> without an empty popup.</p>'+
          '<div id="fixture-pdf" class="pdf-source-page" data-page="1" style="height:160px"><span style="position:absolute;left:10%;top:30%;font:24px/1 Georgia">signal</span></div>'+
          '<iframe id="fixture-epub" style="width:100%;height:160px;border:0" sandbox="allow-same-origin"></iframe>';
        document.body.appendChild(host);
        const frame=document.getElementById('fixture-epub');
        await new Promise(resolve=>{frame.onload=resolve;frame.srcdoc='<html><head><style>*{animation:none!important}body{margin:30px;font:24px/2 Georgia}</style></head><body><p>Read the signal.</p></body></html>';});
        const d=frame.contentDocument,p=d.querySelector('p'),range=d.createRange();
        range.setStart(p.firstChild,9);range.setEnd(p.firstChild,15);
        words.signal={word:'signal',ko:'신호',status:1,mark:true,forms:['signal'],addedAt:1,up:1};
        renderEpubSavedWordHighlights(d);
        const open=openWord;openWord=(_k,node)=>{window.fixtureEpub=node;};
        try{openOriginalRange(d,range,'signal',p,range.getBoundingClientRect());}finally{openWord=open;}
        window.fixturePdfSaved=makePdfWordMarker(document.getElementById('fixture-pdf'),
          {word:'signal',x:.1,y:.3,w:.13,h:.2},'original-saved-marker',1,'signal');
        window.fixturePdf=makePdfWordMarker(document.getElementById('fixture-pdf'),
          {word:'signal',x:.1,y:.3,w:.13,h:.2},'original-selection-marker',1,'signal');
        window.fixtureNodes=[document.querySelector('#fixture-text .w'),fixturePdf,fixtureEpub];
      });
      // A ready/saved lookup still owns the selection paint until dismissal.
      for(const format of ['pdf','epub']){
        const hidden=await page.evaluate(format=>{
          const node=format==='pdf'?fixturePdf:fixtureEpub;
          wordLookupFeedback.start(10,format);
          wordLookupFeedback.present(10,node,{loading:false,text:'신호'},true);
          return format==='pdf'?fixturePdfSaved.style.visibility==='hidden':
            epubSavedHighlightCache.get(node.ownerDocument).highlights.every(h=>h.size===0);
        },format);
        assert.equal(hidden,true,`${format}: ready saved lookup doubles the saved paint`);
        await page.evaluate(()=>wordLookupFeedback.end(10));
      }
      const repaint=await page.evaluate(()=>{
        const doc=fixtureEpub.ownerDocument,counts=()=>epubSavedHighlightCache.get(doc).highlights.map(h=>h.size);
        const result={};
        // New word saving rebuilds the live highlights during an unresolved lookup.
        delete words.signal;renderEpubSavedWordHighlights(doc);
        wordLookupFeedback.start(11,'epub');
        wordLookupFeedback.present(11,fixtureEpub,{loading:true,text:''},false);
        words.signal={word:'signal',ko:'신호',status:1,mark:true,forms:['signal'],addedAt:1,up:1};
        renderEpubSavedWordHighlights(doc);result.savedWhilePending=counts();
        wordLookupFeedback.present(11,fixtureEpub,{loading:false,text:'신호'},true);
        result.ready=counts();
        words.signal.status=2;refreshEpubSavedWords({frames:[{contentDocument:doc}]},'signal');
        result.recolored=counts();wordLookupFeedback.end(11);result.closed=counts();
        // Never resurrect a deleted or disabled saved range on close.
        wordLookupFeedback.start(12,'epub');wordLookupFeedback.present(12,fixtureEpub,{loading:false,text:'신호'},true);
        words.signal.mark=false;refreshEpubSavedWords({frames:[{contentDocument:doc}]},'signal');
        wordLookupFeedback.end(12);result.disabled=counts();
        words.signal.mark=true;renderEpubSavedWordHighlights(doc);
        wordLookupFeedback.start(13,'epub');wordLookupFeedback.present(13,fixtureEpub,{loading:false,text:'신호'},true);
        delete words.signal;renderEpubSavedWordHighlights(doc);wordLookupFeedback.end(13);result.deleted=counts();
        words.signal={word:'signal',ko:'신호',status:1,mark:true,forms:['signal'],addedAt:1,up:1};
        renderEpubSavedWordHighlights(doc);
        // Exercise the actual PDF renderer, not a manual style update.
        const page=document.getElementById('fixture-pdf'),oldSession=originalSession,oldBook=curBook;
        const boxes=[{word:'signal',x:.1,y:.3,w:.13,h:.2},{word:'signal',x:.5,y:.3,w:.13,h:.2}];
        try{
          curBook={id:'paint-fixture'};
          originalSession={kind:'pdf',bookId:curBook.id,loadToken:originalLoadToken,pages:[page],wordBoxes:new Map([[1,boxes]])};
          wordLookupFeedback.start(14,'pdf');wordLookupFeedback.present(14,fixturePdf,{loading:true,text:''},false);
          renderPdfSavedWordMarkers(page,boxes);
          const markers=()=>[...page.querySelectorAll('.original-saved-marker')].map(n=>n.style.visibility);
          result.pdfPending=markers();
          wordLookupFeedback.present(14,fixturePdf,{loading:false,text:'신호'},true);
          renderPdfSavedWordMarkers(page,boxes);result.pdfReady=markers();
          wordLookupFeedback.end(14);result.pdfClosed=markers();
          fixturePdfSaved=page.querySelector('.original-saved-marker');
        }finally{originalSession=oldSession;curBook=oldBook;}
        return result;
      });
      for(const name of ['savedWhilePending','ready','recolored','disabled','deleted'])assert.deepEqual(repaint[name],[0,0,0],name);
      assert.deepEqual(repaint.closed,[0,1,0],'dismissal restores latest status only');
      assert.deepEqual(repaint.pdfPending,['hidden',''],'PDF pending rebuild preserves other occurrence');
      assert.deepEqual(repaint.pdfReady,['hidden',''],'PDF ready rebuild preserves selection ownership');
      assert.deepEqual(repaint.pdfClosed,['',''],'PDF dismissal restores saved paint');
      for(const dark of [false,true]){
        await page.evaluate(dark=>{
          document.body.classList.toggle('dark',dark);document.documentElement.classList.toggle('dark',dark);
          const d=document.getElementById('fixture-epub').contentDocument;
          d.body.style.color=getComputedStyle(document.body).getPropertyValue('--sentence-glass-ink');
          d.body.style.background=getComputedStyle(document.body).getPropertyValue('--source-page');
        },dark);
        for(const [i,format] of ['text','pdf','epub'].entries()){
          const result=await page.evaluate(({i,format})=>{
            const node=fixtureNodes[i],box=()=>{const r=node.getBoundingClientRect();return [r.x,r.y,r.width,r.height];};
            const before=box();wordLookupFeedback.start(i+20,format);
            wordLookupFeedback.present(i+20,node,{loading:true,text:'뜻 찾는 중'},false);
            const css=node.ownerDocument.defaultView.getComputedStyle(node);
            const epubCache=format==='epub'?epubSavedHighlightCache.get(node.ownerDocument):null;
            return {before,after:box(),radius:css.borderRadius,animation:css.animationName,
              busy:node.getAttribute('aria-busy'),background:css.backgroundImage,
              savedUnderlay:format==='pdf'?fixturePdfSaved.style.visibility:(format==='epub'?epubCache.highlights[0].size:null),
              ink:css.getPropertyValue('--breeze-lookup-ink').trim(),expected:getComputedStyle(document.body).getPropertyValue('--sentence-glass-ink').trim()};
          },{i,format});
          assert.deepEqual(result.after,result.before,`${format} shimmer changed geometry`);
          assert.equal(result.radius,'5px');assert.equal(result.animation,'breeze-word-sheen');
          assert.equal(result.busy,'true');assert.equal(result.ink,result.expected);
          if(format==='pdf')assert.equal(result.savedUnderlay,'hidden','pending PDF mixed saved and lookup colors');
          if(format==='epub')assert.equal(result.savedUnderlay,0,'pending EPUB mixed saved and lookup colors');
          assert.match(result.background,/linear-gradient/);
          if(output){await page.waitForTimeout(400);await page.screenshot({path:resolve(output,`${engine.name()}-${format}-${dark?'dark':'light'}.png`)});}
          await page.emulateMedia({reducedMotion:'reduce'});
          assert.equal(await page.evaluate(i=>fixtureNodes[i].ownerDocument.defaultView.getComputedStyle(fixtureNodes[i]).animationName,i),'none');
          await page.emulateMedia({reducedMotion:'no-preference'});
          await page.evaluate(i=>{wordLookupFeedback.end(i+20);},i);
          if(format==='pdf')assert.equal(await page.evaluate(()=>fixturePdfSaved.style.visibility),'','PDF saved color was not restored');
          if(format==='epub')assert.equal(await page.evaluate(()=>epubSavedHighlightCache.get(fixtureEpub.ownerDocument).highlights[0].size),1,'EPUB saved color was not restored');
        }
      }
      // Pending survives user scroll. A visible target gets a freshly anchored
      // result pill; an off-screen target saves silently and never pops stale UI.
      await page.evaluate(()=>{
        curBook={id:'fixture',title:'not logged',paras:['Read the signal.']};
        words.signal={word:'signal',ko:'',loading:true,status:1,defs:[]};
        selectWord('signal',fixtureNodes[0],true);
      });
      assert.equal(await page.locator('#word-peek').getAttribute('hidden')!==null,true);
      const pendingLife=await page.evaluate(()=>wordLookupLife);
      await page.evaluate(()=>scrollGesture());
      assert.equal(await page.evaluate(()=>wordLookupLife),pendingLife,'scroll ended pending lookup lifetime');
      assert.equal(await page.evaluate(()=>wordPeekOpen()),true);
      assert.equal(await page.locator('.breeze-lookup-pending').count(),1);
      await page.evaluate(()=>expandWordDetail());assert.equal(await page.evaluate(()=>wordPanelOpen()),false);
      await page.evaluate(()=>{words.signal.loading=false;words.signal.ko='신호';renderWordPeek();});
      await page.waitForFunction(()=>!document.getElementById('word-peek').hidden);
      assert.equal(await page.locator('#word-peek').getAttribute('hidden'),null);
      await page.evaluate(()=>closePanel());

      await page.evaluate(()=>{
        words.drift={word:'drift',ko:'',loading:true,status:1,defs:[]};
        document.getElementById('feedback-fixture').style.transform='translateY(0)';
        selectWord('drift',fixtureNodes[0],true);
        document.getElementById('feedback-fixture').style.transform='translateY(-2200px)';
        scrollGesture();
      });
      const driftLife=await page.evaluate(()=>wordLookupLife);
      await page.evaluate(()=>{words.drift.loading=false;words.drift.ko='표류';renderWordPeek();});
      await page.waitForFunction(life=>wordLookupLife!==life,driftLife);
      assert.equal(await page.evaluate(()=>words.drift&&words.drift.ko),'표류','off-screen success was discarded');
      assert.equal(await page.evaluate(()=>wordPeekOpen()),false,'off-screen result left a stale lookup surface');
      assert.equal(await page.locator('#word-peek').getAttribute('hidden')!==null,true);
      await page.evaluate(()=>{
        document.getElementById('feedback-fixture').style.transform='';
        document.getElementById('app').hidden=false;
      });
      assert.equal(await page.locator('.breeze-lookup-pending').count(),0);
      assert.deepEqual(errors,[]);
      console.log(engine.name()+': neutral sheen, scroll-continuous single lookup, visible re-anchor and off-screen silent save passed');
    }finally{await browser.close();}
  }
}finally{await new Promise(done=>server.close(done));}
