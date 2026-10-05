import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
import {parseHTML} from 'linkedom';

const declaration=(path,name)=>{
  const source=readFileSync(new URL('../'+path,import.meta.url),'utf8');
  const match=source.match(new RegExp('^function '+name+'\\([^]*?^\\}','m'));
  assert.ok(match,name);return match[0];
};
const source=declaration('scripts/core/storage.js','bookAssetKeys')+'\n'+declaration('scripts/library/book-edit.js','renderCoverChoices');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function fixture(book){
  const {document}=parseHTML('<div id="ed-covers"></div><a id="ed-cover-source"></a>');
  const requested=[];
  const context=createContext({document,IMG_MARK:'[[IMG]]:',Set,
    bookImageBlob:async(_,key)=>{requested.push(key);return new Blob(['image']);},
    URL:{createObjectURL:()=> 'blob:fixture'}});
  new Script(source).runInContext(context);context.renderCoverChoices(book);
  return {document,requested};
}
for(const kind of ['txt','epub','article'])test(`${kind}: current custom cover is a selected candidate even without source images`,async()=>{
  const f=fixture({id:kind,kind,paras:['Title','Text'],cover:kind+'|cover'});await tick();
  const cells=[...f.document.querySelectorAll('.ed-cover')];
  assert.equal(cells.length,2,'None plus the actual persisted cover');
  assert.equal(cells[0].classList.contains('on'),false,'None must not represent a custom photo');
  assert.equal(cells[1].classList.contains('on'),true);
  assert.equal(cells[1].querySelector('img').src,'blob:fixture');
  assert.deepEqual(f.requested,[kind+'|cover']);
  assert.equal(f.document.getElementById('ed-covers').dataset.pick,kind+'|cover');
});
test('current and source images are deduplicated, and None remains an explicit choice',async()=>{
  const f=fixture({cover:'book|0',imgSrc:{'book|0':'https://example.com/cover'},paras:['[[IMG]]:book|0','[[IMG]]:book|1']});await tick();
  assert.deepEqual(f.requested,['book|0','book|1']);
  const cells=[...f.document.querySelectorAll('.ed-cover')];
  cells[0].onclick();assert.equal(f.document.getElementById('ed-covers').dataset.pick,'');
  assert.equal(cells.filter(cell=>cell.classList.contains('on')).length,1);
  assert.equal(cells[0].classList.contains('on'),true);
});
test('a saved None selection does not invent or revive a custom-cover candidate',async()=>{
  const f=fixture({cover:null,paras:['Title','Text'],coverUpdatedAt:123});await tick();
  assert.equal(f.document.querySelectorAll('.ed-cover').length,1);
  assert.equal(f.document.querySelector('.ed-cover').classList.contains('on'),true);
  assert.equal(f.document.getElementById('ed-covers').dataset.pick,'');
  assert.deepEqual(f.requested,[]);
});
