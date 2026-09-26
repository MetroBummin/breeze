// One-shot, hash-guarded preparation on the isolated repair branch; removed after validation.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
function read(path,sha){
  const bytes=readFileSync(path);
  const actual=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  assert.equal(actual,sha,'Unexpected base content: '+path);
  return bytes.toString('utf8');
}
function one(source,from,to){
  assert.equal(source.split(from).length,2,'Patch anchor is not unique: '+from.slice(0,100));
  return source.replace(from,()=>to);
}
const noticePath='scripts/ui/reader-notifications.js';
let notices=read(noticePath,'b33bae174d07ed9ab5ecca40d141b7e522f54146');
notices=one(notices,"quietUntil=0, owner='';","quietUntil=0, owner='', epoch=0;");
notices=one(notices,"clearTimeout(timer); timer=0; queue.length=0; hide(); quietUntil=0; owner='';","clearTimeout(timer); timer=0; queue.length=0; hide(); quietUntil=0; owner=''; epoch++;");
notices=one(notices,'  function yieldToInput(){',`  // A file operation owns one replaceable status, not a FIFO of old percentages.
  // Independent notices retain FIFO order and all existing input/overlay priority.
  function task(){
    const next=surface(), key={};
    if(owner && owner!==next) reset();
    owner=next;
    const started=epoch;
    let finished=false;
    function update(message,terminal=false){
      if(finished) return;
      if(terminal) finished=true;
      // Navigation/session resets invalidate this operation's presentation only.
      // The import itself still completes and refreshes the currently visible shelf.
      if(started!==epoch || surface()!==next) return;
      const text=String(message||'').trim();
      if(!text) return;
      if(!next){ toast(text); return; }
      const item={key,message:text,created:Date.now(),duration:Math.min(8000,Math.max(2600,text.length*90))};
      if(active && active.key===key){
        Object.assign(active,item); shownAt=item.created;
        noticeNode().textContent=text;
      }else{
        const index=queue.findIndex(pending=>pending.key===key);
        if(index>=0) queue[index]=item;
        else{
          if(queue.length>=MAX_PENDING) queue.shift();
          queue.push(item);
        }
      }
      pump();
    }
    return {progress:message=>update(message),finish:message=>update(message,true)};
  }
  function yieldToInput(){`);
notices=one(notices,'return {enqueue,reset};','return {enqueue,reset,task};');
writeFileSync(noticePath,notices);

const importerPath='scripts/importers/importers.js';
let importer=read(importerPath,'597bdb3a7f06989425277c7f7913ac99f3f7fc09');
importer=one(importer,'async function parsePDF(f){','async function parsePDF(f, onProgress=toast){');
importer=one(importer,'if(i===1 || i%20===0) toast(`책 기본판 준비 중… ${i}/${pdf.numPages}쪽`);','if(i===1 || i%20===0) onProgress(`책 기본판 준비 중… ${i}/${pdf.numPages}쪽`);');
writeFileSync(importerPath,importer);

