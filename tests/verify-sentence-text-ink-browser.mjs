/* Actual Text Reader pixels: sentence wash/reflection must stay below source ink.
 * Provider-free, exact source Range/word identity and fixed 825ms shimmer phase.
 * BREEZE_QA_BASELINE=1 records the unfixed renderer without accepting its ink loss.
 * Browser WebKit is separate from physical iOS/WKWebView validation.
 */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {chromium,webkit} from 'playwright';

const root=resolve(process.env.BREEZE_QA_ROOT||fileURLToPath(new URL('../',import.meta.url)))+'/';
const output=resolve(process.env.BREEZE_QA_OUTPUT||'/tmp/breeze-sentence-text-ink');
const baseline=process.env.BREEZE_QA_BASELINE==='1';
const engineName=process.env.BREEZE_QA_ENGINE||process.env.BROWSER||'chromium';
assert.ok(['chromium','webkit'].includes(engineName));
const engine=engineName==='webkit'?webkit:chromium;
mkdirSync(output,{recursive:true});
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html')));
  try{
    if(!path.startsWith(root))throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(path)]||'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
const phrase='A patient reader keeps every word and every meaning together while the sentence continues onto the next line.';
const JSZip=createRequire(import.meta.url)('../assets/lib/jszip-3.10.1.min.js');
const zip=new JSZip();
zip.file('mimetype','application/epub+zip');
zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="2.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">sentence-ink</dc:identifier><dc:title>Sentence EPUB ink</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Sentence EPUB ink</title></head><body>'+('<p>'+phrase+' Another sentence stays outside the selected source.</p>').repeat(30)+'</body></html>');
const reports=[];
let browser,context,profile;
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{
  const contextOptions={viewport:{width:390,height:844},deviceScaleFactor:1,hasTouch:true,serviceWorkers:'block'};
  if(engine===webkit){
    // Match the existing import/sentence fixtures: persistent WebKit storage
    // preserves original-file bytes while the reader retrieves them from IDB.
    profile=mkdtempSync(resolve(tmpdir(),'breeze-sentence-text-ink-'));
    context=await engine.launchPersistentContext(profile,{...contextOptions,headless:true});
  }else{
    browser=await engine.launch({headless:true,executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
    context=await browser.newContext(contextOptions);
  }
  const page=await context.newPage();
  const errors=[],providerAttempts=[];
  page.on('pageerror',e=>{if(!e.message.startsWith('ResizeObserver loop'))errors.push(e.message);});
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.route('**/*',route=>{
    const href=route.request().url();
    if(/\/functions\/v1\/dict/.test(href)&&route.request().method()==='POST'){
      const op=route.request().postDataJSON()?.op;if(op!=='warm')providerAttempts.push(op);
    }
    return href.startsWith(url)||href.startsWith('blob:')?route.continue():route.abort();
  });
  await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
  await page.locator('#fileinput').setInputFiles({name:'Sentence ink.txt',mimeType:'text/plain',buffer:Buffer.from((phrase+' Another sentence stays outside the selected source.\n\n').repeat(30))});
  await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
  await page.locator('#fileinput').setInputFiles({name:'Sentence ink.epub',mimeType:'application/epub+zip',buffer:await zip.generateAsync({type:'nodebuffer'})});
  await page.waitForFunction(()=>books.some(b=>b.kind==='epub'));
  await page.evaluate(async phrase=>{
    const url='https://example.test/sentence-ink';
    const blocks=Array.from({length:30},()=>({r:'p',t:phrase+' Another sentence stays outside the selected source.'}));
    await ingestArticle(url,{preparedArticle:{title:'Sentence article ink',site:'Fixture',url,cover:'',blocks,...articleAssemble('Sentence article ink',blocks)}});
  },phrase);
  await page.waitForFunction(()=>books.some(b=>b.kind==='article'));
  await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='txt'));setReaderChrome(false);});
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20&&!readerPositionPending()&&!readerAnchorHeld());
  await page.evaluate(()=>{
    window.qaInk={};
    dictGet=async()=>null;dictPut=async()=>{};sb||={};
    dictCall=body=>body.op==='warm'?Promise.resolve({sentenceEasyExplanation:false}):new Promise(resolve=>{qaInk.resolve=resolve;});
    qaInk.pick=()=>{
      const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent==='patient');
      const box=node.getBoundingClientRect(),block=node.closest('[data-pi]');
      const found=READER_SURFACES.find(s=>s.name==='text').sentenceAt(box.left+box.width/2,box.top+box.height/2);
      const part=textSentencePartAt(node).part,range=domRangeForOffsets(block,part.start,part.end);
      Object.assign(qaInk,{node,block,found,range,identities:[...block.childNodes],textNodes:[...block.querySelectorAll('.w')].map(n=>n.firstChild)});
    };
    qaInk.geometry=()=>{
      const rect=r=>[r.x,r.y,r.width,r.height];
      const css=getComputedStyle(qaInk.node);
      return {range:[...qaInk.range.getClientRects()].map(rect),words:[...qaInk.block.querySelectorAll('.w')].map(n=>rect(n.getBoundingClientRect())),
        scroll:readerScrollTop(),text:qaInk.range.toString(),font:css.font,lineHeight:css.lineHeight,color:css.color,
        sameTextNodes:qaInk.textNodes.every((n,i)=>n===qaInk.block.querySelectorAll('.w')[i].firstChild)};
    };
    qaInk.inspect=()=>{
      const css=n=>{
        const s=getComputedStyle(n);return {tag:n.tagName,class:n.className,position:s.position,z:s.zIndex,isolation:s.isolation,
          color:s.color,opacity:s.opacity,filter:s.filter,backdropFilter:s.backdropFilter,textShadow:s.textShadow,
          blend:s.mixBlendMode,transform:s.transform,animation:s.animationName,background:s.backgroundColor,image:s.backgroundImage};
      };
      return {source:css(qaInk.node),block:css(qaInk.block),
        layer:readerSentenceCue?css(readerSentenceCue.layer):null,
        cue:readerSentenceCue?[...readerSentenceCue.layer.children].map(css):null,
        hit:document.elementFromPoint(qaInk.node.getBoundingClientRect().left+3,qaInk.node.getBoundingClientRect().top+8)===qaInk.node};
    };
  });
  const frames=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const settle=async()=>{
    await frames();await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>Number.isFinite(a.effect?.getComputedTiming().endTime)).map(a=>a.finished.catch(()=>{}))));await frames();
  };
  const freeze=async()=>{
    await settle();await page.evaluate(()=>{
      for(const a of document.getAnimations())if(a.animationName==='breeze-word-sheen'){a.pause();a.currentTime=825;}
    });await frames();
  };
  const capture=async name=>{
    const png=await page.screenshot({path:resolve(output,name+'.png'),animations:'allow'});
    return png.toString('base64');
  };
  const profiles=[[390,844],[820,1180],[1440,900],[320,568],[844,390]];
  for(const kind of ['txt','epub','article']){
  await page.evaluate(async kind=>{closeSentence();closePanel();await openBook(books.find(b=>b.kind===kind));if(currentReaderMode!=='text')await switchReaderMode('text');},kind);
  await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>20&&!readerPositionPending()&&!readerAnchorHeld());
  for(const [width,height] of (kind==='txt'?profiles:profiles.slice(0,1)))for(const dark of [false,true])for(const reduced of [false,true]){
    const key=`${engineName}-${kind}-${width}x${height}-${dark?'dark':'light'}-${reduced?'reduced':'motion'}`;
    await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await page.evaluate(dark=>{closeSentence();closePanel();darkMode=dark;applyDark();readerScrollTo(0);setReaderChrome(false);qaInk.pick();},dark);
    await page.evaluate(()=>document.fonts.ready);await settle();
    const geometry=await page.evaluate(()=>qaInk.geometry());
    const plain=await capture(key+'-plain'),shots={},styles={};
    for(const state of ['word-pending','word-done','sentence-pending','sentence-done']){
      await page.evaluate(state=>{
        if(state==='word-pending'){
          qaInk.node.classList.add('sel');wordLookupFeedback.start(990,'text');
          wordLookupFeedback.present(990,qaInk.node,{loading:true,text:''},false);
        }else if(state==='word-done')wordLookupFeedback.present(990,qaInk.node,{loading:false,text:'뜻'},true);
        else if(state==='sentence-pending'){
          wordLookupFeedback.end(990);qaInk.node.classList.remove('sel');
          qaInk.found.paint();openSentence(qaInk.found.sentence,qaInk.found);
        }else qaInk.resolve({ko:'참을성 있는 독자는 다음 줄까지 이어지는 문장의 단어와 의미를 함께 읽습니다.'});
      },state);
      if(state==='sentence-done')await page.waitForFunction(()=>!document.getElementById('sentence-modal').hidden);
      await freeze();
      assert.deepEqual(await page.evaluate(()=>qaInk.geometry()),geometry,key+'/'+state+': source layout, Range, font, scroll or text-node identity changed');
      styles[state]=await page.evaluate(()=>qaInk.inspect());
      assert.equal(styles[state].hit,true,key+'/'+state+': source hitbox was covered');
      shots[state]=await capture(key+'-'+state);
      if(state==='sentence-done'){
        // Keep the delivered-result capture. Its existing wide outer shadow can
        // darken nearby lines; isolate cue pixels from that separate surface.
        await page.locator('#sentence-modal').evaluate(n=>n.style.visibility='hidden');
        shots[state]=(await page.screenshot()).toString('base64');
        await page.locator('#sentence-modal').evaluate(n=>n.style.removeProperty('visibility'));
      }
    }
    const metrics=await page.evaluate(async({plain,shots,rects,ink})=>{
      const decode=async png=>{
        const img=new Image();img.src='data:image/png;base64,'+png;await img.decode();
        const canvas=document.createElement('canvas');canvas.width=img.width;canvas.height=img.height;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);return {data:ctx.getImageData(0,0,img.width,img.height).data,width:img.width,height:img.height};
      };
      const base=await decode(plain),color=ink.match(/\d+/g).slice(0,3).map(Number),pixels=[];
      // Fully covered glyph cores must be identical regardless of background.
      // Antialiased edges legitimately mix with the changed wash and are excluded.
      for(const [left,top,w,h] of rects)for(let y=Math.max(0,Math.ceil(top));y<Math.min(base.height,top+h);y++)
        for(let x=Math.max(0,Math.ceil(left));x<Math.min(base.width,left+w);x++){
          const i=(y*base.width+x)*4;
          if(color.every((c,k)=>Math.abs(base.data[i+k]-c)<=2))pixels.push(i);
        }
      const result={corePixels:pixels.length,states:{}};
      for(const [state,png] of Object.entries(shots)){
        const next=await decode(png);let changed=0,maxDelta=0;
        for(const i of pixels){const delta=Math.max(...[0,1,2].map(k=>Math.abs(base.data[i+k]-next.data[i+k])));if(delta>2)changed++;maxDelta=Math.max(maxDelta,delta);}
        result.states[state]={changed,maxDelta};
      }return result;
    },{plain,shots,rects:geometry.range,ink:geometry.color});
    reports.push({key,geometry,styles,metrics});
    writeFileSync(resolve(output,'text-ink.json'),JSON.stringify({engine:engineName,baseline,reports,errors,providerAttempts},null,2));
    assert.ok(metrics.corePixels>50,key+': missing visible source ink');
    for(const [state,m] of Object.entries(metrics.states)){
      if(baseline&&state.startsWith('sentence'))continue;
      assert.equal(m.changed,0,key+'/'+state+': highlight composited over opaque source ink');
    }
    await page.evaluate(()=>{closeSentence();clearReaderSentenceCue(true);});await settle();
    assert.equal(await page.locator('.reader-sentence-cue-layer,.reader-sentence-cue-host').count(),0,key+': cue/stacking owner leaked after close');
    console.log(key,JSON.stringify(metrics));
  }
  }
  // A paragraph within a styled note must retain visible wash above its parent
  // background, source emphasis and punctuation. No wrappers/text copies added.
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.evaluate(()=>{
    darkMode=false;applyDark();readerScrollTo(0);qaInk.pick();
    const note=document.createElement('div');note.className='blk note';qaInk.block.before(note);note.appendChild(qaInk.block);
    qaInk.node.style.fontStyle='italic';qaInk.pick();qaInk.found.paint();setReaderSentencePending(true);
  });await freeze();
  const note=await page.evaluate(()=>({hit:qaInk.inspect().hit,geometry:qaInk.geometry(),styles:qaInk.inspect()}));
  assert.equal(note.hit,true);await capture(engineName+'-styled-note-pending');
  await page.evaluate(()=>clearReaderSentenceCue(true));
  assert.equal(await page.locator('.reader-sentence-cue-host').count(),0);
  await page.evaluate(()=>{qaInk.found.paint();clearReaderSentenceCue();qaInk.found.paint();setReaderSentencePending(true);qaInk.newLayer=readerSentenceCue.layer;});
  // Await the actual outgoing layer's fallback timer, not a fixed test sleep.
  await page.waitForFunction(()=>document.querySelectorAll('.reader-sentence-cue-layer').length===1);
  assert.equal(await page.evaluate(()=>readerSentenceCue.layer===qaInk.newLayer&&readerSentenceCue.layer.isConnected),true);
  if(!baseline)assert.equal(await page.locator('.reader-sentence-cue-host').count(),1,'outgoing cue removed new paragraph stacking');
  await page.evaluate(()=>clearReaderSentenceCue(true));
  assert.deepEqual(errors,[]);assert.deepEqual(providerAttempts,[],'paid transport was attempted');
  console.log(`${engineName}: ${reports.length} Text ink cases ${baseline?'recorded on unfixed baseline':'passed'}; ${output}`);
}finally{await context?.close();await browser?.close();if(profile)rmSync(profile,{recursive:true,force:true});server.close();}
