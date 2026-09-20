import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const dictionary=readFileSync(resolve(root,'scripts/dictionary/dictionary.js'),'utf8');
const server=readFileSync(resolve(root,'server/dict/index.ts'),'utf8');

function functionSource(source,name){
  const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,`${name} is missing`);
  const brace=source.indexOf('{',start);let depth=0,quote='',escape=false;
  for(let index=brace;index<source.length;index++){
    const char=source[index];
    if(quote){if(escape)escape=false;else if(char==='\\')escape=true;else if(char===quote)quote='';continue;}
    if(char==='"'||char==="'"||char==='`'){quote=char;continue;}
    if(char==='{')depth++;else if(char==='}'&&--depth===0)return source.slice(start,index+1);
  }
  throw new Error(`Could not extract ${name}`);
}

const context={console,Set,RegExp,String,Number,Array,Math};context.globalThis=context;
new Script(readFileSync(resolve(root,'modules/lexical/core.js'),'utf8')).runInNewContext(context);
new Script(`const lemmaCands=globalThis.BreezeLexical.lemmaCands;
const JEV_TOKEN_RE=/[A-Za-z](?:[A-Za-z'’\\-]*[A-Za-z])?/g;
${functionSource(dictionary,'jevSentenceTokens')}
${functionSource(dictionary,'jevClickedTokenIndex')}
${functionSource(dictionary,'jevPhraseIdentity')}
globalThis.api={jevSentenceTokens,jevClickedTokenIndex,jevPhraseIdentity};`).runInNewContext(context);
const {jevSentenceTokens,jevClickedTokenIndex,jevPhraseIdentity}=context.api;

const fixtures=[
  ['He took care of her.','took',1,[1,2,3],['take','care','of'],[0,0]],
  ['We look forward to spring.','look',1,[1,2,3],['look','forward','to'],[0,0]],
  ['Please give it up.','give',1,[1,3],['give','up'],[1]],
  ['She is interested in art.','interested',2,[2,3],['interest','in'],[0]],
  ['They took the issue into account.','took',1,[1,4,5],['take','into','account'],[2,0]],
  ['She gave the idea up.','gave',1,[1,4],['give','up'],[2]],
  ['We put this plan into practice.','put',1,[1,4,5],['put','into','practice'],[2,0]],
  ['He takes every warning into account.','takes',1,[1,4,5],['take','into','account'],[2,0]],
  ['The warning was taken fully into account.','taken',3,[3,5,6],['take','into','account'],[1,0]],
  ['Giving the plan up was difficult.','Giving',0,[0,3],['give','up'],[2]],
];

for(let round=0;round<200;round++)for(const [sentence,clicked,hint,indexes,parts,gaps] of fixtures){
  const tokens=jevSentenceTokens(sentence);
  const span={textContent:clicked,dataset:{clickedTokenIndex:String(hint)}};
  assert.equal(jevClickedTokenIndex(span,sentence,tokens),hint,`clicked index drifted in round ${round}: ${sentence}`);
  const identity=jevPhraseIdentity(tokens,indexes);
  assert.deepEqual(Array.from(identity.parts),parts,`canonical parts drifted in round ${round}: ${sentence}`);
  assert.deepEqual(Array.from(identity.gaps),gaps,`gap mapping drifted in round ${round}: ${sentence}`);
}

for(const sentence of ['She took a book.','I care about accuracy.','The two words happen to be near each other.']){
  const tokens=jevSentenceTokens(sentence),clicked=1;
  assert.equal(jevPhraseIdentity(tokens,[clicked]).parts.length,1,'word-only fixture was promoted without two members');
}

const longSentence=`Before ${Array.from({length:90},(_,index)=>`word${index}`).join(' ')} took the unusually detailed proposal into account.`;
const longTokens=jevSentenceTokens(longSentence),took=longTokens.findIndex(token=>token.text==='took');
assert.ok(took>80,'long fixture did not exercise a late clicked index');
assert.equal(jevClickedTokenIndex({textContent:'took',dataset:{clickedTokenIndex:String(took)}},longSentence,longTokens),took,
  'long-sentence clicked index drifted');

assert.match(server,/const JEV_PHRASE_CONFIDENCE=0\.86;/,'phrase confidence threshold is not a single testable constant');
assert.match(server,/tokens\.forEach\([^]*questions\[`token_\$\{index\}`\]/,'server no longer asks one structured question per token');
assert.match(server,/members\.every\(item=>item\.confidence>=JEV_PHRASE_CONFIDENCE\)/,
  'one low-confidence required token no longer rejects the phrase');
assert.match(server,/members\.length>=2/,'one token can be promoted into a phrase');

console.log(`JEV phrase stress passed: ${fixtures.length*200} mappings + word-only + long-sentence boundaries`);
