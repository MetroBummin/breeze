/* Capture the pinned production app with authored local data, never live accounts. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';

const source=resolve(process.env.BREEZE_CAPTURE_ROOT||'../breeze-app-1.9');
const sha=execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim();
assert.equal(sha,'7bed00f9f5e1bb5cbba68f7d921081b5be7f7d65','Capture submitted 1.9 (253) only');
const out=resolve('landing/assets/screens');
const proof=resolve(process.env.BREEZE_LANDING_PROOF||'/tmp/breeze-landing-proof','app');
mkdirSync(out,{recursive:true});mkdirSync(proof,{recursive:true});
const {pdfGeometryFixture}=await import(new URL('../tests/helpers/pdf-geometry-fixture.mjs',import.meta.url));
const server=createServer((req,res)=>{
  const path=resolve(source,'.'+decodeURIComponent(new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html')));
  if(!path.startsWith(source+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const captures=[];
try{
  for(const dark of [false,true]){
    const theme=dark?'dark':'light';
    const context=await browser.newContext({viewport:{width:390,height:720},hasTouch:true,deviceScaleFactor:1,serviceWorkers:'block'});
    const page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));});
    await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
    await page.goto(url);await page.evaluate(()=>homeReady);
    await page.locator('#fileinput').setInputFiles({name:'A Little Curiosity.txt',mimeType:'text/plain',buffer:Buffer.from('Every story begins with a little curiosity.\n\nA quiet meadow opens beyond the trees. We stay with the story, one page at a time.')});
    await page.waitForFunction(()=>books.some(b=>b.kind==='txt'));
    await page.evaluate(async dark=>{
      await openBook(books.find(b=>b.kind==='txt'));darkMode=dark;applyDark();
      words=Object.fromEntries([
        ['curiosity','호기심','Every story begins with a little curiosity.',1],
        ['quiet','조용한','A quiet meadow opens beyond the trees.',2],
        ['meadow','초원','A quiet meadow opens beyond the trees.',1],
        ['beyond','~너머에','A quiet meadow opens beyond the trees.',3],
        ['stay','머무르다','We stay with the story, one page at a time.',2]
      ].map(([word,ko,example,status],i)=>[keyOf(word),{word,ko,example,book:'A Little Curiosity',status,mark:true,addedAt:i+1,up:i+1,defs:[{pos:'noun',def:'A desire to learn or know more.'}],ai:{ko,pos:'noun',done:true}}]));
      saveWords();
      dictGet=async()=>({ko:'모든 이야기는 작은 호기심에서 시작돼요.'});dictPut=async()=>{};
      dictCall=async()=>({sentenceEasyExplanation:true,explanation:'작은 호기심이 새로운 이야기를 시작하게 한다는 뜻이에요.'});
      setSentenceEasyCapability(true);
    },dark);
    await page.evaluate(()=>document.fonts.ready);
    const snap=async(name,published=false)=>{
      const file=resolve(published?out:proof,`${name}-${theme}.png`);
      await page.screenshot({path:file,animations:'disabled'});
      const bytes=readFileSync(file);
      captures.push({file:(published?'landing/assets/screens/':'app/')+`${name}-${theme}.png`,sourceSHA:sha,viewport:page.viewportSize(),sizeBytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
    };
    await snap('reader');
    await page.locator('#rtext .w').filter({hasText:/^curiosity$/}).first().tap();
    await page.locator('#word-peek').waitFor({state:'visible'});await snap('word-peek');
    await page.locator('#word-peek-more').tap();await page.locator('#panel.on').waitFor();await snap('word-detail');
    await page.evaluate(()=>closePanel());
    const first=await page.locator('#rtext .w').filter({hasText:/^Every$/}).first().boundingBox();
    await page.mouse.move(first.x+first.width/2,first.y+first.height/2);await page.mouse.down();
    await page.waitForTimeout(850);await page.mouse.up();
    await page.locator('#ps-ko').waitFor({state:'visible'});await snap('sentence');
    await page.evaluate(()=>{closeSentence();show('vocab');renderVocab();});
    await snap('memory-phone',true);
    await page.setViewportSize({width:1024,height:640});await snap('memory-web',true);
    await page.setViewportSize({width:820,height:1180});
    // Native iPad eligibility is emulated; this proves the shipped UI, not Pencil hardware.
    await page.evaluate(()=>{window.breezeInkIPad=true;window.dispatchEvent(new Event('breeze-ink-platform'));show('home');});
    await page.locator('#fileinput').setInputFiles({name:'Reading Notes.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture(['A little curiosity opens a new story.','Reading should feel easy.','Mark an idea worth remembering.'])});
    await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));
    await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');expandReaderChrome();await BreezePdfInk.availability();});
    await page.locator('[data-ink-toggle]').click();
    assert.equal(await page.evaluate(()=>BreezePdfInk.writing()),true);
    await snap('pdf-tools');
    assert.deepEqual(errors,[]);
    await context.close();
  }
  writeFileSync(resolve(out,'capture-receipt.json'),JSON.stringify({sourceSHA:sha,source:'Production app rendered locally; authored TXT/PDF and prepared lookup answers; no live login/API. Native iPad signal emulated for PDF tools.',captures},null,2)+'\n');
  console.log(`Captured ${captures.length} real app PNGs; 4 landing images use ${captures.filter(c=>c.file.startsWith('landing/')).reduce((n,c)=>n+c.sizeBytes,0)} bytes`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
