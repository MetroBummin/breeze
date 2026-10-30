/* Builds the bundled 웹소설 chapters from the public Royal Road chapter pages.

   All three authors gave permission for Breeze to carry these chapters free to
   readers, with no ads and no monetization. Scope is fixed below and must not
   grow: R. K. Goff's Mr. Penn is Chapter 1–10 only (the Introduction stays on
   Royal Road), Cinnamon Bun and Chasing Sunlight are their first ten chapters.

     xvfb-run -a node tools/build-webnovels.mjs --fetch   # save the pages
     node tools/build-webnovels.mjs                       # rebuild the text

   Royal Road sits behind a browser check, so --fetch drives the system Chrome
   (headed, under xvfb) with Playwright and saves the HTML to
   $WEBNOVEL_CACHE (default /tmp/breeze-webnovels). Nothing is fetched at app
   runtime; the app reads only the files written here.

   Kept from each chapter body (.chapter-content): the author's words,
   paragraphs, italics/bold and scene breaks (the author's divider image or a
   "***" line becomes "* * *"). A status table becomes one "Label: value"
   paragraph per row. Removed: site chrome, every author note (they sit
   outside the chapter body and are Patreon/Discord/schedule notes), story
   images other than the divider, and the anti-copy lines Royal Road hides in
   each page with a per-page CSS class (`.<class>{display:none;speak:never}`).
   The build fails if any anti-copy wording survives. */
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {parseHTML} from 'linkedom';
import vm from 'node:vm';

const root=resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cache=process.env.WEBNOVEL_CACHE||'/tmp/breeze-webnovels';
const context={};
vm.runInNewContext(readFileSync(resolve(root,'scripts/core/book-identity.js'),'utf8')+';this.fingerprint=bookContentFingerprint;', context);

export const WORKS=[
  {id:'cinnamon-bun', fiction:'https://www.royalroad.com/fiction/31429/cinnamon-bun', chapters:[
    [477911,'chapter-zero-a-call-to-adventure'],[478242,'chapter-one-like-youve-seen-a-ghost'],
    [478742,'chapter-two-who-you-gonna-call'],[479147,'chapter-three-crime-spree'],
    [479680,'chapter-four-dusting-off-history'],[480002,'chapter-five-an-insightful-afternoon'],
    [481687,'chapter-six-armoured-and-ready'],[482677,'chapter-seven-grave'],
    [483656,'chapter-eight-a-look-into-the-past'],[485041,'chapter-nine-dungeon-dive'],
  ]},
  {id:'chasing-sunlight', fiction:'https://www.royalroad.com/fiction/73475/chasing-sunlight', chapters:[
    [1324694,'chapter-one'],[1326339,'chapter-two'],[1327463,'chapter-three'],[1328499,'chapter-four'],
    [1329752,'chapter-five'],[1336974,'chapter-six'],[1344153,'chapter-seven'],[1351519,'chapter-eight'],
    [1358788,'chapter-nine'],[1366046,'chapter-ten'],
  ]},
  {id:'mr-penn', fiction:'https://www.royalroad.com/fiction/54508/the-unexpected-engagement-of-the-marvelous-mr', chapters:[
    [910666,'chapter-1-the-invitations-arrive'],[911390,'chapter-2-the-policeman'],
    [912789,'chapter-3-lady-serrs-comtess'],[913461,'chapter-4-the-evening-and-morning-editions'],
    [914143,'chapter-5-cousin-eddie'],[914716,'chapter-6-the-exchange-of-letters'],
    [915375,'chapter-7-we-shall-see'],[916057,'chapter-8-preparations'],
    [917204,'chapter-9-penn-pays-his-respects'],[917957,'chapter-10-the-aftermath'],
  ]},
];
// Royal Road's injected provenance lines all name the site or pair "author" with
// permission/approval/copying. Any such paragraph in the output fails the build.
export function antiCopyLine(text){
  const value=String(text||'');
  if(/royal\s*road|royalroad|patreon|subscribestar/i.test(value)) return true;
  return /\bauthor/i.test(value)&&/permission|approv|consent|authori[sz]|permit|copied|this copy|reproduction|stolen|taken without/i.test(value);
}
const DIVIDER=/i\.imgur\.com\/FT0j8VK\.png/; // R. K. Goff's scene-break ornament
const chapterUrl=(work,[id,slug])=>`${work.fiction}/chapter/${id}/${slug}`;
const cacheFile=(work,[id])=>resolve(cache,`${work.id}-${id}.html`);

