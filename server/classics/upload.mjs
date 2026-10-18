/* Upload the remote classics catalog. Dry-run unless --apply is present.
   Writes only to Supabase project hrtfhojbhqvaoiulspto. */
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)));
const apply=process.argv.includes('--apply');
const projectHost='hrtfhojbhqvaoiulspto.supabase.co';
const bucket='classics';
const objects=[
  {path:'catalog.json', file:'catalog.json', type:'application/json; charset=utf-8', cache:'public, max-age=300'},
  {path:'pride-and-prejudice/book.txt', file:'pride-and-prejudice/book.txt', type:'text/plain; charset=utf-8', cache:'public, max-age=300'},
  {path:'pride-and-prejudice/cover.webp', file:'pride-and-prejudice/cover.webp', type:'image/webp', cache:'public, max-age=300'},
];

const supabaseUrl=(process.env.SUPABASE_URL||`https://${projectHost}`).replace(/\/$/,'');
let host='';
try{host=new URL(supabaseUrl).host;}catch{host='';}
if(host!==projectHost){
  console.error(`Refusing ${supabaseUrl}. Remote classics upload only to https://${projectHost}.`);
  process.exit(1);
}

const catalog=JSON.parse(readFileSync(resolve(root,'catalog.json'),'utf8'));
const book=catalog.books[0];
const text=readFileSync(resolve(root,'pride-and-prejudice/book.txt'));
console.log(`Project: https://${projectHost}`);
console.log(`Bucket: ${bucket} (public read)`);
console.log(`Mode: ${apply?'apply':'dry-run'}`);
for(const object of objects){
  const bytes=readFileSync(resolve(root,object.file)).length;
  console.log(`  ${bucket}/${object.path}  ${bytes} bytes  ${object.type}`);
}
console.log(`Catalog book: ${book.id}  sha256 ${book.contentVersion}  text bytes ${text.length}`);
if(book.bytes!==text.length||book.contentVersion.length!==64){
  console.error('catalog.json does not match pride-and-prejudice/book.txt');
  process.exit(1);
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
