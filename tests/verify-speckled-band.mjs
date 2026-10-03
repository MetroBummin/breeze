import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const original=read('docs/content/speckled-band/original.txt');
const adapted=read('assets/longreads/speckled-band.txt');
const edits=JSON.parse(read('docs/content/speckled-band/edits.json'));
const paragraphs=text=>text.trim().split(/\n\s*\n/);
test('complete story has one auditable, ordered baseline and no unlogged rewrites',()=>{
  assert.equal(createHash('sha256').update(original).digest('hex'),'255679f12fe1e457f7b5ee664389de1e507c8a557ccacd088508f330c433e2c7');
  assert.equal(original.trim().split(/\s+/).length,9805);
  assert.equal(adapted.trim().split(/\s+/).length,9804);
  assert.equal(paragraphs(original).length,251);
  assert.equal(paragraphs(adapted).length,251);
  const replay=paragraphs(original);
  for(const edit of edits){
    assert.equal(replay[edit.paragraph-1].split(edit.before).length-1,edit.count||1);
    replay[edit.paragraph-1]=replay[edit.paragraph-1].replaceAll(edit.before,edit.after);
    assert.ok(edit.reason);
  }
  assert.equal(replay.join('\n\n')+'\n',adapted);
  assert.ok(adapted.startsWith('On glancing over my notes'));
  assert.ok(adapted.endsWith('weigh very heavily upon my conscience."\n'));
  assert.doesNotMatch(adapted,/Gutenberg|ENGINEER.S THUMB|START OF|END OF/);
});
test('catalog has separate stable identity and checksum for complete local text',()=>{
  const context={console,Set,books:[]};
  new Script(read('scripts/library/longreads.js')).runInNewContext(context);
  const all=context.pendingLongReads(),story=all.find(item=>item.id==='sherlock-holmes-speckled-band');
  assert.equal(all.length,4);
  assert.equal(story.wordCount,9804);
  assert.equal(story.cover,'assets/longreads/covers/speckled-band.png');
  assert.equal(createHash('sha256').update(readFileSync(new URL('../'+story.cover,import.meta.url))).digest('hex'),'800b87d1e50a18fd622b9f8df1162bebf94c4f2e158bb470855bcd2c3fb13da2');
  assert.ok(all.filter(item=>/scandal-in-bohemia|red-headed-league/.test(item.id)).every(item=>item.cover===''),'No wrong-title artwork on other Holmes stories');
  assert.equal(story.sha256,createHash('sha256').update(adapted).digest('hex'));
  assert.match(story.editionNote,/not Doyle’s verbatim text/);
  context.books.push({longReadId:story.id});
  assert.deepEqual(Array.from(context.pendingLongReads(),item=>item.id),['backroom-homeward-bound','sherlock-holmes-scandal-in-bohemia','sherlock-holmes-red-headed-league']);
});

test('cover repair cannot overwrite a concurrent custom cover or restore a deleted book',async()=>{
 for(const action of ['custom','delete']){
  let resume;const gate=new Promise(resolve=>resume=resolve),book={id:'saved',longReadId:'sherlock-holmes-speckled-band'},writes=[];
  const context={console,Set,books:[book],AbortController,setTimeout,clearTimeout,
   fetch:async()=>({ok:true,blob:async()=>({size:2563098,type:'image/png'})}),
   imgPut:async key=>{writes.push(key);await gate;},bookPut:async()=>writes.push('book'),renderAllBookViews(){}};
  new Script(read('scripts/library/longreads.js')).runInNewContext(context);
  const pending=context.restoreMissingLongReadCovers();
  for(let i=0;i<10&&!writes.length;i++)await Promise.resolve();
  assert.equal(writes[0],'saved|bundled-cover');
  if(action==='custom')book.cover='saved|cover';else context.books=[];
  resume();await pending;
  assert.equal(writes.includes('book'),false,action);
  if(action==='custom')assert.equal(book.cover,'saved|cover');else assert.equal(context.books.length,0);
 }
});
