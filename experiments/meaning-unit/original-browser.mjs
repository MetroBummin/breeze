import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {createRequire} from 'node:module';
import {originalChoiceFixture,originalChoiceGold} from './original-fixture.mjs';

const require=createRequire(import.meta.url);
const playwright=process.env.PLAYWRIGHT_MODULE?await import(process.env.PLAYWRIGHT_MODULE):require('playwright');
const root=path.resolve(new URL('../../',import.meta.url).pathname);
const output=new URL('./artifacts/',import.meta.url);
const report={synthetic:true,provider:'full-target stub, not AI selection accuracy',coordinateProbes:true,extractions:[],runs:[],rejections:[],engineDiagnostics:[],blocked:[]};
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.woff2':'font/woff2'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
try {
  for(const engine of ['chromium','webkit']) {
    let context;const profile=fs.mkdtempSync('/tmp/breeze-meaning-original-');
    try{context=await playwright[engine].launchPersistentContext(profile,{headless:true,viewport:{width:820,height:1180},serviceWorkers:'block',
      ...(engine==='chromium'&&process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});}
    catch(error){report.blocked.push({engine,error:error.message});fs.rmSync(profile,{recursive:true,force:true});continue;}
    try {
      const page=await context.newPage(),errors=[],externalAttempts=[];
      let resizeObserverDeferrals=0;
      page.on('pageerror',e=>{
        // Match the existing PDF geometry harness: this exact one-frame
        // deferral occurs on the unchanged baseline during viewport resize.
        // Record it; retain every geometry assertion and all other errors.
        if(e.message==='ResizeObserver loop completed with undelivered notifications.')resizeObserverDeferrals++;
        else errors.push(e.message);
      });
      await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','done'));
      await page.route('**/*',route=>{
        const target=route.request().url();
        if(target.startsWith(url)||target.startsWith('blob:'))return route.continue();
        if(/functions\/v1\/dict/.test(target)){let op;try{op=route.request().postDataJSON()?.op;}catch{}
          if(op==='warm')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true})});}
        externalAttempts.push(target.split('?')[0]);return route.abort();
      });
      await page.goto(url+'index.html');
      await page.evaluate(async()=>{
        window.qaOriginalAdapter=await import('/experiments/meaning-unit/original-adapter.mjs');
        window.qaOriginalCore=await import('/experiments/meaning-unit/core.mjs');
        const original=pdfOperatorEntries;
        pdfOperatorEntries=(...args)=>{const entries=original(...args);window.qaOriginalEntries=entries;return entries;};
        window.qaOriginalProviderCalls=0;
        window.qaOriginalSession=new qaOriginalCore.SelectionSession(async prepared=>{
          qaOriginalProviderCalls++;
          return JSON.stringify({blockId:prepared.block.id,start:0,end:prepared.block.text.length,
            source:prepared.block.text,translation:'합성 검증 번역 — '+prepared.block.id,complete:true});
        });
      });
      const open=async(name,buffer)=>{
        const oldIds=await page.evaluate(()=>books.map(b=>b.id));
        await page.locator('#fileinput').setInputFiles({name,mimeType:'application/pdf',buffer});
        await page.waitForFunction(ids=>books.some(b=>b.kind==='pdf'&&!ids.includes(b.id)),oldIds,{timeout:120000});
        await page.evaluate(async ids=>{await openBook(books.find(b=>b.kind==='pdf'&&!ids.includes(b.id)));await switchReaderMode('original');},oldIds);
        await page.waitForFunction(()=>originalSession?.wordBoxes.get(1)?.length>0,null,{timeout:60000});
      };
      await open('synthetic-choices.pdf',originalChoiceFixture());
      const extraction=await page.evaluate(async()=>{
        const sourcePage=await originalSession.pdf.getPage(1),viewport=sourcePage.getViewport({scale:1});
        const started=performance.now();
        window.qaExtracted=qaOriginalAdapter.originalChoiceBlocks({lines:pdfTextLines(qaOriginalEntries),page:1,width:viewport.width,height:viewport.height});
        return {blocks:qaExtracted.blocks,glyphCount:qaExtracted.glyphs.length,extractionMs:performance.now()-started};
      });
      report.extractions.push({engine,extractionMs:extraction.extractionMs,glyphCount:extraction.glyphCount,blocks:extraction.blocks.length});
      assert.equal(extraction.blocks.filter(b=>b.kind==='choice').length,6);
      for(let column=0;column<2;column++)assert.equal(extraction.blocks.find(b=>b.id===`p1:c${column}:choice:1`).text,originalChoiceGold[column]);
      for(const viewport of [{width:820,height:1180},{width:1180,height:820}]) {
        await page.setViewportSize(viewport);
        for(const theme of ['light','dark']) {
          await page.evaluate(theme=>{document.documentElement.dataset.theme=theme;},theme);
          for(const zoom of [1,1.5]) {
            await page.evaluate(z=>{setOriginalZoom(z);readerScrollTo(0);},zoom);
            for(let column=0;column<2;column++)for(const probe of ['beginning','middle','repeated','end']) {
              const started=performance.now();
              const result=await page.evaluate(async({column,probe})=>{
                const block=qaExtracted.blocks.find(b=>b.id===`p1:c${column}:choice:1`);
                const tokens=[...block.text.matchAll(/[\p{L}\p{N}]+/gu)];
                const word=probe==='beginning'?tokens[1]:probe==='middle'?tokens.find(t=>t[0]==='oxygen'):
                  probe==='repeated'?tokens.filter(t=>t[0]==='oxygen')[1]:tokens.at(-1);
                const glyph=qaExtracted.glyphs.find(g=>g.blockId===block.id&&g.start===word.index);
                const point={x:glyph.x+glyph.width/2,y:glyph.y+glyph.height/2};
                const paper=originalSession.pages[0],rect=paper.getBoundingClientRect();
                const pdfPage=await originalSession.pdf.getPage(1),base=pdfPage.getViewport({scale:1});
                const client={x:rect.left+point.x/base.width*rect.width,y:rect.top+point.y/base.height*rect.height};
                const baselineHit=pdfWordAtPoint(paper,client.x,client.y);
                const baseline=READER_SURFACES.find(s=>s.name==='pdf').sentenceAt(client.x,client.y);
                const input=qaOriginalAdapter.originalTapInput('synthetic-original-choices','1',qaExtracted,point);
                const {prepared,result}=await qaOriginalSession.select(input);
                const selected=qaOriginalCore.highlightGlyphs(prepared,result,qaExtracted.glyphs);
                // Paint exact operator glyph cells in an isolated diagnostic layer.
                paper.querySelector('.meaning-unit-original-layer')?.remove();
                const layer=document.createElement('div');layer.className='meaning-unit-original-layer';
                Object.assign(layer.style,{position:'absolute',inset:'0',pointerEvents:'none'});
                for(const cell of selected){const mark=document.createElement('span');
                  Object.assign(mark.style,{position:'absolute',left:cell.x/base.width*100+'%',top:cell.y/base.height*100+'%',
                    width:cell.width/base.width*100+'%',height:cell.height/base.height*100+'%',background:'#007aff38',borderRadius:'2px'});layer.append(mark);}
                paper.append(layer);
                let maxPaintError=0;
                [...layer.children].forEach((mark,i)=>{const r=mark.getBoundingClientRect(),g=selected[i];
                  maxPaintError=Math.max(maxPaintError,Math.abs(r.left-(rect.left+g.x/base.width*rect.width)),Math.abs(r.top-(rect.top+g.y/base.height*rect.height)),
                    Math.abs(r.width-g.width/base.width*rect.width),Math.abs(r.height-g.height/base.height*rect.height));});
                const sourceMapped=selected.every(g=>qaExtracted.sourceMap.some(m=>m.blockId===g.blockId&&m.start===g.start&&m.end===g.end));
                return {mode:currentReaderMode,baselineHit:baselineHit?.word,expectedWord:word[0],baselineSource:baseline?.sentence,
                  source:result.source,blockId:result.blockId,tap:input.tap,translation:result.translation,
                  context:prepared.data.context.map(b=>({id:b.id,column:b.column})),sourceMapped,maxPaintError,
                  selectedColumns:[...new Set(selected.map(g=>g.column))],selectedLines:[...new Set(selected.map(g=>g.lineIndex))],
                  selectedGlyphs:selected.length,providerCalls:qaOriginalProviderCalls};
              },{column,probe});
              assert.equal(result.mode,'original');assert.equal(result.baselineHit,result.expectedWord);
              assert.equal(result.source,originalChoiceGold[column]);assert.equal(result.blockId,`p1:c${column}:choice:1`);
              assert.deepEqual(result.selectedColumns,[column]);assert.equal(result.selectedLines.length,2);
              assert.ok(result.context.every(b=>b.column===column));assert.ok(result.sourceMapped);assert.ok(result.maxPaintError<.15);
              assert.equal(result.translation,'합성 검증 번역 — '+result.blockId);
              assert.notEqual(result.baselineSource,originalChoiceGold[column]);
              report.runs.push({engine,viewport,theme,zoom,column,probe,durationMs:performance.now()-started,
                baselineExact:false,adapterExact:true,...result});
            }
            if(viewport.width===820&&zoom===1)await page.screenshot({path:new URL(`${engine}-${theme}-original-adapter.png`,output).pathname,fullPage:false});
          }
        }
      }
      // Unsupported real-rendered source layouts must not enter a provider request.
      for(const [name,options] of [['missing-label',{missingLabel:true}],['rotated-pdf',{rotation:90}]]) {
        await page.evaluate(()=>show('home'));await open(`synthetic-${name}.pdf`,originalChoiceFixture(options));
        const rejected=await page.evaluate(async()=>{const before=qaOriginalProviderCalls,p=await originalSession.pdf.getPage(1),v=p.getViewport({scale:1});
          try{qaOriginalAdapter.originalChoiceBlocks({lines:pdfTextLines(qaOriginalEntries),page:1,width:v.width,height:v.height});return {rejected:false,before,after:qaOriginalProviderCalls};}
          catch(error){return {rejected:true,reason:error.message,before,after:qaOriginalProviderCalls};}});
        assert.ok(rejected.rejected);assert.equal(rejected.before,rejected.after);report.rejections.push({engine,name,...rejected});
      }
      report.engineDiagnostics.push({engine,resizeObserverDeferrals,errors});
      assert.deepEqual(errors,[]);
      assert.ok(!externalAttempts.some(u=>/openrouter|generativelanguage|functions\/v1\/dict/.test(u)));
    } finally {await context.close();fs.rmSync(profile,{recursive:true,force:true});}
  }
} finally {
  server.close();fs.writeFileSync(new URL('original-adapter-browser-results.json',output),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify({adapterCases:report.runs.length,baselineExact:report.runs.filter(r=>r.baselineExact).length,
  unsupportedLayouts:report.rejections.length,blocked:report.blocked.map(b=>b.engine),liveAiCalls:0}));
if(!report.runs.length||(process.env.REQUIRE_ALL_ENGINES==='1'&&report.blocked.length))process.exitCode=1;