async function fetchAll(){
  const {chromium}=await import('playwright');
  mkdirSync(cache,{recursive:true});
  const browser=await chromium.launch({executablePath:process.env.CHROME||'/usr/bin/google-chrome',headless:false,
    args:['--disable-blink-features=AutomationControlled']});
  const page=await browser.newPage();
  try{
    for(const work of WORKS)for(const chapter of work.chapters){
      await page.goto(chapterUrl(work,chapter),{waitUntil:'domcontentloaded'});
      for(let i=0;i<30&&/Just a moment/.test(await page.title());i++)await page.waitForTimeout(1500);
      await page.waitForSelector('.chapter-content',{timeout:30000});
      writeFileSync(cacheFile(work,chapter),await page.content());
      console.log('saved',work.id,chapter[0]);
    }
  }finally{await browser.close();}
}

function collapse(raw, marks){
  let out='';
  const map=new Array(raw.length+1);
  for(let i=0;i<raw.length;i++){
    if(/\s/.test(raw[i])){ if(out&&!out.endsWith(' ')) out+=' '; }
    else out+=raw[i];
    map[i]=out.length;
  }
  map[raw.length]=out.length;
  const lead=0, text=out.replace(/ $/,'');
  const point=(old,end)=>{
    if(!end){
      let i=old; while(i<raw.length&&/\s/.test(raw[i])) i++;
      return i>=raw.length?text.length:Math.max(lead,map[i]-1);
    }
    let j=old-1; while(j>=0&&/\s/.test(raw[j])) j--;
    return j<0?0:Math.min(text.length,map[j]);
  };
  const next=[];
  for(const mark of marks){
    const start=point(mark.start,false), end=point(mark.end,true);
    if(end<=start) continue;
    const prev=next.at(-1);
    if(prev&&prev.kind===mark.kind&&prev.end>=start) prev.end=Math.max(prev.end,end);
    else next.push({kind:mark.kind,start,end});
  }
  return {text, marks:next};
}

function extractChapter(html){
  const hiddenClasses=[...html.matchAll(/\.([A-Za-z0-9_-]+)\s*\{[^}]*display\s*:\s*none/g)].map(match=>match[1]);
  const {document}=parseHTML(html);
  const body=document.querySelector('.chapter-inner.chapter-content');
  if(!body) throw new Error('No chapter body');
  const title=document.querySelector('.fic-header h1, h1')?.textContent.replace(/\s+/g,' ').trim();
  let removed=0;
  for(const name of hiddenClasses)for(const node of body.querySelectorAll('.'+name)){node.remove();removed++;}
  for(const node of body.querySelectorAll('[style]'))
    if(/display\s*:\s*none|visibility\s*:\s*hidden/i.test(node.getAttribute('style'))){node.remove();removed++;}
  if(!removed) throw new Error('No hidden anti-copy line found; the page layout may have changed');
  const blocks=[];
  let raw='', marks=[];
  const flush=()=>{
    const line=collapse(raw.replace(/\u00a0/g,' '),marks);
    raw=''; marks=[];
    if(!line.text) return;
    if(!/[A-Za-z0-9]/.test(line.text)){ blocks.push({role:'scene',text:'* * *'}); return; }
    blocks.push({role:'p',text:line.text,marks:line.marks});
  };
  const cellText=cell=>{
    const saved=[raw,marks]; raw=''; marks=[];
    walk(cell,null,true);
    const line=collapse(raw.replace(/\u00a0/g,' '),marks);
    [raw,marks]=saved;
    return line;
  };
  const table=node=>{
    flush();
    for(const row of node.querySelectorAll('tr')){
      const cells=[...row.querySelectorAll('td,th')].map(cellText).filter(cell=>cell.text);
      if(!cells.length) continue;
      let text='', rowMarks=[];
      cells.forEach((cell,index)=>{
        if(index) text+=': ';
        rowMarks.push(...cell.marks.map(mark=>({kind:mark.kind,start:mark.start+text.length,end:mark.end+text.length})));
        text+=cell.text;
      });
      blocks.push({role:'p',text,marks:rowMarks});
    }
  };
  function walk(node,kind,inline=false){
    if(node.nodeType===3){ raw+=node.nodeValue; return; }
    if(node.nodeType!==1) return;
    const tag=node.localName;
    if(tag==='script'||tag==='style') return;
    if(tag==='br'){ if(inline) raw+=' '; else flush(); return; }
    if(tag==='hr'){ flush(); blocks.push({role:'scene',text:'* * *'}); return; }
    if(tag==='img'){
      if(DIVIDER.test(node.getAttribute('src')||'')){ flush(); blocks.push({role:'scene',text:'* * *'}); }
      return;
    }
    if(tag==='table'&&!inline){ table(node); return; }
    const block=!inline&&/^(p|div|h[1-6]|blockquote|li|ul|ol|section)$/.test(tag);
    if(block) flush();
    const next=(tag==='i'||tag==='em')?'em':(tag==='b'||tag==='strong')?'strong':kind;
    const start=raw.length;
    for(const child of [...node.childNodes]) walk(child,next,inline);
    if(next&&next!==kind&&raw.length>start) marks.push({kind:next,start,end:raw.length});
    if(block) flush();
  }
  for(const child of [...body.childNodes]) walk(child,null);
  flush();
  // Scene breaks only between passages, never doubled.
  const kept=[];
  for(const block of blocks){
    if(block.role==='scene'&&(!kept.length||kept.at(-1).role==='scene')) continue;
    kept.push(block);
  }
  while(kept.at(-1)?.role==='scene') kept.pop();
  if(kept[0]&&kept[0].text===title) kept.shift();
  return {title, blocks:kept};
}

