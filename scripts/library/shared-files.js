/* Native shares stay in App Group storage until BOTH the book and its original
   are durable. Read one bounded chunk at a time; no network/file-path bridge. */
const sharedFileWindow = /** @type {any} */ (window);
const sharedFileAttempts = new Set();
const sharedFileImported = new Set();
let pendingSharedFiles = [];
let sharedFilesReady = false;
let sharedFileImportJob = null;
const SHARED_FILE_MAX_BYTES = 100 * 1024 * 1024;
const SHARED_FILE_CHUNK_BYTES = 256 * 1024;

function receiveSharedFiles(items){
  const unique=new Map();
  for(const item of Array.isArray(items)?items:[]){
    if(!item||typeof item.id!=='string'||! /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(item.id)
      ||typeof item.name!=='string'||! /\.(pdf|epub)$/i.test(item.name)
      ||/[\/\\]/.test(item.name)||!Number.isSafeInteger(item.size)||item.size<=0||item.size>SHARED_FILE_MAX_BYTES)continue;
    unique.set(item.id,item);
  }
  pendingSharedFiles=[...unique.values()];
  void importPendingSharedFiles();
}

async function readSharedFile(item){
  const chunks=[];
  for(let offset=0;offset<item.size;){
    const encoded=await sharedFileWindow.breezeSharedFiles.readChunk(item.id,offset);
    if(typeof encoded!=='string'||encoded.length>4*Math.ceil(SHARED_FILE_CHUNK_BYTES/3))throw Error('파일을 읽지 못했어요.');
    const text=atob(encoded);
    const expected=Math.min(SHARED_FILE_CHUNK_BYTES,item.size-offset);
    if(text.length!==expected)throw Error('파일을 끝까지 읽지 못했어요.');
    chunks.push(Uint8Array.from(text,c=>c.charCodeAt(0)));
    offset+=text.length;
  }
  return new File(chunks,item.name,{type:/\.pdf$/i.test(item.name)?'application/pdf':'application/epub+zip'});
}

function importPendingSharedFiles(){
  if(sharedFileImportJob)return sharedFileImportJob;
  if(!sharedFilesReady||libraryLoadError||!sharedFileWindow.breezeSharedFiles)return Promise.resolve();
  sharedFileImportJob=(async()=>{
    for(;;){
      const item=pendingSharedFiles.find(file=>!sharedFileAttempts.has(file.id));
      if(!item)break;
      sharedFileAttempts.add(item.id);
      try{
        if(!sharedFileImported.has(item.id)){
          const file=await readSharedFile(item);
          // Sharing has no shelf/category context. Use the ordinary unfiled Books destination.
          const result=await importFile(file,null,{folderId:''});
          if(!result?.originalStored){
            toast('공유한 파일은 보관 중이에요. Breeze를 다시 열면 가져오기를 재시도해요.');
            continue;
          }
          sharedFileImported.add(item.id);
        }
        await sharedFileWindow.breezeSharedFiles.acknowledge(item.id);
        pendingSharedFiles=pendingSharedFiles.filter(file=>file.id!==item.id);
      }catch(error){
        console.warn('Shared file import retained for retry:',error);
        toast('공유한 파일을 가져오지 못했어요. Breeze를 다시 열면 재시도해요.');
      }
    }
  })().finally(()=>{sharedFileImportJob=null;});
  return sharedFileImportJob;
}

function startSharedFileImports(){
  sharedFilesReady=true;
  if(Array.isArray(sharedFileWindow.breezeSharedFilesPending))receiveSharedFiles(sharedFileWindow.breezeSharedFilesPending);
  return importPendingSharedFiles();
}
window.addEventListener('breeze-shared-files',event=>receiveSharedFiles(/** @type {CustomEvent} */(event).detail));
document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState!=='visible')return;
  sharedFileAttempts.clear();
  sharedFileWindow.breezeShareInbox?.list?.();
  void importPendingSharedFiles();
});
