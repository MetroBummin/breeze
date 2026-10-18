import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const paragraphs=text=>text.trim().split(/\n\s*\n/);
const aliceText=read('assets/longreads/alice-in-wonderland.txt');
const gatsbyText=read('assets/longreads/the-great-gatsby.txt');
const alice=paragraphs(aliceText);
const gatsby=paragraphs(gatsbyText);
const context={
  console, Set, crypto, TextEncoder, books:[], positions:{}, LS_POS:'pos',
  saved:{}, deleted:[],
  save(key,value){context.saved[key]=value;return true;},
  parseTXT(text){
    return text.replace(/\r/g,'').trim().split(/\n\s*\n+/).map(block=>block.split('\n').map(line=>line.trim()).join(' ')).map(block=>block.trim()).filter(Boolean);
  },
  async bookPut(book){context.saved.book=book.id;return book;},
  async localDelete(store,id){context.deleted.push([store,id]);},
  async imgPut(){},
  renderAllBookViews(){},
  async fetch(url){
    const path=String(url).split('?')[0];
    if(path.endsWith('.txt')) return {ok:true, text:async()=>read(path)};
    return {ok:true, blob:async()=>({size:10, type:'image/webp'})};
  },
};
new Script(read('scripts/core/book-identity.js')).runInNewContext(context);
new Script(read('scripts/library/longreads.js')).runInNewContext(context);
new Script(read('scripts/library/public-domain-layout.js')).runInNewContext(context);
context.applyLongReadCover=async()=>{};
const catalog=()=>new Script('LONG_READS').runInNewContext(context);
const readById=id=>catalog().find(item=>item.id===id);

test('Alice and Gatsby are clean public-domain text with the shipped checksum',()=>{
  for(const [id,text,body] of [['alice-in-wonderland',aliceText,alice],['the-great-gatsby',gatsbyText,gatsby]]){
    const story=readById(id);
    assert.equal(story.presentation,'story');
    assert.equal(story.series,'BREEZE ORIGINAL');
    assert.equal(story.sha256,createHash('sha256').update(text).digest('hex'));
    assert.equal(story.wordCount,text.trim().split(/\s+/).length);
    assert.equal(body.length,text.trim().split(/\n\n/).length);
    assert.doesNotMatch(text,/Gutenberg|START OF|END OF THE PROJECT|www\.gutenberg\.org/);
    assert.doesNotMatch(text,/["]|--/);
    assert.ok(statSync(new URL('../'+story.cover,import.meta.url)).size>=100000);
    assert.ok(statSync(new URL('../'+story.cover,import.meta.url)).size<=180000);
  }
  assert.equal(alice[0],'Chapter I. Down the Rabbit-Hole');
  assert.equal(alice.filter(paragraph=>/^Chapter [IVXLC]+\./.test(paragraph)).length,12);
  assert.equal(alice.at(-1),'THE END');
  assert.ok(alice.includes('Who would not give all else for two pennyworth only of beautiful Soup?'));
  assert.equal(gatsby[0],'Once again');
  assert.deepEqual(gatsby.filter(paragraph=>/^Chapter [IVX]+$/.test(paragraph)),
    ['Chapter I','Chapter II','Chapter III','Chapter IV','Chapter V','Chapter VI','Chapter VII','Chapter VIII','Chapter IX']);
  assert.equal(gatsby.at(-1),'So we beat on, boats against the current, borne back ceaselessly into the past.');
  assert.equal(JSON.stringify(new Script('CLASSICS.map(classic=>classic.id)').runInNewContext(context)),'[]');
});

test('verse indent and partial italics stay presentation metadata',()=>{
  const crocodile=alice.indexOf('“How doth the little crocodile');
  const book={longReadId:'alice-in-wonderland'};
  const opening=context.publicDomainRole(book,{f:crocodile,t:alice[crocodile]});
  const indented=context.publicDomainRole(book,{f:crocodile+1,t:alice[crocodile+1]});
  assert.equal(opening.role,'verse'); assert.equal(opening.indent,false); assert.equal(opening.stanza,true);
  assert.equal(indented.role,'verse'); assert.equal(indented.indent,true); assert.equal(indented.stanza,false);
  const marked=context.publicDomainMarks(book,{f:3,t:alice[3]});
  assert.equal(alice[3].slice(marked[0].start, marked[0].end),'very');
  assert.equal(marked[0].kind,'em');
  const anybody=gatsby.findIndex(paragraph=>paragraph.includes('anybody'));
  const word=gatsby[anybody].indexOf('anybody');
  const marks=context.publicDomainMarks({longReadId:'the-great-gatsby'},{f:anybody,t:gatsby[anybody]});
  assert.ok(marks.some(mark=>mark.kind==='em'&&mark.start===word&&mark.end===word+3));
  assert.equal(context.publicDomainRole(book,{f:crocodile,t:'Edited line'}),null);
});

test('an imported EPUB keeps its book id and becomes a paragraph in the text edition',async()=>{
  const story=readById('alice-in-wonderland');
  const book={id:'saved-alice',classicId:story.id,kind:'epub',title:'Old Alice',paras:['epub page'],formatting:{blocks:[]},original:{spine:1},sourceMap:{}};
  context.books.push(book);
  context.positions[book.id]={p:.25,t:50,mode:'original',original:{cfi:'old'},y:4,dy:2};
  const migrated=await context.migrateBundledClassic(book,story);
  assert.equal(migrated,book);
  assert.equal(book.id,'saved-alice');
  assert.equal(book.kind,'txt');
  assert.equal(book.longReadId,story.id);
  assert.equal(book.paras[0],alice[0]);
  assert.equal(book.formatting,null);
  assert.equal(book.original,null);
  assert.equal(book.sourceMap,null);
  const place=context.positions[book.id];
  assert.equal(place.mode,'text');
  assert.equal(place.original,null);
  assert.equal(place.pi,Math.round(.25*(book.paras.length-1)));
  assert.deepEqual(context.deleted,[['originals',book.id]]);
  const again=await context.migrateBundledClassic(book,story);
  assert.equal(again,book);
  assert.equal(context.positions[book.id].pi,place.pi);
  const odyssey={id:'saved-odyssey',classicId:'odyssey',kind:'epub',paras:['keep']};
  const open={id:'open-gatsby',classicId:'the-great-gatsby',kind:'epub',paras:['keep']};
  context.books.push(odyssey,open);
  context.curBook=open;
  context.activeAppView=()=>'read';
  await context.migrateBundledClassics();
  assert.equal(odyssey.kind,'epub');
  assert.deepEqual(odyssey.paras,['keep']);
  assert.equal(open.kind,'epub');
});
