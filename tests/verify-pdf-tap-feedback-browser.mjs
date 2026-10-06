/* A browser regression for the Reader's native touch-feedback contract.
 * Chromium touch emulation is not physical Android compositor/palm proof.
 */
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.BREEZE_TAP_PROOF||'/tmp/breeze-pdf-tap-feedback';
const engine=process.env.BREEZE_QA_ENGINE==='webkit'?webkit:chromium;
const baseline=process.env.BREEZE_TAP_BASELINE==='1';
const baselineCss=process.env.BREEZE_TAP_READER_CSS;
mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html');
  const path=resolve(root,'.'+pathname);
  try{
    if(!path.startsWith(root))throw Error('Outside fixture');
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');
    res.end(readFileSync(pathname==='/styles/reader.css'&&baselineCss?baselineCss:path));
  }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`,reports=[];
const browser=await engine.launch({headless:true});
const transparent=value=>/rgba\(0,\s*0,\s*0,\s*0\)/.test(value);
try{
  for(const viewport of [{width:390,height:844},{width:820,height:1180},{width:1440,height:900},{width:844,height:390}]){
    for(const dark of [false,true]){
      const name=`${engine.name()}-${viewport.width}x${viewport.height}-${dark?'dark':'light'}-${baseline?'baseline':'fixed'}`;
      const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,deviceScaleFactor:1,serviceWorkers:'block'});
      const page=await context.newPage(),errors=[];page.setDefaultTimeout(25000);
      page.on('pageerror',error=>errors.push(error.message));
      try{
        await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
        await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
        await page.goto(url);await page.evaluate(()=>homeReady);
        await page.locator('#fileinput').setInputFiles({name:'tap-feedback.pdf',mimeType:'application/pdf',buffer:fixturePdf(3)});
        await page.waitForFunction(()=>books.some(book=>book.kind==='pdf'));
        await page.evaluate(async dark=>{
          darkMode=dark;applyDark();
          await openBook(books.find(book=>book.kind==='pdf'));
          if(currentReaderMode!=='original')await switchReaderMode('original');
        },dark);
        await page.waitForFunction(()=>!readerPositionPending());
        // Existing original-mode anchor restoration owns these scheduled reads.
        await page.waitForTimeout(1100);
        await page.evaluate(async()=>{await renderOriginalPdfPage(originalSession,1);await prepareOriginalPdfPage(originalSession,1);});
        await page.waitForFunction(()=>originalSession.wordBoxes.get(1)?.length>0);
        const state=await page.evaluate(()=>{
          const paper=document.querySelector('.pdf-source-page'),canvas=paper.querySelector('canvas');
          const bounds=paper.getBoundingClientRect();
          return {paperColor:getComputedStyle(paper).webkitTapHighlightColor,
            canvasColor:getComputedStyle(canvas).webkitTapHighlightColor,
            cursor:getComputedStyle(paper).cursor,paper:bounds.toJSON(),
            inkFlag:window.breezeInkIPad??null,inkControl:!!document.querySelector('[data-ink-toggle]')};
        });
        assert.equal(transparent(state.paperColor),!baseline,`${name}: whole paper tap feedback`);
        assert.equal(transparent(state.canvasColor),!baseline,`${name}: inherited canvas tap feedback`);
        assert.equal(state.cursor,'pointer','Preserve mouse affordance');
        assert.equal(state.inkFlag,null,'This fixture must not impersonate native iPad');
        const point=await page.evaluate(()=>{
          const paper=originalSession.pages[0],rect=paper.getBoundingClientRect();
          const box=originalSession.wordBoxes.get(1).find(box=>box.word.toLowerCase()==='stable');
          if(!box)throw Error('Missing fixture word');
          const key=keyOf(box.word);
          words[key]={word:key,clicked:box.word,forms:[key],ko:'안정적인',phon:'',defs:[],example:box.example,
            book:curBook.title,status:1,mark:true,addedAt:Date.now(),up:Date.now()};
          return {x:rect.left+(box.x+box.w/2)*rect.width,y:rect.top+(box.y+box.h/2)*rect.height};
        });
        await page.touchscreen.tap(point.x,point.y);
        await page.waitForFunction(()=>!document.querySelector('#word-peek').hidden);
        const lookup=await page.evaluate(()=>({
          selection:[...document.querySelectorAll('.original-selection-marker')].map(node=>node.getBoundingClientRect().toJSON()),
          nativeSelection:document.getSelection().toString(),
          modal:getComputedStyle(document.querySelector('#word-modal-scrim')).display,
          pending:document.querySelectorAll('.breeze-lookup-pending').length
        }));
        assert.equal(lookup.selection.length,1,'One exact selected occurrence');
        assert(lookup.selection[0].width<viewport.width/2&&lookup.selection[0].height<60,'Selection stays word-sized');
        assert.equal(lookup.nativeSelection,'');assert.equal(lookup.modal,'none');
        await page.screenshot({path:resolve(output,`${name}-lookup.png`)});
        await page.evaluate(()=>closePanel());
        if(engine===chromium){
          const cdp=await context.newCDPSession(page);
          const x=Math.min(viewport.width-40,state.paper.x+state.paper.width/2),y=Math.min(viewport.height-100,250);
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,radiusX:4,radiusY:4,force:1}]});
          await page.waitForTimeout(120);
          await page.screenshot({path:resolve(output,`${name}-held-contact.png`)});
          for(let dy=20;dy<=100;dy+=20){
            await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-dy,radiusX:4,radiusY:4,force:1}]});
            await page.waitForTimeout(20);
          }
          await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
          await page.waitForTimeout(350);
          const scroll=await page.evaluate(()=>({top:readerScrollTop(),decision:lastGesture?.decision,
            peek:!document.querySelector('#word-peek').hidden,pending:document.querySelectorAll('.breeze-lookup-pending').length}));
          assert(scroll.top>0,'Finger movement still scrolls');
          assert(['SCROLL','CANCEL'].includes(scroll.decision),'Movement is not a word tap');
          assert.equal(scroll.peek,false);assert.equal(scroll.pending,0);
          state.scroll=scroll;
          await page.screenshot({path:resolve(output,`${name}-after-scroll.png`)});
          await cdp.detach();
        }
        reports.push({name,state,lookup,errors});
        assert.deepEqual(errors,[],`${name}: page errors`);
        console.log('PASS',name,JSON.stringify(state));
      }finally{await context.close();}
    }
  }
}finally{
  writeFileSync(resolve(output,`${engine.name()}-${baseline?'baseline':'fixed'}.json`),JSON.stringify(reports,null,2)+'\n');
  await browser.close();server.close();
}
