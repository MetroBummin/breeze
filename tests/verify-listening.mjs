// 듣기 모드: which books may listen, and how playback walks sentences.
// The pure parts of scripts/reader/listening.js run in a VM with the real
// catalog (longreads.js) and the real sentence splitter (mode-bridge.js).
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const context={console,Set,Map,books:[],Date,Math,Number,String,JSON,setTimeout,clearTimeout};
for(const file of ['scripts/importers/ligatures.js','scripts/library/longreads.js',
  'scripts/reader/mode-bridge.js','scripts/reader/listening.js'])
  new Script(read(file)).runInNewContext(context);
const fallback=id=>new Script('CLASSIC_FALLBACKS').runInNewContext(context).find(read=>read.id===id);
const longRead=id=>new Script('LONG_READS').runInNewContext(context).find(read=>read.id===id);

test('only the bundled public-domain classics can listen', ()=>{
  const eligible=context.listeningBookEligible;
  const imported=read=>({id:'file-0123',kind:'txt',longReadId:read.id,title:read.title,
    attribution:{license:read.license}});
  assert.equal(eligible(imported(fallback('alice-in-wonderland'))),true,'Alice');
  assert.equal(eligible(imported(fallback('the-great-gatsby'))),true,'Gatsby');
  assert.equal(eligible(imported(longRead('sherlock-holmes-speckled-band'))),true,'Holmes');
  // A remote-catalog classic whose manifest is not cached yet keeps its imported license.
  assert.equal(eligible({kind:'txt',longReadId:'pride-and-prejudice',attribution:{license:'Public domain in the USA'}}),true);

  // Everything a reader brings in, and everything that is not public domain.
  assert.equal(eligible(null),false);
  assert.equal(eligible({id:'file-a',kind:'txt',title:'My notes'}),false,'user TXT');
  assert.equal(eligible({id:'file-b',kind:'epub',title:'Alice',author:'Lewis Carroll'}),false,'user EPUB');
  assert.equal(eligible({id:'file-c',kind:'pdf',title:'Alice'}),false,'user PDF');
  assert.equal(eligible({id:'file-d',kind:'article',sourceUrl:'https://example.com/a',site:'Example'}),false,'article/RSS');
  assert.equal(eligible({id:'file-e',kind:'article',sourceUrl:'https://archiveofourown.org/works/1'}),false,'AO3');
  assert.equal(eligible({...imported(fallback('alice-in-wonderland')),transient:true,id:'preview:x'}),false,'preview');
  assert.equal(eligible({...imported(fallback('alice-in-wonderland')),kind:'epub'}),false,'old EPUB classic before migration');
  assert.equal(eligible(imported(longRead('backroom-homeward-bound'))),false,'CC BY-SA Homeward');
  assert.equal(eligible({kind:'txt',longReadId:'not-a-catalog-id'}),false,'unknown id without a license');
  // Copying catalog-looking fields onto a user upload does not invent a license.
  assert.equal(eligible({kind:'txt',longReadId:'',title:"Alice's Adventures in Wonderland",sourceUrl:'https://www.gutenberg.org/ebooks/11'}),false);

  assert.equal(context.listeningSupported(null),false);
  assert.equal(context.listeningSupported({}),false);
  assert.equal(context.listeningSupported({speechSynthesis:{},SpeechSynthesisUtterance:function(){}}),true);
});

const paragraphs=['He was tired. It was getting dark.','','“Oh dear!” said the Rabbit. Then he ran.','The end'];
const blocks=paragraphs.map((text,index)=>({pi:index*2,text}));
const partsOf=block=>context.listeningSentenceParts(block.pi,block.text);
const step=(cursor,delta)=>context.listeningStep(blocks,cursor,delta,partsOf);
const text=sentence=>sentence&&sentence.text;

