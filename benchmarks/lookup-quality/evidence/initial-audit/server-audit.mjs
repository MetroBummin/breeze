import {readFileSync,writeFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from '../breeze-reader-layout-stability/node_modules/typescript/lib/typescript.js';
const source=readFileSync(new URL('../breeze-reader-layout-stability/server/dict/index.ts',import.meta.url),'utf8');
const js=ts.transpileModule(source.replace(/^import .*;$/gm,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
const box={Response,AbortSignal,console,crypto,fetch:async()=>{throw Error('network forbidden')},Deno:{env:{get:()=>''},serve:()=>{}},createClient:()=>({})};
vm.createContext(box);vm.runInContext(js,box);
vm.runInContext('globalThis.recorded=[];ask=async a=>{recorded.push(a);return {text:JSON.stringify(mockAnswer),provider:"mock"}}',box);
const results=[];
async function test(id,body,answer){box.mockAnswer=answer;box.body=body;box.recorded.length=0;const r=await vm.runInContext('opLook(body,null,true)',box);results.push({id,body,answer,status:r.status,response:await r.json(),prompt:box.recorded[0]?.prompt});}
await test('invalid-expression-members-retains-phrase-meaning',{word:'apple',clicked:'apple',sentence:'He upset the apple cart.',clickedIndex:3},{kind:'expression',canonical:'upset the apple cart',members:[1],ko:'계획을 망치다'});
await test('null-members-coerce-zero',{word:'he',clicked:'He',sentence:'He gave up.',clickedIndex:0},{kind:'expression',canonical:'give up',members:[null,1,2],ko:'포기하다'});
await test('tokens-disagree-with-truncated-sentence',{word:'bank',clicked:'bank',sentence:'Background '.repeat(70)+'The bank flooded.',tokens:[{text:'The'},{text:'bank'},{text:'flooded'}],clickedIndex:1},{kind:'word',canonical:'bank',members:[1],ko:'둑'});
// Provider succeeds with malformed JSON: opLook parses only after ask has returned.
vm.runInContext('globalThis.providerCalls=[];providerKeys=()=>({oKey:"mock",gKey:"mock",cKey:"mock"});callOpenRouter=async()=>{providerCalls.push("openrouter");return {text:"not json"}};callGemini=async()=>{providerCalls.push("gemini");return {text:JSON.stringify({kind:"word",canonical:"bank",members:[0],ko:"은행"})}};',box);
// Restore the production ask implementation after earlier response fixtures.
const askStart=source.indexOf('async function ask('),askEnd=source.indexOf('\nfunction parseJson(',askStart);
vm.runInContext(ts.transpileModule(source.slice(askStart,askEnd),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,box);
box.newAiTrace=()=>({});box.body={word:'bank',clicked:'bank',sentence:'bank',clickedIndex:0};
const r=await vm.runInContext('opLook(body,null,true)',box);results.push({id:'malformed-output-no-provider-fallback',status:r.status,response:await r.json(),calls:box.providerCalls});
writeFileSync(new URL('server-results.json',import.meta.url),JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({prompt,...rest})=>rest),null,2));
