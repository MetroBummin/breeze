import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),out='/tmp/breeze-client-polish';mkdirSync(out,{recursive:true});
const manifest=JSON.parse(readFileSync(resolve(root,'docs/content/holmes-artwork/asset-manifest.json'),'utf8'));
const covers=new Map(['speckled-band','scandal-in-bohemia','red-headed-league'].map(slug=>{
 const asset=manifest.assets.find(item=>item.kind==='cover'&&item.file===`assets/longreads/covers/${slug}.webp`);
 assert.ok(asset,slug+' has an audited cover');
 const bytes=readFileSync(resolve(root,asset.file));
 assert.equal(bytes.length,asset.bytes,slug+' source bytes match manifest');
 assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,slug+' source hash matches manifest');
 return ['sherlock-holmes-'+slug,asset];
}));
async function waitForShelfCover(page,id){
 const {dimensions:[width,height]}=covers.get(id);
 await page.waitForFunction(({id,width,height})=>{
  const img=document.querySelector(`[data-longread-id="${id}"] img`);
  return img?.complete&&img.naturalWidth===width&&img.naturalHeight===height;
 },{id,width,height});
}
async function assertStoredCover(page,id){
 const actual=await page.evaluate(async id=>{
  const blob=await imgGet(books.find(b=>b.longReadId===id).cover);
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),byte=>byte.toString(16).padStart(2,'0')).join('');
  const src=URL.createObjectURL(blob),img=new Image();
  try{img.src=src;await img.decode();return {bytes:blob.size,sha256:hash,dimensions:[img.naturalWidth,img.naturalHeight]};}
  finally{URL.revokeObjectURL(src);}
 },id);
 const {bytes,sha256,dimensions}=covers.get(id);
 assert.deepEqual(actual,{bytes,sha256,dimensions},id+' repaired cover matches exact audited bytes, hash and dimensions');
}
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}`;
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
 const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
 try{
 const page=await browser.newPage({viewport:{width:820,height:1180},serviceWorkers:'block'}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const id='sherlock-holmes-speckled-band';
 await waitForShelfCover(page,id);
 const saved=await page.evaluate(async id=>{
  const book=await importLongRead(LONG_READS.find(read=>read.id===id));
  const snapshot={id:book.id,paras:book.paras,title:book.title,longReadId:book.longReadId};
  delete book.cover;await bookPut(book);return snapshot;
 },id);
 await page.reload();await page.evaluate(()=>homeReady);await page.waitForFunction(id=>books.find(b=>b.longReadId===id)?.cover,id);
 assert.deepEqual(await page.evaluate(id=>{const b=books.find(b=>b.longReadId===id);return {id:b.id,paras:b.paras,title:b.title,longReadId:b.longReadId};},id),saved,'existing book text and identity retained');
 await assertStoredCover(page,id);
 await page.evaluate(async id=>{const b=books.find(b=>b.longReadId===id);b.cover='custom-cover';await bookPut(b);await restoreMissingLongReadCovers();},id);
 assert.equal(await page.evaluate(id=>books.find(b=>b.longReadId===id).cover,id),'custom-cover','custom cover preserved');
 await page.evaluate(async id=>{const b=books.find(b=>b.longReadId===id);delete b.cover;await bookPut(b);await restoreMissingLongReadCovers();},id);
 const otherCovers=['sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league'];
 for(const coverId of otherCovers){
  await waitForShelfCover(page,coverId);
  await page.evaluate(async id=>{const b=await importLongRead(LONG_READS.find(read=>read.id===id));delete b.cover;await bookPut(b);},coverId);
 }
 await page.reload();await page.evaluate(()=>homeReady);
 for(const coverId of otherCovers){
  await page.waitForFunction(id=>books.find(b=>b.longReadId===id)?.cover,coverId);
  await assertStoredCover(page,coverId);
 }
 await page.evaluate(()=>{
  const at=Date.now();words=Object.fromEntries(['alpha','beta','gamma','delta'].map((word,i)=>[word,{word,clicked:word,forms:[word],ko:'저장된 뜻 '+i,example:'We remember '+word+' in a saved sentence.',book:'Saved book',status:1,addedAt:at-i*1000,up:at-i*1000}]));saveWords();
  // Seed a real pre-existing schedule as fixture data; shipped simple cards
  // must never call the dormant UI storage adapters to read or mutate it.
  let view=BreezeReview.startJourney(BreezeReview.normalize(null),words,at);
  view=BreezeReview.grade(view.state,words,view.token,'confused',at);
  localStorage.setItem('breeze.vocabulary-review.v1',JSON.stringify(view.state));show('vocab');
 });
 const before=await page.evaluate(()=>localStorage.getItem('breeze.vocabulary-review.v1'));
 assert.equal(await page.locator('#review-setup-waiting').count(),0);
 assert.doesNotMatch(await page.locator('#review-setup').textContent(),/지금 학습|이어서 학습할 수/);
 assert.equal(await page.locator('#review-setup').isVisible(),false,'scheduled setup stays dormant');
 assert.equal(await page.locator('#review-settings').isVisible(),false,'scheduled settings stay dormant');
 for(const [width,height] of [[390,844],[820,1180],[1440,900],[320,568],[844,390]])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height});await page.evaluate(theme=>{darkMode=theme==='dark';applyDark();show('vocab');},theme);
  await page.screenshot({path:resolve(out,`${engine.name()}-memory-${width}-${theme}.png`)});
  assert.equal(await page.locator('#wordbook-review').isEnabled(),true);
  await page.evaluate(()=>show('home'));await page.screenshot({path:resolve(out,`${engine.name()}-cover-${width}-${theme}.png`)});
 }
 assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.vocabulary-review.v1')),before,'presentation does not change saved schedule');
 await page.evaluate(()=>show('vocab'));await page.locator('#wordbook-review').click();assert.equal(await page.evaluate(()=>activeAppView()),'study');
 assert.equal(await page.locator('#review-progress').innerText(),'1 / 4','simple cards include all saved meanings regardless of schedule');
 assert.equal(await page.locator('#review-grades').isVisible(),false,'simple cards do not grade scheduled review');
 assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.vocabulary-review.v1')),before,'opening simple cards preserves the existing schedule');
 assert.deepEqual(errors,[]);console.log(engine.name()+': exact cover, old-book repair/custom preservation, Memory/simple-card entry with schedule retention and 20 theme/viewport captures passed');
 }finally{await browser.close();}
}}finally{await new Promise(r=>server.close(r));}