test('sentences use the long-press splitter and normalize the cursor', ()=>{
  assert.deepEqual([...partsOf(blocks[0]).map(part=>part.text)],['He was tired.','It was getting dark.']);
  assert.equal(text(step({index:0,start:0},0)),'He was tired.');
  // A cursor inside a sentence resolves to that sentence's start.
  const inside=step({index:0,start:18},0);
  assert.equal(inside.text,'It was getting dark.');assert.equal(inside.start,14);assert.equal(inside.pi,0);
  // A cursor on an empty paragraph moves forward to the next sentence.
  assert.equal(text(step({index:1,start:0},0)),'“Oh dear!”');
  assert.equal(step({index:9,start:0},0),null);
  assert.equal(step(null,1),null);
});

test('⏭ and auto-advance walk across paragraph boundaries and stop at the end', ()=>{
  const seen=[];
  for(let cursor=step({index:0,start:0},0);cursor;cursor=step(cursor,1)) seen.push([cursor.index,cursor.text]);
  assert.deepEqual(seen,[
    [0,'He was tired.'],[0,'It was getting dark.'],
    [2,'“Oh dear!”'],[2,'said the Rabbit.'],[2,'Then he ran.'],[3,'The end'],
  ]);
  assert.equal(step({index:3,start:0},1),null,'Past the last sentence there is nothing');
});

test('⏮ restarts, and a quick second press goes to the previous sentence across paragraphs', ()=>{
  assert.equal(context.listeningPreviousAction(10_000,0),'restart');
  assert.equal(context.listeningPreviousAction(10_000,9_200),'previous');
  assert.equal(context.listeningPreviousAction(10_000,10_000-1300),'restart');
  assert.equal(context.listeningPreviousAction(10_000,10_500),'restart','A clock that moved backwards is not a double press');
  const third=step({index:2,start:0},0);
  assert.equal(text(step(third,-1)),'It was getting dark.','Skips the empty paragraph going back');
  assert.equal(step({index:0,start:0},-1),null,'Nothing before the first sentence');
});

test('chunks: the rest of the paragraph for boundary voices, one sentence otherwise', ()=>{
  const whole=context.listeningChunk(blocks,{index:2,start:11},partsOf,true);
  assert.equal(whole.index,2);
  assert.equal(whole.text,'said the Rabbit. Then he ran.');
  assert.deepEqual(JSON.parse(JSON.stringify(whole.sentences.map(s=>[s.start,s.offset,s.text]))),[[11,0,'said the Rabbit.'],[28,17,'Then he ran.']]);
  // A word boundary inside the utterance names the sentence being read.
  assert.equal(context.listeningChunkSentence(whole,0).text,'said the Rabbit.');
  assert.equal(context.listeningChunkSentence(whole,16).text,'said the Rabbit.','The joining space belongs to the sentence before');
  assert.equal(context.listeningChunkSentence(whole,17).text,'Then he ran.');
  const single=context.listeningChunk(blocks,{index:0,start:0},partsOf,false);
  assert.equal(single.text,'He was tired.');assert.equal(single.sentences.length,1);
  // The queued-ahead chunk continues across the empty paragraph and stops at the end.
  const next=context.listeningNextChunk(blocks,context.listeningChunk(blocks,{index:0,start:0},partsOf,true),partsOf,true);
  assert.equal(next.text,'“Oh dear!” said the Rabbit. Then he ran.');
  assert.equal(context.listeningNextChunk(blocks,context.listeningChunk(blocks,{index:3,start:0},partsOf,true),partsOf,true),null);
});

