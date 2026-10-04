/* Full-text source coverage and exact modernization audit. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const normalize=text=>text.replaceAll('_','').replace(/\s+/g,' ').trim();
const importer=read('scripts/importers/importers.js');
const parse=importer.slice(importer.indexOf('function parseTXT('),importer.indexOf('/* 줄바꿈이 문단처럼'));
const context={trimGutenbergText:()=>null};
new Script(parse).runInNewContext(context);
const chapterTitles=['Mr. Sherlock Holmes','The Curse of the Baskervilles','The Problem','Sir Henry Baskerville','Three Broken Threads','Baskerville Hall','The Stapletons of Merripit House','First Report of Dr. Watson','The Light upon the Moor [Second Report of Dr. Watson]','Extract from the Diary of Dr. Watson','The Man on the Tor','Death on the Moor','Fixing the Nets','The Hound of the Baskervilles','A Retrospection'];
for(const slug of ['final-problem','hound-of-the-baskervilles']){
 const base='docs/content/'+slug+'/',m=JSON.parse(read(base+'manifest.json'));
 const original=read(base+'original.txt'),adapted=read('assets/longreads/'+slug+'.txt');
 const originalParas=original.trim().split('\n\n'),paras=adapted.trim().split('\n\n');
 test(slug+': continuous official source coverage preserves every word in order',()=>{
  const raw=read(base+'source-lines.json'),lines=JSON.parse(raw),[first,last]=m.sourceLineRange;
  assert.equal(hash(raw),m.sourceLinesSha256);
  assert.deepEqual(Object.keys(lines).map(Number),Array.from({length:last-first+1},(_,i)=>first+i));
  assert.equal(normalize(Object.values(lines).join('\n')),normalize(original));
  assert.equal(hash(original),m.originalSha256);assert.equal(hash(adapted),m.adaptedSha256);
  assert.equal(originalParas.length,m.paragraphs);assert.equal(paras.length,m.paragraphs);
  assert.equal(original.trim().split(/\s+/).length,m.originalWords);
  assert.equal(adapted.trim().split(/\s+/).length,m.adaptedWords);
  assert.equal(Buffer.byteLength(adapted),m.bytes);
  assert.equal(originalParas[0],m.first);assert.equal(originalParas.at(-1),m.last);
  assert.doesNotMatch(adapted,/PROJECT GUTENBERG|START OF THE|END OF THE/);
  assert.ok(adapted.includes('Sherlock Holmes'));
 });
 test(slug+': only logged modernization changes the source, with unchanged paragraph identity',()=>{
  const edits=JSON.parse(read(base+'edits.json')),replayed=originalParas.slice();
  assert.equal(edits.length,m.edits);
  for(const e of edits){
   assert.ok(Number.isInteger(e.paragraph)&&e.paragraph>=1&&e.paragraph<=replayed.length);
   assert.ok(e.reason&&e.before!==e.after);
   assert.equal(replayed[e.paragraph-1].split(e.before).length-1,e.count||1);
   replayed[e.paragraph-1]=replayed[e.paragraph-1].replaceAll(e.before,e.after);
  }
  assert.equal(replayed.join('\n\n')+'\n',adapted);
  assert.deepEqual(Array.from(context.parseTXT(adapted,{preserveParagraphs:true})),paras,'actual TXT parser preserves the audited blocks');
 });
 test(slug+': ten source-grounded scene anchors resolve once and after the depicted passage',()=>{
  const scenes=JSON.parse(read(base+'scene-anchors.internal.json'));
  assert.equal(scenes.length,10);assert.equal(new Set(scenes.map(x=>x.id)).size,10);
  let previous=0;
  for(const s of scenes){
   assert.ok(s.paragraph1Based>previous);previous=s.paragraph1Based;
   const p=paras[s.paragraph1Based-1];
   assert.ok(originalParas[s.paragraph1Based-1].includes(s.sourceLocator.sourceLocatorPrefix));
   assert.equal(hash(p),s.paragraphSha256);assert.ok(p.startsWith(s.adaptedPrefix));
   assert.equal(paras.filter(p=>p.startsWith(s.adaptedPrefix)).length,1);
   assert.equal(s.placement,'after');assert.equal(s.beforeNextParagraph1Based,s.paragraph1Based+1);
   assert.ok(paras[s.beforeNextParagraph1Based-1].startsWith(s.beforeNextPrefix));
   assert.equal(paras.filter(p=>p.startsWith(s.beforeNextPrefix)).length,1);
   if(s.teaserCandidate)assert.equal(s.spoiler,'none');
  }
 });
 test(slug+': original source header and full license remain separate from the adapted reader asset',()=>{
  const header=read(base+'source-header.txt'),license=read(base+'source-license.txt');
  assert.equal(hash(header),m.sourceHeaderSha256);assert.equal(hash(license),m.sourceLicenseSha256);
  assert.match(header,new RegExp('eBook #'+m.gutenbergId));assert.match(header,/Arthur Conan Doyle/);
  assert.match(license,/START: FULL LICENSE/);assert.match(license,/1\.E\.9/);
  assert.match(m.captureMethod,/not raw download bytes/);
 });
}
test('Hound: complete fifteen chapters, dedication, contents, reports, diary and concluding narrative',()=>{
 const m=JSON.parse(read('docs/content/hound-of-the-baskervilles/manifest.json'));
 const text=read('assets/longreads/hound-of-the-baskervilles.txt'),paras=text.trim().split('\n\n');
 assert.deepEqual(m.chapters.map(x=>x.number),Array.from({length:15},(_,i)=>i+1));
 assert.deepEqual(m.chapters.map(x=>x.title),chapterTitles);
 for(const c of m.chapters)assert.equal(paras[c.paragraph1Based-1],`Chapter ${c.number}. ${c.title}`);
 for(const fragment of ['My dear Robinson,','Contents','Baskerville Hall, Oct. 15th.','MY DEAR HOLMES,','betwixt the Hall','Les Huguenots','Marcini’s'])assert.ok(text.includes(fragment),fragment);
 assert.equal(paras.at(-2),m.lastNarrativeParagraph);assert.equal(paras.at(-1),'THE END');
 assert.ok(text.length>300000,'full novel has not been replaced by an excerpt');
});
test('Final Problem: complete opening and final account, without the preceding collection story',()=>{
 const m=JSON.parse(read('docs/content/final-problem/manifest.json'));
 const text=read('assets/longreads/final-problem.txt');
 assert.ok(text.startsWith('It is with a heavy heart that I take up my pen'));
 assert.ok(text.trim().endsWith('the best and the wisest man whom I have ever known.'));
 assert.ok(text.includes('Tell Inspector Patterson'));assert.ok(text.includes('pigeonhole M.'));
 assert.ok(m.complete);assert.deepEqual(m.chapters,[]);
 assert.doesNotMatch(text,/Chapter \d+\.|XII\. The Final Problem|XI\. The Naval Treaty/);
});
