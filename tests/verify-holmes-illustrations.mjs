import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const manifest=JSON.parse(read('docs/content/holmes-artwork/asset-manifest.json'));
const context={console,Set,books:[]};
new Script(read('scripts/library/longreads.js').toString()).runInNewContext(context);
const catalog=context.pendingLongReads();
const slugs=['speckled-band','scandal-in-bohemia','red-headed-league','final-problem','hound-of-the-baskervilles'];
test('approved complete-frame artwork has 5 covers and 50 unique scene derivatives',()=>{
 assert.equal(manifest.assets.length,55);
 assert.equal(new Set(manifest.assets.map(x=>x.file)).size,55);
 assert.equal(manifest.assets.filter(x=>x.kind==='cover').length,5);
 assert.equal(manifest.assets.filter(x=>x.kind==='scene').length,50);
 for(const a of manifest.assets){
  const bytes=read(a.file);
  assert.equal(bytes.length,a.bytes);assert.equal(hash(bytes),a.sha256);
  assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  assert.equal(bytes.subarray(8,12).toString(),'WEBP');
  assert.match(a.sourceSha256,/^[a-f0-9]{64}$/);
  assert.equal(a.derivative.cropped,false);
  assert.equal(a.dimensions[0]/a.dimensions[1],a.sourceDimensions[0]/a.sourceDimensions[1]);
 }
 assert.ok(manifest.assets.reduce((n,a)=>n+a.bytes,0)<7_000_000);
});
for(const slug of slugs){
 test(`${slug}: independent full text and ten ordered, after-passage decorations`,()=>{
  const id='sherlock-holmes-'+slug,story=catalog.find(x=>x.id===id);
  const raw=read(story.file),paras=raw.toString().trim().split('\n\n');
  assert.equal(story.sha256,hash(raw));
  assert.equal(story.wordCount,raw.toString().trim().split(/\s+/).length);
  assert.equal(story.cover,`assets/longreads/covers/${slug}.webp`);
  assert.match(story.editionNote,/not Doyle’s verbatim text/);
  const audit=JSON.parse(read(`docs/content/${slug}/illustration-anchors.json`));
  assert.equal(audit.length,10);
  const book={id:'saved',longReadId:id,paras};
  const snapshot=JSON.stringify(book),scenes=[];
  for(let i=0;i<paras.length;i++){
   const scene=context.longReadIllustrationBefore(book,paras[i],i);
   if(scene)scenes.push(scene);
  }
  assert.deepEqual(scenes.map(s=>s.id),audit.map(s=>s.id));
  for(const a of audit){
   const v=a.verifiedPlacement,pi=v.afterParagraph1Based;
   assert.equal(hash(paras[pi-1]),v.paragraphSha256);
   assert.equal(v.beforeParagraph1Based,pi+1);
   const scene=context.longReadIllustrationBefore(book,paras[pi],pi);
   assert.equal(scene.id,a.id);assert.ok(paras[pi].startsWith(scene.before));
   assert.equal(context.longReadIllustrationBefore(book,paras[pi],pi+1),null);
   const altered={...book,paras:paras.slice()};altered.paras[pi-1]='User edited this passage.';
   assert.equal(context.longReadIllustrationBefore(altered,paras[pi],pi),null);
   assert.equal(context.longReadIllustrationBefore({...book,longReadId:'unrelated'},paras[pi],pi),null);
  }
  assert.equal(JSON.stringify(book),snapshot,'decorating never mutates the saved book');
 });
}

test('Hound frontmatter and all chapter headings derive from exact source blocks only',()=>{
 const paras=read('assets/longreads/hound-of-the-baskervilles.txt').toString().trim().split('\n\n');
 const book={longReadId:'sherlock-holmes-hound-of-the-baskervilles',paras};
 const m=JSON.parse(read('docs/content/hound-of-the-baskervilles/manifest.json'));
 assert.equal(context.longReadBlockRole(book,{f:0,t:paras[0]}),'title');
 assert.equal(context.longReadBlockRole(book,{f:1,t:paras[1]}),'subtitle');
 assert.equal(context.longReadBlockRole(book,{f:9,t:paras[9]}),'contents');
 for(const c of m.chapters){
  assert.equal(context.longReadBlockRole(book,{f:c.paragraph1Based-1,t:paras[c.paragraph1Based-1]}),'chapter');
  assert.equal(context.longReadBlockRole(book,{f:c.paragraph1Based-1,t:'User edited this chapter'}),'');
 }
 assert.equal(context.longReadBlockRole({...book,longReadId:'unrelated'},{f:0,t:paras[0]}),'');
});