test('saved positions, speed and word boundaries', ()=>{
  assert.deepEqual({...context.listeningResolveCursor(blocks,{index:2,pi:4,start:11})},{index:2,start:11});
  // The rendered order changed: the paragraph number still finds the sentence.
  assert.deepEqual({...context.listeningResolveCursor(blocks,{index:0,pi:6,start:0})},{index:3,start:0});
  assert.equal(context.listeningResolveCursor(blocks,{index:0,pi:99,start:0}),null);
  assert.equal(context.listeningResolveCursor(blocks,null),null);

  assert.deepEqual([1,1.25,0.75].map(context.listeningNextRate),[1.25,0.75,1]);
  assert.equal(context.listeningNextRate(2),1);
  assert.deepEqual([0.75,1,1.25].map(context.listeningRateLabel),['0.75x','1.0x','1.25x']);

  const sentence='“Oh dear!” said the Rabbit.';
  assert.deepEqual({...context.listeningWordRange(sentence,1,3)},{start:1,end:3});
  assert.deepEqual({...context.listeningWordRange(sentence,0,4)},{start:1,end:3},'Quotes are not part of the word');
  assert.deepEqual({...context.listeningWordRange(sentence,11)},{start:11,end:15},'No charLength: count one word');
  assert.deepEqual({...context.listeningWordRange("it's here",0)},{start:0,end:4});
  assert.equal(context.listeningWordRange(sentence,sentence.length),null);
});

test('the reader wiring keeps the existing gesture and sentence owners', ()=>{
  const index=read('index.html');
  const reader=read('scripts/reader/reader.js');
  assert.match(index,/<div id="readpill"[\s\S]*?<button id="listenfab"[^>]*hidden[\s\S]*?<div id="listen-bar"[^>]*hidden[\s\S]*?<div id="reader-pill-copy">/,'🎧 and the bar live in the title pill');
  // Entry: a standard outline play triangle, named 듣기.
  const fab=index.match(/<button id="listenfab"[^>]*>[\s\S]*?<\/button>/)[0];
  assert.match(fab,/aria-label="듣기"/);
  assert.match(fab,/<svg viewBox="0 0 24 24"[^>]*fill="none" stroke="currentColor"[^>]*><path class="listen-play-glyph" d="M8\.5 5\.5v13l10-6\.5z"\/><\/svg>/,'Entry is not the play triangle');
  for(const id of ['listen-prev','listen-toggle','listen-next','listen-rate','listen-close'])
    assert.match(index,new RegExp(`<div id="listen-bar"[\\s\\S]*id="${id}"[\\s\\S]*<div id="reader-pill-copy">`),id);
  assert.match(index,/<div id="ps-content">\s*<button id="ps-listen"[^>]*onclick="listenFromSentence\(\)">[\s\S]*?여기서부터 듣기/,'“여기서부터 듣기” is the first item of the sentence surface');
  assert.ok(index.indexOf('scripts/reader/listening.js')>index.indexOf('scripts/reader/reader.js'));
  // The text surface asks listening first, then opens the normal word popup.
  assert.match(reader,/listeningWordTap\(span\)\) return true;\n\s*openWord\(span\.dataset\.w,span,\{x:clientX,y:clientY\}\);/);
  // Listening never listens to raw pointer input; gesture.js stays the only judge.
  const listeningSource=read('scripts/reader/listening.js');
  assert.doesNotMatch(listeningSource,/addEventListener\('(pointer\w+|click|touch\w+)'/);
  // Flow: speech is cancelled only by listeningHalt (people stopping or moving), never between chunks.
  assert.equal(listeningSource.match(/\.cancel\(\)/g).length,1);
  assert.match(listeningSource,/function listeningHalt\(\)\{[\s\S]*?synth\.cancel\(\);[\s\S]*?\n\}/);
  // Emphasis is a class on the text, not ::highlight(), which WebKit does not colour.
  assert.doesNotMatch(read('styles/listening.css').replace(/\/\*[\s\S]*?\*\//g,''),/::highlight/);
  assert.match(read('styles/listening.css'),/#rtext \.listen-cur\{color:var\(--ink-body\);\}/);
  assert.match(read('scripts/core/state.js'),/curBook=null;[^\n]*\n\s*if\(typeof syncListeningControls==='function'\) syncListeningControls\(\);/,'Leaving the reader stops listening');
});
