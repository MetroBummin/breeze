import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function fn(source,name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\n}',start);assert.ok(start>=0&&end>start);return source.slice(start,end+2);}
function render(card,others={},current=card){
 const {document}=parseHTML('<p id="example"></p>'),context=vm.createContext({document,words:{...others,saved:current},card:{...card,key:'saved'}}),dictionary=read('scripts/dictionary/dictionary.js');
 vm.runInContext(read('modules/lexical/core.js')+'\nconst lemmaCands=BreezeLexical.lemmaCands;\n'+dictionary.match(/^const LOOKUP_TOKEN_RE=.*;$/m)[0]+'\n'+fn(dictionary,'lookupSentenceTokens')+'\n'+fn(dictionary,'sentenceHash')+'\n'+fn(read('scripts/reader/reader.js'),'savedPhraseMatch')+'\n'+read('scripts/ui/study-example.js'),context);
 const before=JSON.stringify(context.words);vm.runInContext('renderStoredStudyExample(document.getElementById("example"),card)',context);assert.equal(JSON.stringify(context.words),before);const target=document.getElementById('example');assert.equal(target.textContent,card.example||'');assert.equal(target.querySelectorAll('img,script,mark').length,0);return {strong:[...target.querySelectorAll('strong')].map(n=>n.textContent),context};
}
test('saved occurrence selects only the clicked repeated word, never substrings',()=>{assert.deepEqual(render({word:'wind',example:'Wind the winding clock; wind it again.',clickedIndex:4}).strong,['wind']);assert.deepEqual(render({word:'wind',example:'Wind the winding clock; wind it again.'}).strong,[]);});
test('inflected and discontinuous phrase members use existing lexical recognition',()=>{assert.deepEqual(render({word:'take',example:'He took a breath.'}).strong,['took']);assert.deepEqual(render({word:'take into account',example:'He took the criticism into account, then opened an account.',phraseParts:['take','into','account'],phraseGaps:[2,0]}).strong,['took','into','account']);assert.deepEqual(render({word:'come to the point',example:'Come to the door and point to it.',phraseParts:['come','to','the','point'],phraseGaps:[0,0,0]}).strong,[]);});
test('context hashes recover a snapshot occurrence after the current example changes',()=>{const old='Quiet quiet.',{context}=render({word:'quiet',example:old});const hash=vm.runInContext(`sentenceHash(${JSON.stringify(old)})`,context);const card={word:'quiet',example:'A quiet room.',contextHashes:['v2:'+hash+':1']};const result=render({...card,example:old},{},card);assert.deepEqual(result.strong,['quiet']);});
test('manual multiword text uses a conservative unique phrase match',()=>{assert.deepEqual(render({word:'put off',example:'They put off the meeting.'}).strong,['put','off']);});
test('missing source, Unicode punctuation and markup are exact safe text',()=>{assert.deepEqual(render({word:'quiet'}).strong,[]);assert.deepEqual(render({word:'breeze',example:'“A breeze”—산들바람 & <img src=x onerror="alert(1)">.'}).strong,['breeze']);});
