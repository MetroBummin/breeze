import pathlib,os
ROOT=pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'candidate'
def patch(name,old,new,count=1):
 p=ROOT/name;s=p.read_text();assert s.count(old)==count,(name,old[:90],s.count(old));p.write_text(s.replace(old,new))
patch('server/article/safe-fetch.mjs','export async function fetchPublicArticle(raw,', '/** @param {string} raw\n * @param {{signal?:AbortSignal,asImage?:boolean,resolve?:typeof lookup,transport?:typeof requestPinned}} [options] */\nexport async function fetchPublicArticle(raw,')
patch('tests/verify-ingestion-browser.mjs',"assert(await page.locator('#rtext .w').count()>10);", "await page.waitForFunction(()=>document.querySelectorAll('#rtext .w').length>10);\n   assert(await page.locator('#rtext .w').count()>10);")
patch('scripts/core/storage.js',"async function originalPut(id,record){return assetWrite('originals',id,record);}\nasync function originalGet(id){return await assetRead('originals',id)||null;}\nasync function originalAll(){return await assetRead('originals',null,true)||[];}","""/* Some WebKit IndexedDB backends abort Blob writes while ArrayBuffer works.
   Retry that encoding once; a quota/security failure must still be reported. */
function originalRecordBlob(record){
  if(!record || !(record.originalBytes instanceof ArrayBuffer))return record;
  const {originalBytes,originalType,...meta}=record;
  return {...meta,blob:new Blob([originalBytes],{type:originalType||'application/octet-stream'})};
}
async function originalPut(id,record){
  try{return await assetWrite('originals',id,record);}
  catch(error){
    if(!(record&&record.blob instanceof Blob) || ['QuotaExceededError','SecurityError','NotAllowedError'].includes(error&&error.name))throw error;
    const {blob,...meta}=record;
    return assetWrite('originals',id,{...meta,originalBytes:await blob.arrayBuffer(),originalType:blob.type});
  }
}
async function originalGet(id){return originalRecordBlob(await assetRead('originals',id))||null;}
async function originalAll(){return (await assetRead('originals',null,true)||[]).map(originalRecordBlob);}""")
patch('scripts/core/storage.js',"const originalEntries=()=>storeEntries('originals');", "const originalEntries=async()=>(await storeEntries('originals')).map(([key,value])=>[key,originalRecordBlob(value)]);")
patch('tests/verify-audit-hardening.mjs',"test('independent status/meaning/visibility", """test('raw original Blob fallback roundtrips metadata and rejects quota without retry',async()=>{
 const c=context({window:{},navigator:{},indexedDB:{}});runInContext(source('scripts/core/storage.js'),c);
 let attempts=0,stored;
 c.assetWrite=async(name,id,record)=>{attempts++;if(record.blob)throw Error('Storage transaction aborted');stored=record;};
 await c.originalPut('original',{hash:'abc',name:'exam.pdf',blob:new Blob(['original'],{type:'application/pdf'})});
 assert.equal(attempts,2);assert.equal(stored.blob,undefined);
 const restored=c.originalRecordBlob(stored);assert.equal(restored.hash,'abc');assert.equal(restored.name,'exam.pdf');
 assert.equal(await restored.blob.text(),'original');assert.equal(restored.blob.type,'application/pdf');assert.equal(restored.originalBytes,undefined);
 attempts=0;c.assetWrite=async()=>{attempts++;throw Object.assign(Error('quota'),{name:'QuotaExceededError'});};
 await assert.rejects(c.originalPut('original',{blob:new Blob(['x'])}),/quota/);assert.equal(attempts,1);
});
test('independent status/meaning/visibility""")
report=(pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'payload/.audit/report.md').read_text()
(ROOT/'docs/qa/integrity-hardening-20260925.md').write_text(report)
print('Fixed confirmed WebKit original Blob persistence, lazy Reader timing and Deno option contract.')
