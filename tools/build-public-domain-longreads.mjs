/* Regenerates the public-domain Breeze Originals from Project Gutenberg EPUBs.
   The app does not ship those EPUBs. To regenerate, place eBook #11 and
   eBook #64317 at the paths below, then run this from the repository root.
   Wording is preserved. This only restores paragraphs, chapter titles, quotes,
   dashes, italics, and verse lines for the text reader. */
import {createHash} from 'node:crypto';
import {existsSync, readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const context={};
vm.runInNewContext(readFileSync(resolve(root,'scripts/core/book-identity.js'),'utf8')+';this.fingerprint=bookContentFingerprint;', context);

function unzip(epub, dir){
  execFileSync('unzip', ['-o','-q', epub, '-d', dir]);
  return dir;
}
function spine(dir){
  const opf=readFileSync(resolve(dir,'OEBPS/content.opf'),'utf8');
  const {document}=parseHTML(opf);
  const manifest=new Map([...document.querySelectorAll('item')].map(item=>[item.getAttribute('id'), item.getAttribute('href')]));
  return [...document.querySelectorAll('itemref')].map(item=>resolve(dir,'OEBPS', manifest.get(item.getAttribute('idref'))));
}
function chapterTitle(text){
  const alice=text.match(/^CHAPTER\s+([IVXLC]+)\.\s+(.+)$/i);
  if(alice) return `Chapter ${alice[1].toUpperCase()}. ${alice[2]}`;
  if(/^[IVXLC]+$/.test(text)) return `Chapter ${text}`;
  return '';
}
function collapse(raw, marks){
  let out='';
  const map=new Array(raw.length+1);
  for(let i=0;i<raw.length;i++){
    if(/\s/.test(raw[i])){
      if(out && !out.endsWith(' ')) out+=' ';
    }else out+=raw[i];
    map[i]=out.length;
  }
  map[raw.length]=out.length;
  if(out.endsWith(' ')) out=out.slice(0,-1);
  const point=(old,end)=>{
    if(old<=0) return 0;
    if(old>=raw.length) return out.length;
    if(!end){
      let i=old;
      while(i<raw.length && /\s/.test(raw[i])) i++;
      return i>=raw.length ? out.length : map[i]-1;
    }
    let j=old-1;
    while(j>=0 && /\s/.test(raw[j])) j--;
    return j<0 ? 0 : Math.min(out.length, map[j]);
  };
  const next=[];
  for(const mark of marks){
    const start=point(mark.start,false), end=point(mark.end,true);
    if(end<=start) continue;
    const prev=next.at(-1);
    if(prev && prev.kind===mark.kind && prev.end>=start) prev.end=Math.max(prev.end,end);
    else next.push({kind:mark.kind, start, end});
  }
  return {text:out.trim(), marks:next.filter(mark=>mark.end>mark.start)};
}
function marked(el){
  let raw='';
  const marks=[];
  const walk=(node, kind)=>{
    if(node.nodeType===3){ raw+=node.nodeValue.replace(/\u00a0/g,' '); return; }
    if(node.nodeType!==1) return;
    const tag=node.localName;
    if(tag==='br'){ raw+='\n'; return; }
    if(tag==='script'||tag==='style') return;
    const next=(tag==='i'||tag==='em')?'em':(tag==='b'||tag==='strong')?'strong':kind;
    const start=raw.length;
    for(const child of node.childNodes) walk(child, next);
    if(next && next!==kind && raw.length>start) marks.push({kind:next, start, end:raw.length});
  };
  walk(el, null);
  return {raw, marks};
}
function prose(el){
  const {raw, marks}=marked(el);
  return collapse(raw.replace(/\n/g,' '), marks);
}
function verseLines(el){
  const lines=[];
  let raw='', marks=[], indent=false;
  const flush=()=>{
    const line=collapse(raw, marks);
    const body=raw.replace(/^\n+/, '');
    lines.push({...line, indent:indent||/^[ \u00a0]{2,}/.test(body), empty:!line.text});
    raw=''; marks=[]; indent=false;
  };
  const walk=(node)=>{
    if(node.nodeType===3){ raw+=node.nodeValue.replace(/\u00a0/g,' '); return; }
    if(node.nodeType!==1) return;
    const tag=node.localName;
    if(tag==='br'){ flush(); return; }
    if(tag==='cite') return;
    if(/\bi1\b/.test(node.getAttribute('class')||'') && !raw.trim()) indent=true;
    const kind=(tag==='i'||tag==='em')?'em':(tag==='b'||tag==='strong')?'strong':null;
    const start=raw.length;
    for(const child of node.childNodes) walk(child);
    if(kind && raw.length>start) marks.push({kind, start, end:raw.length});
  };
  for(const child of el.childNodes){
    if(child.nodeType===1 && child.localName==='p'){
      if(raw) flush();
      walk(child);
      flush();
    }else walk(child);
  }
  if(raw) flush();
  const kept=[];
  let stanza=false;
  for(const line of lines){
    if(line.empty){ stanza=kept.length>0; continue; }
    if(/^\s/.test(line.raw||'')){}
    kept.push({text:line.text, marks:line.marks, indent:line.indent, stanza});
    stanza=false;
  }
  /* Gutenberg sometimes breaks one word across a verse <br/>, as in
     "two p" / "ennyworth". A real verse line does not end on a lone letter. */
  const joined=[];
  for(const line of kept){
    const prev=joined.at(-1);
    if(prev && /\s[A-Za-z]$/.test(prev.text) && /^[a-z]/.test(line.text)){
      const shift=prev.text.length;
      prev.text+=line.text;
      prev.marks.push(...line.marks.map(mark=>({kind:mark.kind, start:mark.start+shift, end:mark.end+shift})));
      continue;
    }
    joined.push({text:line.text, marks:[...line.marks], indent:line.indent, stanza:line.stanza});
  }
  return {lines:joined, cite:el.querySelector('cite')?.textContent.replace(/\s+/g,' ').trim()||''};
}
function hidden(node){
  return !!node.closest('#pg-header,#pg-footer,.pg-boilerplate,.toc');
}
function extract(dir){
  const blocks=[];
  let seenChapter=false;
  const push=(block)=>{
    if(!block.text) return;
    if(block.role==='scene' && !seenChapter) return;
    if(block.role==='chapter') seenChapter=true;
    blocks.push(block);
  };
  for(const file of spine(dir)){
    const {document}=parseHTML(readFileSync(file,'utf8'));
    const nodes=[...document.querySelectorAll('h2,h5,p,hr,blockquote.verse,div.dedication')];
    for(const node of nodes){
      if(hidden(node)) continue;
      if(node.localName==='p' && node.closest('blockquote.verse,div.dedication')) continue;
      if(node.localName==='h5'){
        const text=node.textContent.replace(/\s+/g,' ').trim();
        if(text==='THE END') push({role:'end', text});
        continue;
      }
      if(node.localName==='h2'){
        const title=chapterTitle(node.textContent.replace(/\s+/g,' ').trim());
        if(title) push({role:'chapter', text:title});
        continue;
      }
      if(node.localName==='hr'){ push({role:'scene', text:'* * *'}); continue; }
      if(node.localName==='div'){
        /* One paragraph per print line. The reader joins inscription lines
           before the first chapter into a single dedication. */
        const {raw}=marked(node);
        for(const line of raw.split('\n')){
          const text=line.replace(/\s+/g,' ').trim();
          if(text) push({role:'inscription', text});
        }
        continue;
      }
      if(node.localName==='blockquote'){
        const verse=verseLines(node);
        let stanza=true;
        for(const line of verse.lines){
          push({role:'verse', text:line.text, indent:line.indent, stanza:stanza||line.stanza, marks:line.marks});
          stanza=false;
        }
        if(verse.cite) push({role:'signature', text:verse.cite});
        continue;
      }
      const klass=node.getAttribute('class')||'';
      if(/\basterism\b/.test(klass)){ push({role:'scene', text:'* * *'}); continue; }
      if(/\bpoem\b/.test(klass)){
        const verse=verseLines(node);
        let stanza=true;
        for(const line of verse.lines){
          push({role:'verse', text:line.text, indent:line.indent, stanza:stanza||line.stanza, marks:line.marks});
          stanza=false;
        }
        continue;
      }
      if(/\bcenter\b/.test(klass)){
        const {raw}=marked(node);
        for(const line of raw.split('\n')){
          const text=line.replace(/\s+/g,' ').trim();
          if(text) push({role:'label', text});
        }
        continue;
      }
      const paragraph=prose(node);
      push({role:'p', text:paragraph.text, marks:paragraph.marks});
    }
  }
  return blocks;
}
function emit(id, blocks){
  const text=blocks.map(block=>block.text).join('\n\n')+'\n';
  const layout={};
  blocks.forEach((block, index)=>{
    const marks=block.marks||[];
    const entry={};
    if(block.role!=='p'){
      entry.role=block.role;
      entry.text=block.text;
      if(block.indent) entry.indent=true;
      if(block.stanza) entry.stanza=true;
    }
    if(marks.length){
      entry.length=block.text.length;
      entry.fingerprint=context.fingerprint([block.text]);
      entry.ranges=marks.map(mark=>[mark.start, mark.end, mark.kind]);
    }
    if(entry.role||entry.ranges) layout[index]=entry;
  });
  return {text, layout, words:text.trim().split(/\s+/).length, sha256:createHash('sha256').update(text).digest('hex')};
}

const jobs=[
  ['alice-in-wonderland','assets/classics/alice-in-wonderland.epub'],
  ['the-great-gatsby','assets/classics/the-great-gatsby.epub'],
];
const layouts={};
for(const [id, epub] of jobs){
  const source=resolve(root, epub);
  if(!existsSync(source)){
    console.error(`Missing ${epub}. Place the Project Gutenberg EPUB there to regenerate ${id}.`);
    process.exit(1);
  }
  const dir=`/tmp/breeze-${id}`;
  unzip(source, dir);
  const built=emit(id, extract(dir));
  writeFileSync(resolve(root,`assets/longreads/${id}.txt`), built.text);
  layouts[id]=built.layout;
  const roles={};
  for(const entry of Object.values(built.layout)) roles[entry.role||'marks']=(roles[entry.role||'marks']||0)+1;
  console.log(id, 'paragraphs', built.text.trim().split(/\n\n/).length, 'words', built.words, 'sha256', built.sha256, roles);
}
const source=`/* Presentation for the public-domain Breeze Originals.
   Saved paragraphs stay unmarked. Roles and italic ranges apply only when the
   paragraph still matches the shipped text, so an edited copy keeps reading. */
const PUBLIC_DOMAIN_LAYOUT=${JSON.stringify(layouts)};
function publicDomainEntry(book, block){
  const entry=PUBLIC_DOMAIN_LAYOUT[book.longReadId]?.[block.f];
  if(!entry) return null;
  if(entry.text!=null && entry.text!==block.t) return null;
  if(entry.fingerprint && (block.t.length!==entry.length || bookContentFingerprint([block.t])!==entry.fingerprint)) return null;
  return entry;
}
function publicDomainRole(book, block){
  const entry=publicDomainEntry(book, block);
  if(!entry?.role) return null;
  return {role:entry.role, indent:!!entry.indent, stanza:!!entry.stanza};
}
function publicDomainMarks(book, block){
  const entry=PUBLIC_DOMAIN_LAYOUT[book.longReadId]?.[block.f];
  if(!entry?.ranges || block.t.length!==entry.length || bookContentFingerprint([block.t])!==entry.fingerprint) return null;
  return entry.ranges.map(([start,end,kind])=>({kind, start, end}));
}
`;
mkdirSync(resolve(root,'scripts/library'),{recursive:true});
writeFileSync(resolve(root,'scripts/library/public-domain-layout.js'), source);
console.log('layout bytes', Buffer.byteLength(source));
