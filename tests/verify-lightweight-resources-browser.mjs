import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root+'/'))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;

const results=[];
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 const result=await page.evaluate(async()=>{
  const check=(value,message)=>{if(!value)throw Error(message);};
  let scans=0;const paras=['word '.repeat(180).trim()];
  paras.reduce=function(...args){scans++;return Array.prototype.reduce.apply(this,args);};
  const book={paras};check(readMinutes(book)===1,'initial count');
  for(let i=0;i<20;i++)check(readMinutes(book)===1,'cached count');
  check(scans===1,'unchanged text was recounted');
  paras[0]='word '.repeat(720).trim();check(readMinutes(book)===4,'same-length array edit missed');
  paras.push('word '.repeat(180).trim());check(readMinutes(book)===5,'appended paragraph missed');
  paras.pop();check(readMinutes(book)===4,'removed paragraph missed');
  book.paras=['word '.repeat(360).trim()];check(readMinutes(book)===2,'replaced array missed');
  book.paras=[IMG_MARK+'fixture','word '.repeat(180).trim()];check(readMinutes(book)===1,'image counted as text');
  const sample={paras:Array.from({length:150},()=>('A quiet reader enjoys a good story. ').repeat(15))};
  const measure=fn=>{const t=performance.now();for(let i=0;i<200;i++)fn(sample);return performance.now()-t;};
  readMinutes(sample);const before=measure(b=>Math.max(1,Math.round(wcOf(b)/180))),after=measure(readMinutes);
  const oldCreate=URL.createObjectURL,oldRevoke=URL.revokeObjectURL,oldImage=bookImageBlob;
  const made=[],revoked=[];URL.createObjectURL=b=>{const u=oldCreate(b);made.push(u);return u;};
  URL.revokeObjectURL=u=>{revoked.push(u);oldRevoke(u);};
  const blob=new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>'],{type:'image/svg+xml'});
  bookImageBlob=async()=>blob;
  const b={id:'cleanup',title:'Cleanup fixture',kind:'txt',paras:[IMG_MARK+'fixture','A quiet reader enjoys a good story.']};
  books=[];positions={};
  for(let i=0;i<5;i++){
   await openBook(b);await new Promise(r=>setTimeout(r,20));
   check(document.querySelector('#rtext img').complete&&document.querySelector('#rtext img').naturalWidth===10,'active image did not load');
   show('vocab');
  }
  check(made.length===5&&revoked.length===5,'repeated open leaked URLs');
  let resolveOld;bookImageBlob=()=>new Promise(resolve=>resolveOld=resolve);
  await openBook(b);show('vocab');resolveOld(blob);await Promise.resolve();
  check(made.length===5,'late response after close created URL');
  await openBook(b);const stale=resolveOld;
  bookImageBlob=async()=>blob;renderBookBody(b);await Promise.resolve();
  check(made.length===6,'current render did not create URL');stale(blob);await Promise.resolve();
  check(made.length===6,'late response from prior render created URL');
  renderBookBody(b);await Promise.resolve();check(revoked.includes(made[5]),'body replacement leaked URL');
  show('vocab');check(made.length===revoked.length,'final cleanup leaked URL');
  check(new Set(revoked).size===revoked.length,'double revocation');
  URL.createObjectURL=oldCreate;URL.revokeObjectURL=oldRevoke;bookImageBlob=oldImage;

  // A cached opening saves pick order and automatic difficulty together.
  await openBook(b);await new Promise(r=>setTimeout(r,30));
  const node=[...document.querySelectorAll('#rtext .w')].find(n=>n.textContent==='quiet');
  words={quiet:{word:'quiet',ko:'조용한',status:1,mark:true,defs:[{pos:'adj',def:'Making little noise.'}],example:b.paras[1],addedAt:1,up:1}};
  const oldSave=save,oldQueueSync=queueSync;let wordSaves=0,syncs=0;
  save=(key,value)=>{if(key===WORD_WRITE_PENDING)wordSaves++;return oldSave(key,value);};queueSync=()=>{syncs++;};
  const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  recentWordOpens.clear();openWord('quiet',node);await settle();
  check(wordSaves===1&&syncs===1,'opening did not merge saves');
  let persisted=loadWordState().quiet;
  check(persisted.status===2&&persisted.pickedAt>0&&persisted.up>1,'merged write lost state');
  closePanel();wordSaves=0;syncs=0;openWord('quiet',node);await settle();
  check(wordSaves===1&&syncs===0&&words.quiet.status===2,'recent reopen changed difficulty');
  closePanel();words.quiet.status=3;recentWordOpens.clear();wordSaves=0;
  openWord('quiet',node);await settle();check(wordSaves===1&&words.quiet.status===3,'maximum difficulty changed');
  closePanel();words.quiet.status=1;recentWordOpens.clear();wordSaves=0;
  openWord('quiet',node);delete words.quiet;await settle();check(wordSaves===0&&!words.quiet,'deleted word persisted by deferred opening');
  closePanel();words.quiet={...persisted,status:1};recentWordOpens.clear();openWord('quiet',node);
  words.quiet={...persisted,status:1,pickedAt:7};await settle();
  check(wordSaves===0&&words.quiet.status===1&&words.quiet.pickedAt===7,'replacement entry changed by stale opening');
  closePanel();selectWord('quiet',null,false);await settle();
  check(wordSaves===1&&words.quiet.status===1,'direct selection changed difficulty');
  closePanel();save=oldSave;queueSync=oldQueueSync;

  const originals=[renderHome,renderCasualLibrary,renderLongformLibrary];let draws=[0,0,0];
  renderHome=(...args)=>{draws[0]++;return originals[0](...args);};
  renderCasualLibrary=(...args)=>{draws[1]++;return originals[1](...args);};
  renderLongformLibrary=(...args)=>{draws[2]++;return originals[2](...args);};
  books=[b,{id:'casual',title:'Casual before',kind:'paste',paras:['A quiet story.']}];
  for(let i=0;i<20;i++)renderAllBookViews();check(draws.every(n=>n===0),'Reader refreshed hidden shelves');
  b.title='Updated long book';books[1].title='Updated casual';
  show('home');check(document.getElementById('shelf').textContent.includes(b.title),'Home missed hidden update');
  draws=[0,0,0];renderAllBookViews();check(draws.join() === '1,0,0','Home refreshed inactive shelves');
  show('casuals');check(document.getElementById('casual-grid').textContent.includes('Updated casual'),'Casual entry stale');
  draws=[0,0,0];renderAllBookViews();check(draws.join() === '0,1,0','Casual refresh painted other shelves');
  show('longform');check(document.getElementById('longform-grid').textContent.includes(b.title),'Long-form entry stale');
  draws=[0,0,0];renderAllBookViews();check(draws.join() === '0,0,1','Long-form refresh painted other shelves');
  show('vocab');draws=[0,0,0];renderAllBookViews();check(draws.every(n=>n===0),'Wordbook refreshed hidden shelves');
  [renderHome,renderCasualLibrary,renderLongformLibrary]=originals;
  return {cachedWordOpenSaves:1,hiddenLibraryRenders:0,readingTime200CallsMs:{before,after},unchangedSourceScans:1,imageUrls:{created:made.length,revoked:revoked.length},lateResponsesCreatedUrls:0};
 });
 assert.equal(result.imageUrls.created,result.imageUrls.revoked);results.push({engine:engine.name(),...result});console.log(JSON.stringify(results.at(-1)));
 }finally{await browser.close();}
}}finally{server.close();}
if(process.env.BREEZE_LIGHTWEIGHT_RESULTS)writeFileSync(process.env.BREEZE_LIGHTWEIGHT_RESULTS,JSON.stringify(results,null,2));
