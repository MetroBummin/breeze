/* Upload the remote classics catalog. Dry-run unless --apply is present.
   The object list comes from catalog.json: each book is a local folder
   server/classics/<id>/ with book.txt, the cover named by the catalog URL,
   and any illustrations/<file> the entry lists.
   Writes only to Supabase project hrtfhojbhqvaoiulspto. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)));
const projectHost='hrtfhojbhqvaoiulspto.supabase.co';
const bucket='classics';
const cache='public, max-age=300';

function objectType(file){
  if(file.endsWith('.json'))return 'application/json; charset=utf-8';
  if(file.endsWith('.txt'))return 'text/plain; charset=utf-8';
  if(file.endsWith('.webp'))return 'image/webp';
  if(file.endsWith('.png'))return 'image/png';
  if(file.endsWith('.jpg')||file.endsWith('.jpeg'))return 'image/jpeg';
  return '';
}
function catalogObject(bookId, url){
  let parsed;
  try{parsed=new URL(url);}catch{throw new Error(`${bookId} has an invalid catalog URL`);}
  if(parsed.host!==projectHost)throw new Error(`${bookId} URL is outside https://${projectHost}`);
  const prefix=`/storage/v1/object/public/${bucket}/${bookId}/`;
  if(!parsed.pathname.startsWith(prefix))throw new Error(`${url} is not under ${bucket}/${bookId}/`);
  const relative=decodeURIComponent(parsed.pathname.slice(prefix.length));
  if(!relative||relative.includes('..')||relative.startsWith('/'))throw new Error(`${bookId} object path is not safe: ${relative}`);
  const file=`${bookId}/${relative}`;
  const type=objectType(file);
  if(!type)throw new Error(`${file} is not a txt, webp, png, or jpeg object`);
  return {path:file, file, type, cache};
}
export function classicUploadPlan(catalog){
  if(!catalog||!Array.isArray(catalog.books))throw new Error('catalog.json book list is missing');
  const objects=[{path:'catalog.json', file:'catalog.json', type:'application/json; charset=utf-8', cache}];
  const seen=new Set();
  for(const book of catalog.books){
    if(!book||typeof book.id!=='string'||seen.has(book.id))throw new Error('catalog.json has a duplicate or empty book id');
    seen.add(book.id);
    objects.push(catalogObject(book.id, book.content));
    if(book.cover)objects.push(catalogObject(book.id, book.cover));
    for(const image of book.illustrations||[])objects.push(catalogObject(book.id, image&&image.file));
  }
  return objects;
}

function invokedDirectly(){
  const entry=process.argv[1];
  if(!entry)return false;
  return import.meta.url===pathToFileURL(resolve(entry)).href;
}

async function run(){
  const apply=process.argv.includes('--apply');
  const supabaseUrl=(process.env.SUPABASE_URL||`https://${projectHost}`).replace(/\/$/,'');
  let host='';
  try{host=new URL(supabaseUrl).host;}catch{host='';}
  if(host!==projectHost){
    console.error(`Refusing ${supabaseUrl}. Remote classics upload only to https://${projectHost}.`);
    process.exit(1);
  }

  const catalog=JSON.parse(readFileSync(resolve(root,'catalog.json'),'utf8'));
  let objects;
  try{objects=classicUploadPlan(catalog);}
  catch(error){
    console.error(error&&error.message);
    process.exit(1);
  }
  console.log(`Project: https://${projectHost}`);
  console.log(`Bucket: ${bucket} (public read)`);
  console.log(`Mode: ${apply?'apply':'dry-run'}`);
  for(const object of objects){
    const bytes=readFileSync(resolve(root,object.file)).length;
    console.log(`  ${bucket}/${object.path}  ${bytes} bytes  ${object.type}`);
  }
  for(const book of catalog.books){
    const text=readFileSync(resolve(root,`${book.id}/book.txt`));
    const hash=createHash('sha256').update(text).digest('hex');
    const version=String(book.contentVersion||'').replace(/^sha256:/i,'').trim().toLowerCase();
    console.log(`Catalog book: ${book.id}  sha256 ${book&&book.contentVersion}  text bytes ${text.length}`);
    if(book.bytes!==text.length||version!==hash){
      console.error(`catalog.json does not match ${book.id}/book.txt`);
      process.exit(1);
    }
  }
  if(!apply){
    console.log('Dry run only. Re-run with --apply after approval. Set SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(0);
  }

  const key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
  if(!key){
    console.error('SUPABASE_SERVICE_ROLE_KEY is missing. It is not read from the repo.');
    process.exit(1);
  }
  const headers={apikey:key, Authorization:`Bearer ${key}`};

  const listed=await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`,{headers});
  if(listed.status===404||listed.status===400){
    const created=await fetch(`${supabaseUrl}/storage/v1/bucket`,{
      method:'POST', headers:{...headers,'Content-Type':'application/json'},
      body:JSON.stringify({id:bucket, name:bucket, public:true}),
    });
    if(!created.ok){
      console.error(`Could not create ${bucket}: ${created.status} ${await created.text()}`);
      process.exit(1);
    }
    console.log(`Created public bucket ${bucket}.`);
  }else if(!listed.ok){
    console.error(`Could not read bucket ${bucket}: ${listed.status} ${await listed.text()}`);
    process.exit(1);
  }else{
    const current=await listed.json();
    if(current.public!==true){
      const updated=await fetch(`${supabaseUrl}/storage/v1/bucket/${bucket}`,{
        method:'PUT', headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({public:true}),
      });
      if(!updated.ok){
        console.error(`Bucket ${bucket} is not public and could not be updated: ${updated.status} ${await updated.text()}`);
        process.exit(1);
      }
      console.log(`Marked bucket ${bucket} public.`);
    }
  }

  for(const object of objects){
    const body=readFileSync(resolve(root,object.file));
    const response=await fetch(`${supabaseUrl}/storage/v1/object/${bucket}/${object.path}`,{
      method:'POST',
      headers:{...headers,'Content-Type':object.type,'cache-control':object.cache,'x-upsert':'true'},
      body,
    });
    if(!response.ok){
      console.error(`Upload failed for ${object.path}: ${response.status} ${await response.text()}`);
      process.exit(1);
    }
    console.log(`Uploaded ${object.path}.`);
  }
  console.log(`Public catalog: ${supabaseUrl}/storage/v1/object/public/${bucket}/catalog.json`);
}

if(invokedDirectly())await run();
