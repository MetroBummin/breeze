/* Run from the repository root after reviewing the source/editorial records. */
import fs from 'node:fs';import vm from 'node:vm';
const source=JSON.parse(fs.readFileSync('docs/content/holmes-readability/source-paragraphs.json'));
const editorial=JSON.parse(fs.readFileSync('docs/content/holmes-readability/editorial-breaks.json'));
const context={};vm.runInNewContext(fs.readFileSync('scripts/core/book-identity.js','utf8')+';this.fingerprint=bookContentFingerprint;',context);
const layouts={},audit={};
for(const slug of Object.keys(source)){
 const paras=fs.readFileSync('assets/longreads/'+slug+'.txt','utf8').trim().split('\n\n');
 const entries=new Map(source[slug].map(e=>{let off=0;const cuts=e.parts.slice(1).map((part,i)=>{off+=e.parts[i].length+1;return off;});return[e.pi,{pi:e.pi,sourceCuts:cuts,editorialCuts:[],reason:''}];}));
 for(const e of editorial[slug]){
  const entry=entries.get(e.pi)||{pi:e.pi,sourceCuts:[],editorialCuts:[]};
  for(const before of e.before){const at=paras[e.pi].indexOf(before);if(at<1||paras[e.pi].indexOf(before,at+1)>=0||paras[e.pi][at-1]!==' ')throw Error('invalid editorial locator '+slug+' '+e.pi+' '+before);entry.editorialCuts.push(at);}
  entry.reason=e.reason;entries.set(e.pi,entry);
 }
 layouts['sherlock-holmes-'+slug]={};audit[slug]=[];
 for(const e of [...entries.values()].sort((a,b)=>a.pi-b.pi)){
  const text=paras[e.pi],cuts=[...new Set([...e.sourceCuts,...e.editorialCuts])].sort((a,b)=>a-b);
  layouts['sherlock-holmes-'+slug][e.pi]={length:text.length,fingerprint:context.fingerprint([text]),cuts};
  audit[slug].push({...e,cuts,prefix:text.slice(0,80)});
 }
 console.log(slug,'split blocks',entries.size,'source breaks',source[slug].reduce((n,e)=>n+e.parts.length-1,0),'editorial breaks',editorial[slug].reduce((n,e)=>n+e.before.length,0));
}
fs.writeFileSync('docs/content/holmes-readability/boundaries.json',JSON.stringify(audit,null,2)+'\n');
fs.writeFileSync('scripts/library/holmes-layout.js',`/* Verified Gutenberg p/br boundaries plus individually documented readability breaks.
   Presentation only: book.paras, paragraph IDs, lookup offsets and fingerprints stay intact.
   Provenance and editorial reasons: docs/content/holmes-readability/README.md. */
const HOLMES_PARAGRAPH_LAYOUT=${JSON.stringify(layouts,null,2)};
function holmesParagraphParts(book,block){
  const layout=HOLMES_PARAGRAPH_LAYOUT[book.longReadId]?.[block.f];
  const text=block.t;
  if(!layout||block.v||text.length!==layout.length||bookContentFingerprint([text])!==layout.fingerprint)return null;
  if(layout.cuts.some(at=>text[at-1]!==' '))return null;
  const starts=[0,...layout.cuts],ends=[...layout.cuts.map(at=>at-1),text.length];
  return starts.map((at,index)=>text.slice(at,ends[index]));
}
`);
