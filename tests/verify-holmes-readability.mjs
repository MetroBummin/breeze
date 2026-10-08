import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const context={};vm.runInNewContext(read('scripts/core/book-identity.js')+read('scripts/library/holmes-layout.js')+';this.parts=holmesParagraphParts;this.layout=HOLMES_PARAGRAPH_LAYOUT;',context);
const audit=JSON.parse(read('docs/content/holmes-readability/boundaries.json'));
const sources=JSON.parse(read('docs/content/holmes-readability/source-paragraphs.json'));
const editorial=JSON.parse(read('docs/content/holmes-readability/editorial-breaks.json'));
for(const [slug,entries] of Object.entries(audit))test(slug+': every display boundary has source or reviewed editorial evidence, without changing any stored character',()=>{
 assert.deepEqual(Object.keys(context.layout['sherlock-holmes-'+slug]).map(Number),entries.map(e=>e.pi));
 const paras=read('assets/longreads/'+slug+'.txt').trim().split('\n\n');
 for(const entry of entries){
  const text=paras[entry.pi];
  const source=sources[slug].find(e=>e.pi===entry.pi);
  if(source)assert.equal(source.parts.join(' '),text,'full source-confirmed block survives existing modernization');
  const edit=editorial[slug].find(e=>e.pi===entry.pi);
  if(edit){assert.ok(edit.reason);assert.equal(edit.reason,entry.reason);for(const before of edit.before)assert.ok(entry.editorialCuts.includes(text.indexOf(before)));}
  assert.equal(entry.cuts.length,new Set([...entry.sourceCuts,...entry.editorialCuts]).size);
  const parts=context.parts({longReadId:'sherlock-holmes-'+slug},{f:entry.pi,t:text});
  assert.ok(parts.length>1);assert.equal(Array.from(parts).join(' '),text);
  assert.equal(context.parts({longReadId:'sherlock-holmes-'+slug},{f:entry.pi,t:text.replace(/[a-z]/,'Z')}),null,'custom changed text must not receive canonical divisions');
 }
 assert.equal(context.parts({longReadId:'custom-book'},{f:entries[0].pi,t:paras[entries[0].pi]}),null);
});
test('Hound: the opening Watson question and Holmes reply are separated at the source-confirmed speaker boundary',()=>{
 const text=read('assets/longreads/hound-of-the-baskervilles.txt').trim().split('\n\n')[14];
 const parts=Array.from(context.parts({longReadId:'sherlock-holmes-hound-of-the-baskervilles'},{f:14,t:text}));
 assert.equal(parts.length,2);assert.ok(parts[1].startsWith('“I have, at least,'));
});
