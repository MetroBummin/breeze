/* Real Home line-box/path alignment, including a one-pixel baseline control.
 * Linux browser fonts are not proof of native Apple-font optical alignment. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const engines=[chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE);
assert.ok(engines.length,'BREEZE_QA_ENGINE must be chromium or webkit');
const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.BREEZE_HOME_HEADING_PROOF||'/tmp/breeze-home-heading-proof';
mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root)){res.writeHead(403).end();return;}
 try{
  res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.webp':'image/webp'})[extname(path)]||'application/octet-stream');
  res.end(readFileSync(path));
 }catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`,reports=[];
const headings=[['longform','longform'],['home-casuals','casuals']];

async function geometry(page){
 return page.locator('#v-home .section-link').evaluateAll(buttons=>buttons.map(button=>{
  const label=button.querySelector('span'),svg=button.querySelector('svg'),path=svg.querySelector('path');
  const r=label.getBoundingClientRect(),s=svg.getBoundingClientRect(),p=path.getBBox(),m=path.getScreenCTM();
  const point=new DOMPoint(p.x+p.width/2,p.y+p.height/2).matrixTransform(m);
  const box=e=>{const b=e.getBoundingClientRect();return {x:b.x+scrollX,y:b.y+scrollY,width:b.width,height:b.height};};
  return {label:label.textContent,button:box(button),text:box(label),svg:box(svg),
   section:box(button.closest('section')),dock:(()=>{const r=document.getElementById('home-controls').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})(),
   centerDelta:s.y+s.height/2-(r.y+r.height/2),pathDelta:point.y-(r.y+r.height/2),
   transform:getComputedStyle(svg).transform,align:getComputedStyle(button).alignItems,
   font:getComputedStyle(label).font,lineHeight:getComputedStyle(label).lineHeight,
   svgSize:[s.width,s.height],accessibleName:button.getAttribute('aria-label')};
 }));
}

try{
 for(const engine of engines){
  const browser=await engine.launch();
  try{
   const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,
    serviceWorkers:'block',reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
   await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
   await page.goto(url);await page.evaluate(()=>homeReady);
   await page.locator('#fileinput').setInputFiles({name:'Heading alignment.txt',mimeType:'text/plain',
    buffer:Buffer.from('A patient reader keeps words in their context.\n\n'.repeat(4))});
   await page.waitForFunction(()=>books.some(book=>book.kind==='txt'));
   for(const [width,height] of [[320,740],[390,844],[820,1180],[1440,900],[844,390],[390,360]]){
    await page.setViewportSize({width,height});
    for(const dark of [false,true])for(const lang of ['ko','en']){
     await page.evaluate(({dark,lang})=>{darkMode=dark;applyDark();setLang(lang);show('home');}, {dark,lang});
     await page.evaluate(()=>document.fonts.ready);
     await page.waitForFunction(()=>!rssLoading&&!document.querySelector('#casual-rail .rss-loading'));
     const key=`${engine.name()}-${width}x${height}-${dark?'dark':'light'}-${lang}`;
     // The control changes only the removed declaration, leaving actual fonts,
     // DOM, layout, cards and theme untouched. It must reproduce the displacement.
     const baseline=await page.addStyleTag({content:'#v-home .section-link svg{transform:translateY(1px)}'});
     const before=await geometry(page);
     for(const row of before){
      assert.ok(Math.abs(row.centerDelta-1)<.02,`${key}: baseline must reproduce +1px SVG shift`);
      assert.ok(Math.abs(row.pathDelta-1)<.02,`${key}: baseline path must reproduce +1px shift`);
     }
     if(lang==='ko')for(const [section] of headings){
      await page.locator(`#${section} .sec-head`).screenshot({path:`${out}/${key}-${section}-before.png`});
     }
     await baseline.evaluate(node=>node.remove());
     const after=await geometry(page);
     assert.equal(after.length,2);
     for(let i=0;i<after.length;i++){
      const row=after[i];
      assert.equal(row.align,'center',`${key}: shared flex alignment owns centering`);
      assert.equal(row.transform,'none',`${key}: no device-specific optical offset`);
      assert.ok(Math.abs(row.centerDelta)<.02,`${key}: SVG box center ${row.centerDelta}`);
      assert.ok(Math.abs(row.pathDelta)<.02,`${key}: visible path center ${row.pathDelta}`);
      assert.deepEqual(row.svgSize,[20,20]);
      assert.ok(row.accessibleName);
      for(const field of ['button','text','section','dock','font','lineHeight']){
       assert.deepEqual(row[field],before[i][field],`${key}: ${field} geometry/style changed`);
      }
     }
     reports.push({key,before,after});
     for(const [section,destination] of headings){
      const button=page.locator(`#${section} .section-link`);
      if(lang==='ko')await page.locator(`#${section} .sec-head`).screenshot({path:`${out}/${key}-${section}-after.png`});
      // Both label and icon remain part of the same existing hit target.
      await button.locator('span').click();
      await page.waitForFunction(view=>activeAppView()===view,destination);
      await page.goBack();await page.waitForFunction(()=>activeAppView()==='home');
      await button.locator('svg').click();
      await page.waitForFunction(view=>activeAppView()===view,destination);
      await page.goBack();await page.waitForFunction(()=>activeAppView()==='home');
     }
     if(lang==='ko')await page.screenshot({path:`${out}/${key}-home.png`,fullPage:true});
    }
   }
   for(const [section,destination] of headings){
    await page.locator(`#${section} .section-link`).focus();await page.keyboard.press('Enter');
    await page.waitForFunction(view=>activeAppView()===view,destination);
    await page.goBack();await page.waitForFunction(()=>activeAppView()==='home');
    await page.goForward();await page.waitForFunction(view=>activeAppView()===view,destination);
    await page.goBack();await page.waitForFunction(()=>activeAppView()==='home');
   }
   assert.deepEqual(errors,[],`${engine.name()}: page errors`);
   console.log(`${engine.name()}: Home heading centers, unchanged layout/hit targets, label/icon/keyboard navigation and 24 viewport/theme/language cases passed`);
  }finally{await browser.close();}
 }
}finally{
 writeFileSync(`${out}/geometry-${process.env.BREEZE_QA_ENGINE||'all'}.json`,JSON.stringify(reports,null,2)+'\n');
 await new Promise(done=>server.close(done));
}
