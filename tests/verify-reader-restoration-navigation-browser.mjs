import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
 catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({...(engine===chromium&&process.env.BREEZE_CHROMIUM_PATH?{executablePath:process.env.BREEZE_CHROMIUM_PATH}:{})});
 const results=[];
 try{for(const action of ['pdf-page','pdf-direction','epub-page']){
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
  try{
   await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   await page.goto(url);await page.evaluate(()=>homeReady);
   await page.evaluate(async({bytes,action})=>{
    const kind=action.startsWith('pdf')?'pdf':'epub';
    let blob=new Blob([new Uint8Array(bytes)],{type:'application/pdf'});
    if(kind==='epub'){
     await ensureZipLib();const zip=new JSZip();zip.file('mimetype','application/epub+zip');
     zip.file('META-INF/container.xml','<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>');
     zip.file('book.opf','<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata/><manifest><item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chapter"/></spine></package>');
     zip.file('chapter.xhtml','<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter</title></head><body>'+Array.from({length:100},(_,i)=>'<p>Paragraph '+i+' carries a quiet memory through the forest.</p>').join('')+'</body></html>');
     blob=await zip.generateAsync({type:'blob'});
    }
    const record={kind,hash:'navigation-'+kind,blob};
    const book={id:'navigation-'+kind,title:'Navigation '+kind,kind,original:{hash:record.hash},paras:Array.from({length:100},(_,i)=>'Paragraph '+i+' carries a quiet memory through the forest.'),sourceMap:Array.from({length:100},(_,i)=>kind==='pdf'?{page:Math.floor(i/20)+1,y:(i%20)/20}:{spine:0,href:'chapter.xhtml',element:i})};
    books=[book];positions[book.id]={p:.65,t:12345,mode:'original',original:kind==='pdf'?{kind,page:4,y:.5}:{kind,spine:0,href:'chapter.xhtml',element:60}};
    await openBook(book,{prepared:{book,original:record}});await switchReaderMode('text');
    window.navigationQA={action,record,restore:restoreOriginalAnchor};
    navigationQA.act=async()=>{
     if(action==='pdf-page')await goPdfPage(5);
     else if(action==='pdf-direction')await setPdfReadDirection(studyPrefs.direction==='vertical'?'horizontal':'vertical');
     else{if(!pdfNavigation)togglePdfNavigation();await goEpubNavigationPage(pdfNavigation,1);}
    };
    restoreOriginalAnchor=async(...args)=>{navigationQA.waiting=true;await new Promise(r=>navigationQA.release=r);return navigationQA.restore(...args);};
    navigationQA.opening=switchReaderMode('original',{record});
   },{bytes:[...fixturePdf(6)],action});
   await page.waitForFunction(()=>navigationQA.waiting);
   const result=await page.evaluate(async()=>{
    const token=readerModeChangeToken,pendingBefore=readerPositionPending();
    const preparing=document.getElementById('originalwrap').hasAttribute('data-reader-preparing');
    await navigationQA.act();const afterAction=readerModeChangeToken;
    navigationQA.release();const landed=await navigationQA.opening;restoreOriginalAnchor=navigationQA.restore;
    const pendingAfter=readerPositionPending();
    let afterLanding=null;
    if(!pendingAfter){
     const readyToken=readerModeChangeToken;await navigationQA.act();
     afterLanding={moved:readerModeChangeToken>readyToken,pending:readerPositionPending(),saved:posOf(curBook.id).p,visible:visibleReaderProgress()};
    }
    return {token,afterAction,pendingBefore,preparing,landed,pendingAfter,afterLanding};
   });
   results.push({action,...result});console.log(engine.name(),action,result);
  }finally{await page.close();}
 }
 for(const result of results){
  assert.equal(result.preparing,false,`${result.action}: original session was reused`);
  assert.equal(result.pendingBefore,true);
  assert.equal(result.afterAction,result.token,`${result.action}: navigation cannot orphan the mode-restoration owner`);
  assert.equal(result.landed,true);assert.equal(result.pendingAfter,false);
  assert.equal(result.afterLanding.moved,true,`${result.action}: navigation works after landing`);
  assert.equal(result.afterLanding.pending,false);
  assert.equal(result.afterLanding.saved,result.afterLanding.visible);
 }
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
