import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=process.env.BREEZE_HOME_READING_ROOT||fileURLToPath(new URL('../',import.meta.url));
const library=readFileSync(resolve(root,'scripts/library/library.js'),'utf8');
const preview=readFileSync(resolve(root,'scripts/library/article-preview.js'),'utf8');
const catalog=readFileSync(resolve(root,'scripts/library/longreads.js'),'utf8');
function fn(source,name){
 const start=source.indexOf(`function ${name}(`);
 return start<0?'':source.slice(start,source.indexOf('\n}',start)+2);
}
function environment(){
 const {document,HTMLElement}=parseHTML('<html><body><div id="shelf"></div></body></html>');
 const positions={},books=[],opened=[],previews=[];
 const context=vm.createContext({document,HTMLElement,books,positions,LONG_READS:[{id:'story-a'},{id:'story-b'}],URL,
  posOf:id=>positions[id]||{p:0,t:0},paletteOf:()=>0,WAVE:()=>'',applyCover(){},readMinutes:()=>3,
  coverArtwork:()=>'',accessibleLibraryCard(){},articlePreviewOpening:null,
  articlePreviewClose(){},openBook:book=>{opened.push(book);return book;},openLongReadPreview:read=>previews.push(read),
  wireBookCard:(card,book)=>{card.dataset.localBook=book.id;return card;},
  homeRegularTile:card=>{const tile=document.createElement('div');tile.append(card);return tile;}});
 for(const name of ['el','fillCard','readingPercent','nowReadingLabel','bookCard','homeBookSpec','reconcileHomeCards'])
  vm.runInContext(fn(library,name),context);
 vm.runInContext(fn(preview,'openCasualPreviewOrReader')+fn(preview,'openLongReadPreviewOrReader')+fn(catalog,'longReadCard'),context);
 return {context,positions,books,opened,previews,shelf:document.getElementById('shelf')};
}
test('reused Home cover updates 66 to 68 and backward progress from the current committed record',()=>{
 const {context:c,positions,shelf}=environment(),book={id:'local-a',title:'A story',kind:'txt',paras:['a','b']};
 positions[book.id]={p:173/260,t:1};
 c.reconcileHomeCards(shelf,[c.homeBookSpec(book,false)]);
 const tile=shelf.firstElementChild,cover=tile.querySelector('img.cover');
 assert.equal(tile.querySelector('.prog').textContent,'66% 읽음');
 for(const [p,label] of [[177/260,'68% 읽음'],[173/260,'66% 읽음'],[0,'0% 읽음']]){
  positions[book.id]={p,t:2};c.reconcileHomeCards(shelf,[c.homeBookSpec(book,false)]);
  assert.equal(shelf.firstElementChild,tile,'partial progress preserves the existing tile');
  assert.equal(tile.querySelector('img.cover'),cover,'progress does not replace the cover');
  assert.equal(tile.querySelector('.prog').textContent,label);
 }
});
test('Home cover adds a first-read label and removes it when the current record is unread',()=>{
 const {context:c,positions,shelf}=environment(),book={id:'local-a',title:'A story',kind:'txt',paras:['a','b']};
 c.reconcileHomeCards(shelf,[c.homeBookSpec(book,false)]);const tile=shelf.firstElementChild;
 assert.equal(tile.querySelector('.prog'),null);
 positions[book.id]={p:.68,t:1};c.reconcileHomeCards(shelf,[c.homeBookSpec(book,false)]);
 assert.equal(tile.querySelector('.prog')?.textContent,'68% 읽음');
 positions[book.id]={p:0,t:0};c.reconcileHomeCards(shelf,[c.homeBookSpec(book,false)]);
 assert.equal(tile.querySelector('.prog'),null);
});
test('same PDF completion to 50 to 19 updates Home just as the fresh library shelf does',()=>{
 const {context:c,positions,shelf}=environment(),book={id:'same-pdf',title:'A PDF',kind:'pdf',paras:['a','b']};
 let partialTile;
 for(const [p,label] of [[1,'100% 읽음'],[.5,'50% 읽음'],[.19,'19% 읽음']]){
  positions[book.id]={p,t:1};c.reconcileHomeCards(shelf,[c.homeBookSpec(book,false)]);
  const tile=shelf.firstElementChild;
  assert.equal(tile.querySelector('.prog').textContent,label);
  assert.equal(c.bookCard(book,null,false).querySelector('.prog').textContent,label);
  if(p===.5)partialTile=tile;
  if(p===.19)assert.equal(tile,partialTile,'50 to 19 updates the retained card');
 }
});
test('started bundled library copies open their exact record; unread copies keep preview',()=>{
 const {context:c,positions,books,opened,previews}=environment();
 const book={id:'canonical-copy',longReadId:'story-a',kind:'txt'},other={...book,id:'other-copy'};
 books.push(other,book);positions[book.id]={p:.68,t:1};
 c.openCasualPreviewOrReader(book);
 assert.equal(opened[0],book,'resume the clicked canonical record, not another copy or a title match');
 assert.equal(previews.length,0);
 c.openCasualPreviewOrReader(other);assert.equal(previews[0],c.LONG_READS[0]);
});
test('catalog cards resolve current library identity; deletion restores preview even with stale progress',()=>{
 const {context:c,positions,books,opened,previews}=environment(),read={id:'story-a',title:'A story'};
 const card=c.longReadCard(read);
 card.onclick();assert.equal(previews.length,1);
 const started={id:'copy-a',longReadId:'story-a',kind:'txt'};books.push(started);positions[started.id]={p:.68,t:1};
 card.onclick();assert.equal(opened[0],started);assert.equal(previews.length,1);
 const replacement={...started,title:'Renamed saved copy'};books.splice(0,1,replacement);
 card.onclick();assert.equal(opened[1],replacement);
 books.length=0;card.onclick();assert.equal(previews.length,2);assert.equal(opened.length,2);
 const reimported={id:'reimport',longReadId:'story-a',kind:'txt'};books.push(reimported);
 card.onclick();assert.equal(previews.length,3,'an unread reimport still needs Read');
 positions[reimported.id]={p:0,t:3};card.onclick();assert.equal(opened[2],reimported,'started at 0% also resumes');
});
