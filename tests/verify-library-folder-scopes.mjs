import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../scripts/library/folders.js',import.meta.url),'utf8');
function fixture(fail=false){
 const legacy={folders:[{id:'shared',name:'School'},{id:'short',name:'Articles'},{id:'empty',name:'Unused'}],assignments:{book:'shared',article:'shared',article2:'short'}};
 let saved=JSON.stringify(legacy),scope='longform';
 const books=[{id:'book',kind:'txt'},{id:'article',kind:'paste'},{id:'article2',kind:'paste'}];
 const context={books,structuredClone,crypto,console,toast(){},renderAllBookViews(){},isCasual:b=>b.kind==='paste',
  document:{addEventListener(){},getElementById:()=>({classList:{contains:()=>scope==='casuals'}})},
  localStorage:{getItem:()=>saved,setItem:(key,value)=>{if(fail)throw Error('full');saved=value;}}};
 runInNewContext(source+'\nglobalThis.state=()=>libraryFolders;',context);
 return {app:context,legacy,stored:()=>JSON.parse(saved),scope:value=>scope=value};
}
test('legacy migration retains assignments and splits shared/unused categories independently',()=>{
 const f=fixture(),a=f.app;a.migrateLibraryFolders();
 const next=f.stored(),long=next.folders.find(x=>x.id==='shared'),short=next.folders.find(x=>x.id===next.assignments.article);
 assert.equal(long.scope,'longform');assert.equal(short.scope,'casuals');assert.equal(short.name,long.name);
 assert.notEqual(short.id,long.id);assert.equal(next.assignments.book,'shared');
 assert.equal(next.folders.find(x=>x.id==='short').scope,'casuals');
 assert.equal(next.folders.filter(x=>x.name==='Unused').length,2);
 a.migrateLibraryFolders();assert.deepEqual(f.stored(),next,'migration is idempotent');
 a.renameLibraryFolder(short.id,'News');assert.equal(f.stored().folders.find(x=>x.id===long.id).name,'School');
 a.deleteLibraryFolder(short.id);assert.equal(f.stored().assignments.book,'shared');assert.equal(f.stored().assignments.article,undefined);
});
test('scope controls naming, selection, filtering and assignment independently',()=>{
 const f=fixture(),a=f.app;a.migrateLibraryFolders();
 assert.equal(a.createLibraryFolder('New'),true);const long=a.currentLibraryFolder();
 assert.equal(a.assignLibraryFolder('book',long),true);assert.equal(a.assignLibraryFolder('article',long),false);
 f.scope('casuals');assert.equal(a.currentLibraryFolder(),'');assert.equal(a.changeLibraryFolder(long),false);
 assert.equal(a.createLibraryFolder('New'),true);const short=a.currentLibraryFolder();assert.notEqual(short,long);
 assert.equal(a.createLibraryFolder('New'),false);assert.equal(a.assignLibraryFolder('article',short),true);
 assert.equal(a.folderMatches('book','longform'),true);assert.equal(a.folderMatches('article','casuals'),true);
 assert.equal(a.currentLibraryFolder('longform'),long);
 a.deleteLibraryFolder(short);assert.equal(a.currentLibraryFolder('longform'),long);assert.equal(f.stored().assignments.book,long);
});
test('failed migration preserves old data and blocks edits until a clean reload',()=>{
 const f=fixture(true);f.app.migrateLibraryFolders();assert.deepEqual(f.stored(),f.legacy);
 assert.equal(f.app.createLibraryFolder('Do not replace'),false);assert.deepEqual(f.stored(),f.legacy);
 assert.equal(JSON.stringify(f.app.state()),JSON.stringify(f.legacy));
});