function build(){
  const layouts={}, summary={};
  for(const work of WORKS){
    const blocks=[], chapters=[];
    work.chapters.forEach((chapter,index)=>{
      const file=cacheFile(work,chapter);
      if(!existsSync(file)) throw new Error(`Missing ${file}. Run with --fetch first.`);
      const page=extractChapter(readFileSync(file,'utf8'));
      if(!page.title) throw new Error(`No title in ${file}`);
      if(!page.blocks.some(block=>block.role==='p')) throw new Error(`Empty chapter ${file}`);
      chapters.push({n:index+1,title:page.title,url:chapterUrl(work,chapter),paragraph:blocks.length});
      blocks.push({role:'chapter',text:page.title},...page.blocks);
    });
    for(const block of blocks)if(block.role!=='chapter'&&antiCopyLine(block.text))
      throw new Error(`${work.id}: anti-copy or promotional text survived: ${block.text}`);
    const text=blocks.map(block=>block.text).join('\n\n')+'\n';
    const layout={};
    blocks.forEach((block,index)=>{
      const entry={};
      if(block.role!=='p'){entry.role=block.role;entry.text=block.text;}
      const marks=block.marks||[];
      if(marks.length){
        entry.length=block.text.length;
        entry.fingerprint=context.fingerprint([block.text]);
        entry.ranges=marks.map(mark=>[mark.start,mark.end,mark.kind]);
      }
      if(entry.role||entry.ranges) layout[index]=entry;
    });
    layouts[work.id]=layout;
    writeFileSync(resolve(root,`assets/longreads/${work.id}.txt`),text);
    summary[work.id]={paragraphs:blocks.length,wordCount:text.trim().split(/\s+/).length,
      sha256:createHash('sha256').update(text).digest('hex'),chapters};
  }
  const source=`/* Generated by tools/build-webnovels.mjs. Do not edit by hand.
   Chapter headings, scene breaks and italic/bold ranges for the bundled
   웹소설 text books (assets/longreads/<id>.txt). They join the Breeze
   Original layout table, so the reader paints them exactly like Alice and
   Gatsby, and only while a paragraph still matches the shipped text. */
const WEB_NOVEL_LAYOUT=${JSON.stringify(layouts)};
if(typeof PUBLIC_DOMAIN_LAYOUT!=='undefined')Object.assign(PUBLIC_DOMAIN_LAYOUT,WEB_NOVEL_LAYOUT);
`;
  writeFileSync(resolve(root,'scripts/library/webnovel-layout.js'),source);
  console.log(JSON.stringify(summary,null,1));
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  if(process.argv.includes('--fetch')) await fetchAll();
  else build();
}
