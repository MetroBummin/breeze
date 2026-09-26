import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

const declaration=(path,name)=>{
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const match=source.match(new RegExp('^(?:async )?function '+name+'\\([^]*?^\\}','m'));
  assert.ok(match,`Missing function ${name}`);return match[0];
};
const source='const articleBookRepairJobs=new Map();\n'+[
  ['scripts/importers/article.js','waitForArticleBookRepair'],
  ['scripts/importers/article.js','repairIncompleteSocialBook'],
  ['scripts/library/book-edit.js','saveEditSheet'],
  ['scripts/library/book-edit.js','pickCoverFile'],
  ['scripts/library/book-edit.js','runDelete'],
].map(([path,name])=>declaration(path,name)).join('\n');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const copy=value=>JSON.parse(JSON.stringify(value));
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
function world(extra={}){
  const book={id:'stale',title:'https://t.co/old',kind:'article',paras:['https://t.co/old','https://t.co/old'],
    addedAt:1,sourceUrl:'https://x.com/writer/status/1',cover:null,...extra};
  const elements={
    'ed-title':{value:'My edited title'},
    'ed-covers':{dataset:{pick:''}},
    'ed-cover-source':{hidden:false},
  };
  const state={stored:copy(book),writes:[],images:[],deleted:[],closed:0,views:0,coverViews:[]};
  const write=deferred(),image=deferred();let writes=0;
  const context=createContext({Date,Map,Promise,books:[book],editTarget:book,
    socialLinkOnlyText:text=>/^https?:\/\/\S+$/.test(text),
    articleAssemble:(title,blocks)=>({paras:[title,...blocks.map(block=>block.t)],formatting:{blocks}}),
    bookContentFingerprint:paras=>paras.join('|'),
    bookPut:async value=>{
      const snapshot=copy(value);state.writes.push(snapshot);
      if(++writes===1)await write.promise;
      state.stored=snapshot;
    },
    imgPut:async(key,file)=>{state.images.push({key,file});await image.promise;},
    deleteBook:async value=>{state.deleted.push(value.id);state.stored=null;context.books=context.books.filter(item=>item.id!==value.id);},
    document:{getElementById:id=>elements[id]},
    closeEditSheet:()=>{state.closed++;context.editTarget=null;},
    renderCoverChoices:value=>state.coverViews.push(value.id),
    renderHome(){},queueSync(){},toast(){},renderAllBookViews:()=>state.views++,
  });
  new Script(source).runInContext(context);
  const parsed={title:'Recovered article',blocks:[{r:'p',t:'Full recovered article text.'}],
    paras:['Recovered article','Full recovered article text.'],formatting:{blocks:[]}};
  const repair=()=>context.repairIncompleteSocialBook(book,parsed,{cover:'art|recovered',imgSrc:{'art|recovered':'https://images.example/photo.jpg'}});
  return {context,book,elements,state,write,image,repair};
}

test('editing during repair waits for durable content and retains the same book object',async()=>{
  const f=world(),repair=f.repair(),edit=f.context.saveEditSheet();
  await tick();assert.equal(f.state.writes.length,1);assert.equal(f.book.paras[1],'https://t.co/old');
  f.write.resolve();const repaired=await repair;await edit;
  assert.equal(repaired,f.book);assert.equal(f.context.books[0],f.book);
  assert.equal(f.state.stored.paras[1],'Full recovered article text.');
  assert.equal(f.state.stored.title,'My edited title');assert.equal(f.book.title,'My edited title');
  assert.equal(f.state.writes.length,2);
});

test('a failed source repair leaves the old item editable',async()=>{
  const f=world(),repair=f.repair();const failed=assert.rejects(repair,/durable failure/);
  const edit=f.context.saveEditSheet();f.write.reject(Error('durable failure'));
  await failed;await edit;
  assert.equal(f.state.stored.paras[1],'https://t.co/old');assert.equal(f.state.stored.title,'My edited title');
});

for(const action of ['close','switch'])test(`${action} while waiting cancels the pending edit`,async()=>{
  const f=world(),repair=f.repair(),edit=f.context.saveEditSheet();
  f.context.editTarget=action==='close'?null:{id:'other',title:'Other book'};
  f.elements['ed-title'].value='Other sheet title';f.write.resolve();await repair;await edit;
  assert.equal(f.state.writes.length,1);assert.equal(f.book.title,'Recovered article');assert.equal(f.state.closed,0);
});

test('cover selection waits for repair and saves the recovered paragraphs',async()=>{
  const f=world(),repair=f.repair();
  const pick=f.context.pickCoverFile({files:[{type:'image/png'}],value:'photo.png'});
  f.image.resolve();await tick();assert.equal(f.state.writes.length,1);assert.equal(f.book.cover,null);
  f.write.resolve();await repair;await pick;
  assert.equal(f.state.stored.cover,'stale|cover');assert.equal(f.state.stored.paras[1],'Full recovered article text.');
  assert.deepEqual(f.state.coverViews,['stale']);
});

test('switching sheets during image persistence cannot apply the cover to the new book',async()=>{
  const f=world(),repair=f.repair();
  const pick=f.context.pickCoverFile({files:[{type:'image/png'}],value:'photo.png'});
  const other={id:'other',title:'Other book',cover:null};f.context.editTarget=other;
  f.image.resolve();f.write.resolve();await repair;await pick;
  assert.equal(f.state.writes.length,1);assert.equal(other.cover,null);assert.deepEqual(f.state.coverViews,[]);
  assert.equal(f.state.images[0].key,'stale|cover');
});

for(const failure of [false,true])test(`deletion waits for ${failure?'failed':'successful'} repair and wins afterward`,async()=>{
  const f=world(),repair=f.repair();
  const settled=failure?assert.rejects(repair,/durable failure/):repair;
  const deletion=f.context.runDelete();await tick();
  assert.equal(f.state.closed,1);assert.deepEqual(f.state.deleted,[]);
  if(failure)f.write.reject(Error('durable failure'));else f.write.resolve();
  await settled;await deletion;
  assert.deepEqual(f.state.deleted,['stale']);assert.equal(f.state.stored,null);assert.equal(f.context.books.length,0);
});

test('manual URL title and explicit no-cover selection survive repair',async()=>{
  const f=world({renamedAt:50,coverUpdatedAt:51}),repair=f.repair();f.write.resolve();await repair;
  assert.equal(f.book.title,'https://t.co/old');assert.equal(f.book.cover,null);
  assert.equal(f.book.renamedAt,50);assert.equal(f.book.coverUpdatedAt,51);
});

test('book editor remains usable when the optional article helper is absent',async()=>{
  const f=world();f.context.waitForArticleBookRepair=undefined;
  const edit=f.context.saveEditSheet();f.write.resolve();await edit;
  assert.equal(f.state.stored.title,'My edited title');
});
