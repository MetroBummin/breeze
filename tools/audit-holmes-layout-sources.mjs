import {parseHTML} from 'linkedom';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
const root=fileURLToPath(new URL('../',import.meta.url));
const sourceDir=process.argv[2];
if(!sourceDir)throw Error('Provide a directory containing 1661.html, 834.html and 2852.html fetched from the official URLs in sources.json');
const norm=s=>s.replace(/[_\s]/g,'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/—/g,'--').replace(/£/g,'pounds');
const out={};
for(const slug of ['speckled-band','scandal-in-bohemia','red-headed-league','final-problem','hound-of-the-baskervilles']){
 const id=slug==='final-problem'?834:slug==='hound-of-the-baskervilles'?2852:1661;
 const {document}=parseHTML(fs.readFileSync(`${sourceDir}/${id}.html`,'utf8'));
 const ps=[...document.querySelectorAll('p,h1,h2,h3')].flatMap(p=>p.tagName==='P'?p.innerHTML.split(/<br\s*\/?>(?:\s|&nbsp;)*/i).map(html=>norm(parseHTML('<div>'+html+'</div>').document.querySelector('div').textContent)):[norm(p.textContent)]);
 let at=0;const breaks=new Set();const all=ps.map(p=>{breaks.add(at);at+=p.length;return p;}).join('');
 const orig=fs.readFileSync(`${root}/docs/content/${slug}/original.txt`,'utf8').trim().split('\n\n');
 const adapted=fs.readFileSync(`${root}/assets/longreads/${slug}.txt`,'utf8').trim().split('\n\n');
 const edits=JSON.parse(fs.readFileSync(`${root}/docs/content/${slug}/edits.json`));
 const entries=[];let misses=0;
 for(let pi=0;pi<orig.length;pi++){
  const text=orig[pi],n=norm(text),pos=all.indexOf(n);
  if(pos<0){misses++;console.log('unmatched',slug,pi,text.slice(0,120));continue;}
  const cuts=[...breaks].filter(b=>b>pos&&b<pos+n.length).map(b=>b-pos);
  if(!cuts.length)continue;
  const words=text.split(' ');let cursor=0,parts=[''];
  for(const w of words){if(cuts.includes(cursor)&&parts.at(-1))parts.push('');parts[parts.length-1]+=(parts.at(-1)?' ':'')+w;cursor+=norm(w).length;}
  if(parts.length!==cuts.length+1){console.log('unaligned',slug,pi);continue;}
  for(const edit of edits.filter(e=>e.paragraph===pi+1))for(let p=0;p<parts.length;p++)parts[p]=parts[p].replaceAll(edit.before,edit.after);
  if(parts.join(' ')!==adapted[pi])throw Error('adaptation mismatch '+slug+' '+pi);
  entries.push({pi,parts,source:'html-p'});
 }
 console.log(slug,'blocks',orig.length,'unmatched',misses,'joined',entries.length,'breaks',entries.reduce((n,e)=>n+e.parts.length-1,0));
 out[slug]=entries;
}
assert.deepEqual(out,JSON.parse(fs.readFileSync(`${root}/docs/content/holmes-readability/source-paragraphs.json`,'utf8')));
console.log('All committed source divisions match the supplied official HTML.');