const libraryPath='scripts/library/library.js';
let library=read(libraryPath,'f80a91b6c98cbe94a3ad06e036e45ea824d81feb');
library=one(library,"if(kind === 'pdf') parsed = await parsePDF(file);","if(kind === 'pdf') parsed = await parsePDF(file,options.onProgress);");
function changeFunction(name,fn){
  const pattern=new RegExp('^async function '+name+'\\([^]*?^\\}', 'm');
  const match=library.match(pattern);assert.ok(match,'Missing '+name);
  library=one(library,match[0],fn(match[0]));
}
changeFunction('importFile',body=>{
  body=one(body,"  toast('책을 준비하고 있어요…');","  const notice=readerNotices.task();\n  notice.progress('책을 준비하고 있어요…');");
  body=one(body,'prepareImportedFile(file,options)','prepareImportedFile(file,{...options,onProgress:notice.progress})');
  // All terminal branches after the task starts supersede that task's progress.
  const split=body.indexOf('  const notice=');
  body=body.slice(0,split)+body.slice(split).replaceAll('toast(','notice.finish(').replaceAll('renderHome();','renderAllBookViews();');
  body=one(body,'    let original = null;','    let original = null, originalFailed = false;');
  body=one(body,"      notice.finish('책은 추가했지만 원본 파일을 기기에 보관하지 못했어요');","      originalFailed = true;");
  body=one(body,"      : '추가 완료! 카드를 눌러 읽기 시작하세요');","      : originalFailed ? '책은 추가했지만 원본 파일을 기기에 보관하지 못했어요'\n      : '추가 완료! 카드를 눌러 읽기 시작하세요');");
  return body;
});
for(const name of ['reconnectOriginalFile','reconnectVaultItem']){
  changeFunction(name,body=>{
    const start=name==='reconnectOriginalFile'?'같은 책인지 확인하고 있어요…':'같은 읽기자료인지 확인하고 있어요…';
    body=one(body,`  toast('${start}');`,`  const notice=readerNotices.task();\n  notice.progress('${start}');`);
    body=one(body,'prepareImportedFile(file)','prepareImportedFile(file,{onProgress:notice.progress})');
    const split=body.indexOf('  const notice=');
    body=body.slice(0,split)+body.slice(split).replaceAll('toast(','notice.finish(');
    if(name==='reconnectOriginalFile')body=one(body,'    await applyPreparedBook(target,prepared,file);','    await applyPreparedBook(target,prepared,file);\n    renderAllBookViews();');
    return body;
  });
}
writeFileSync(libraryPath,library);

const unitPath='tests/verify-import-identity.mjs';
let unit=read(unitPath,'7bd43d578fe85450d0061561cd137799ccf45667');
unit=one(unit,'    renderHome:()=>events.rendered++,toast:message=>events.messages.push(message),',`    renderAllBookViews:()=>events.rendered++,toast:message=>events.messages.push(message),
    readerNotices:{task:()=>({progress:message=>events.messages.push(message),finish:message=>events.messages.push(message)})},`);
writeFileSync(unitPath,unit);

const pkgPath='package.json';
const pkg=JSON.parse(read(pkgPath,'adb73045d2b24c247e79415b916a335edab63775'));
pkg.scripts.test='node --test tests/verify-import-feedback.mjs && '+pkg.scripts.test;
pkg.scripts['test:ingestion']='node tests/verify-import-feedback-browser.mjs && '+pkg.scripts['test:ingestion'];
writeFileSync(pkgPath,JSON.stringify(pkg,null,2)+'\n');

const decisionPath='docs/decisions/005-reader-notifications.md';
const decision=read(decisionPath,'4191ad8ef072b692201e7e857a2be3e96e344b2d');
writeFileSync(decisionPath,decision+`
## File-import progress (2026-09-26)

File addition and original-file reconnection own a per-operation status token.
Progress replaces that token's active or pending message; it never adds old page
counts to the FIFO. Success, duplication, a partial original-storage warning, or
failure replaces the same token and closes it, so late progress cannot overwrite
the result. A successful/partial addition is reported only after the book write
has succeeded. Other tasks and ordinary informational notices keep their FIFO
order, bounds, expiry, input priority and plain-text presentation.

Navigation/session resets invalidate an operation's notice token without
cancelling its import. No old progress or result follows the user into another
Reader session. On completion, the existing renderAllBookViews helper refreshes
the currently visible shelf; hidden Home/shelf DOM is not rebuilt. Destination
navigation still renders fresh data as before. PDF text extraction, saved book
identities, Reader/ink/lookup behavior and dormant sharing are unchanged.

Validate with node --test tests/verify-import-feedback.mjs and
node tests/verify-import-feedback-browser.mjs, plus the existing notification,
ingestion, storage, Home/Reader and ink regression suites.
`);
console.log('Applied hash-guarded file import feedback patch.');
