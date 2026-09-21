import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const lookup=readFileSync(new URL('server/dict/lookup.ts',root),'utf8');
const server=readFileSync(new URL('server/dict/index.ts',root),'utf8');
const box={Response,AbortSignal,console,crypto,Deno:{env:{get:()=>''},serve(){}},createClient:()=>({}),newAiTrace:()=>({})};
vm.createContext(box);
const run=code=>vm.runInContext(ts.transpileModule(code.replace(/^import .*;$/gm,'').replace(/^export /gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText,box);
run(lookup);run(server);
const input=box.lookupInput({word:'apple',clicked:'apple',sentence:'He upset the apple cart.',clickedIndex:3});
const valid={kind:'expression',canonical:'upset the apple cart',members:[1,2,3,4],ko:'계획을 망치다'};
assert.equal(box.validateLook(valid,input).kind,'expression');
assert.equal(box.validateLook({...valid,ko:'망치다, 방해하다'},input).ko,'망치다');
for(const patch of [{members:[1]},{members:[null,1,2,3]},{members:[1,3,4]},{members:[3,2,1]},{members:[1,2,3,3]},{kind:'word'},{ko:''},{canonical:'upset (the) apple cart'}]){
 assert.throws(()=>box.validateLook({...valid,...patch},input),JSON.stringify(patch));
}
assert.throws(()=>box.lookupInput({word:'bank',sentence:'A bank faces another bank.'}),/ambiguous_target/);
assert.throws(()=>box.lookupInput({word:'bank',clicked:'bank',sentence:'A bank.',tokens:['A','apple'],clickedIndex:1}),/bad_tokens/);
assert.throws(()=>box.lookupInput({word:'bank',clicked:'bank',sentence:'A bank.',clickedIndex:0}),/bad_target/);
assert.throws(()=>box.lookupInput({word:'bank',sentence:'x'.repeat(2401)}),/bad_context/);
const phraseInput=box.lookupInput({word:'give up',clicked:'give up',sentence:'They give up.',clickedIndex:1});
assert.equal(phraseInput.clickedIndex,1);
const bank=box.lookupInput({word:'bank',clicked:'bank',sentence:'The bank flooded.',clickedIndex:1});
assert.throws(()=>box.validateLook({kind:'word',canonical:'flood',members:[1],ko:'홍수'},bank),/invalid_lemma/);
const repeated=box.lookupInput({word:'take',clicked:'take',sentence:'I take notes before the planes take off.',clickedIndex:1});
for(const members of [[1,6,7],[1,7]])assert.throws(()=>box.validateLook({kind:'expression',canonical:'take off',members,ko:'이륙하다'},repeated));
const possessive=box.lookupInput({word:'leg',clicked:'leg',sentence:'I am pulling your leg.',clickedIndex:4});
assert.throws(()=>box.validateLook({kind:'expression',canonical:"pull someone's leg",members:[2,3,4],ko:'놀리다'},possessive));
assert.doesNotMatch(server,/ANTHROPIC_API_KEY|api\.anthropic\.com|callClaude/);
// A malformed primary result falls back, and still consumes just one logical lookup.
run(`providerKeys=()=>({oKey:'fixture',gKey:'fixture'});
globalThis.calls=[];
callOpenRouter=async()=>{calls.push('primary');return {text:'not json'}};
callGemini=async()=>{calls.push('fallback');return {text:JSON.stringify({kind:'word',canonical:'bank',members:[1],ko:'둑'})}};`);
let response=await box.opLook({word:'bank',clicked:'bank',sentence:'The bank flooded.',clickedIndex:1},null,true);
assert.equal(response.status,200);assert.equal((await response.json()).ko,'둑');
assert.deepEqual(Array.from(box.calls),['primary','primary','fallback']);
// Invalid lexical members must never be silently relabeled as a word meaning.
run(`calls=[];callOpenRouter=async()=>{calls.push('primary');return {text:JSON.stringify({kind:'expression',canonical:'upset the apple cart',members:[1],ko:'계획을 망치다'})}};callGemini=callOpenRouter;`);
response=await box.opLook({word:'apple',clicked:'apple',sentence:'He upset the apple cart.',clickedIndex:3},null,true);
assert.equal(response.status,502);assert.equal((await response.json()).error,'lookup_failed');
assert.equal(box.calls.length,3);
const abort=new AbortController();abort.abort();box.calls=[];
await assert.rejects(()=>box.opLook({word:'apple',clicked:'apple',sentence:'An apple.',clickedIndex:1},null,true,abort.signal));
assert.equal(box.calls.length,0);
console.log('Lookup contract, target alignment, malformed-output fallback, cancellation and fail-closed checks passed');
