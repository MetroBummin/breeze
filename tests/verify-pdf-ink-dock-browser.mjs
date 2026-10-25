/* Writing-dock gesture in a real browser. Synthetic touch is not Pencil proof. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {extname,resolve} from 'node:path';
import {mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {pdfGeometryFixture} from './helpers/pdf-geometry-fixture.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html'};
const server=createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
 const p=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
 if(!p.startsWith(root)){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',mime[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}
 catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}`;
const engines=[chromium,webkit].filter(engine=>!process.env.BREEZE_QA_ENGINE||engine.name()===process.env.BREEZE_QA_ENGINE);
if(!process.env.BREEZE_QA_ENGINE)engines.splice(1);

try{
 for(const engine of engines){
  const profile=mkdtempSync(resolve(tmpdir(),'breeze-ink-dock-'));
  const browser=await engine.launchPersistentContext(profile,{
    headless:true,
    executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,
    viewport:{width:1180,height:820},
    hasTouch:true,
    serviceWorkers:'block'
  });
  try{
   const page=await browser.newPage();
   const errors=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.addInitScript(()=>{
    window.breezeInkIPad=true;
    window.webkit={messageHandlers:{breezeInkScope:{postMessage:payload=>{window.qaInkScope=payload;}}}};
   });
   await page.goto(url);
   await page.locator('#fileinput').setInputFiles({name:'English-exam.pdf',mimeType:'application/pdf',buffer:pdfGeometryFixture()});
   await page.waitForFunction(()=>books.some(book=>book.kind==='pdf'));
   await page.evaluate(async()=>{await openBook(books.find(book=>book.kind==='pdf'));await switchReaderMode('original');});
   await page.waitForSelector('.pdf-source-page .pdf-ink-layer');
   await page.waitForTimeout(600);
   await page.locator('[data-ink-toggle]').click();
   await page.waitForFunction(()=>document.querySelector('[data-ink-toggle]')?.getAttribute('aria-pressed')==='true'&&document.body.dataset.inkDock==='bottom'&&window.qaInkScope?.enabled);
   const pointer=async(type,x,y,kind='touch',id=1)=>page.evaluate(({type,x,y,kind,id})=>{
    const target=document.elementFromPoint(x,y)||document.querySelector('[data-ink-mode="pen"]');
    target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:id,pointerType:kind,isPrimary:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1}));
    return true;
   },{type,x,y,kind,id});
   const center=async selector=>page.locator(selector).evaluate(node=>{
    const r=node.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2,left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};
   });
   const hiddenRow=()=>page.evaluate(()=>{
    const styleOf=node=>getComputedStyle(node).visibility;
    return {
      nav:styleOf(document.getElementById('reader-navigation')),
      pill:styleOf(document.getElementById('readpill')),
      aa:styleOf(document.getElementById('aafab')),
      entry:styleOf(document.querySelector('.ink-pill-entry'))
    };
   });

   const pen=await center('[data-ink-mode="pen"]');
   await pointer('pointerdown',pen.x,pen.y,'touch');
   await page.waitForTimeout(120);
   assert.equal(await page.locator('#ink-dock-puck').getAttribute('hidden'),'','a short touch is still a tap');
   await pointer('pointerup',pen.x,pen.y,'touch');
   await page.evaluate(()=>document.querySelector('[data-ink-mode="highlighter"]').click());
   assert.equal(await page.locator('[data-ink-mode="highlighter"]').getAttribute('aria-pressed'),'true');
   await page.locator('[data-ink-mode="pen"]').click();

   const again=await center('[data-ink-mode="pen"]');
   await pointer('pointerdown',again.x,again.y,'pen');
   await page.waitForTimeout(460);
   assert.equal(await page.locator('#ink-dock-puck').evaluate(node=>node.hidden),true,'a pencil hold does not pick up the dock');
   await pointer('pointerup',again.x,again.y,'pen');
   if(await page.locator('#pdf-ink-settings').isVisible())await page.locator('[data-ink-mode="pen"]').click();

   await page.locator('#aafab').click();
   assert.equal(await page.locator('#aa-ink-dock').isVisible(),true,'the move switch shows for a supported PDF');
   assert.equal(await page.locator('#aa-ink-dock-move').getAttribute('aria-pressed'),'false');
   await page.evaluate(()=>closeAa());
   const parked=await center('#readpill');
   await pointer('pointerdown',parked.x,parked.y,'touch',3);
   await page.waitForTimeout(460);
   assert.equal(await page.locator('#ink-dock-puck').evaluate(node=>node.hidden),true,'a long-press does nothing while moving is off');
   assert.equal(await page.evaluate(()=>document.body.dataset.inkDock),'bottom');
   await pointer('pointerup',parked.x,parked.y,'touch',3);
   await page.locator('#aafab').click();
   await page.locator('#aa-ink-dock-move').click();
   assert.equal(await page.locator('#aa-ink-dock-move').getAttribute('aria-pressed'),'true');
   assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.inkDockMove')),'true');
   await page.evaluate(()=>closeAa());

   const origin=await center('#readpill');
   await pointer('pointerdown',origin.x,origin.y,'touch',7);
   await page.waitForTimeout(460);
   const carried=await hiddenRow();
   assert.deepEqual(carried,{nav:'hidden',pill:'hidden',aa:'hidden',entry:'hidden'});
   assert.equal(await page.locator('#ink-dock-puck').evaluate(node=>node.hidden),false);
   assert.equal(await page.locator('#ink-dock-puck').count(),1);
   const formed=await page.locator('#ink-dock-puck .ink-dock-face svg').evaluate(node=>{
    const icon=node.getBoundingClientRect();
    const puck=document.getElementById('ink-dock-puck').getBoundingClientRect();
    return {w:icon.width,h:icon.height,puckW:puck.width};
   });
   assert.ok(formed.w>=18&&formed.w<=30&&formed.h>=18&&formed.h<=30,'the pen icon stays at toolbar size while the row collapses');
   assert.ok(formed.puckW>formed.w+8,'the circle forms around the icon');
   for(const point of [{x:590,y:80},{x:590,y:40}])await pointer('pointermove',point.x,point.y,'touch',7);
   await page.waitForTimeout(260);
   const moving=await page.locator('#ink-dock-puck').evaluate(node=>{
    const r=node.getBoundingClientRect();
    return {transform:node.style.transform,width:r.width,height:r.height,stacks:node.querySelectorAll('.ink-dock-stack').length};
   });
   assert.equal(moving.stacks,2);
   assert.match(moving.transform,/scale\(/);
   assert.ok(Math.abs(moving.width-moving.height)<8,'the merged puck is one circle');
   await page.waitForFunction(()=>{
    const puck=document.getElementById('ink-dock-puck').getBoundingClientRect();
    const scope=window.qaInkScope;
    return !!scope&&scope.excluded.some(rect=>Math.abs((rect[0]+rect[2]/2)-(puck.x+puck.width/2))<40&&Math.abs((rect[1]+rect[3]/2)-(puck.y+puck.height/2))<40);
   });
   await pointer('pointerup',590,36,'touch',7);
   await page.evaluate(()=>document.querySelector('[data-ink-mode="pen"]').dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
   await page.waitForFunction(()=>document.getElementById('ink-dock-puck').hidden&&document.body.dataset.inkDock==='top');
   assert.equal(await page.evaluate(()=>localStorage.getItem('breeze.pdfInk.dock')),'top');
   assert.equal(await page.locator('#pdf-ink-settings').isVisible(),false,'the long-press does not also open tool settings');
   const top=await page.evaluate(()=>{
    const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,v:getComputedStyle(node).visibility};};
    return {nav:box(document.getElementById('reader-navigation')),pill:box(document.getElementById('readpill')),aa:box(document.getElementById('aafab')),entry:box(document.querySelector('.ink-pill-entry'))};
   });
   for(const part of [top.nav,top.pill,top.aa,top.entry]){
    assert.equal(part.v,'visible');
    assert.ok(part.y<80, 'top dock sits on the top edge');
   }
   assert.ok(Math.abs((top.nav.y+top.nav.h/2)-(top.aa.y+top.aa.h/2))<24);

   await page.locator('#aafab').click();
   const aa=await page.evaluate(()=>{
    const button=document.getElementById('aafab').getBoundingClientRect();
    const pop=document.getElementById('aa-pop').getBoundingClientRect();
    return {buttonTop:button.top,popTop:pop.top,bottom:document.getElementById('aa-pop').style.bottom};
   });
   assert.equal(aa.bottom,'auto');
   assert.ok(aa.popTop>=aa.buttonTop-2,'Aa on the top edge opens downward');
   await page.evaluate(()=>closeAa());

   const fromTop=await center('#readpill');
   await pointer('pointerdown',fromTop.x,fromTop.y,'touch',8);
   await page.waitForTimeout(460);
   await pointer('pointermove',1120,410,'touch',8);
   await page.waitForTimeout(180);
   await pointer('pointerup',1120,410,'touch',8);
   await page.evaluate(()=>document.body.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
   await page.waitForFunction(()=>document.getElementById('ink-dock-puck').hidden&&document.body.classList.contains('ink-dock-right'));
   const side=await page.evaluate(()=>{
    const box=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,v:getComputedStyle(node).visibility};};
    return {nav:box(document.getElementById('reader-navigation')),pill:box(document.getElementById('readpill')),aa:box(document.getElementById('aafab')),entry:box(document.querySelector('.ink-pill-entry')),width:innerWidth};
   });
   assert.ok(side.nav.h>side.nav.w,'the page pill stacks vertically');
   assert.ok(side.nav.x>side.width-80);
   assert.ok(Math.abs(side.pill.x-side.nav.x)<8);
   assert.ok(side.aa.y>side.pill.y);
   assert.equal(side.entry.v,'visible');
   assert.ok(side.entry.x>=side.pill.x-1&&side.entry.x+side.entry.w<=side.pill.x+side.pill.w+1);

   await page.locator('[data-ink-mode="pen"]').click();
   const settings=await page.evaluate(()=>{
    const panel=document.getElementById('pdf-ink-settings').getBoundingClientRect();
    const pill=document.getElementById('readpill').getBoundingClientRect();
    return {panelRight:panel.right,pillLeft:pill.left,visible:!document.getElementById('pdf-ink-settings').hidden};
   });
   assert.equal(settings.visible,true);
   assert.ok(settings.panelRight<=settings.pillLeft+2,'settings on a right dock open to the left');
   await page.locator('[data-ink-mode="pen"]').click();

   await page.locator('#pdf-page-button').click();
   await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='true');
   const sidebar=await page.locator('#pdf-page-control').boundingBox();
   assert.ok(sidebar.x<24&&sidebar.height>400,'the page sidebar still opens from the left screen edge');
   await page.locator('#pdf-navigation-toggle').click();
   await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='false');

   await page.emulateMedia({reducedMotion:'reduce'});
   const reducedFrom=await center('#aafab');
   await pointer('pointerdown',reducedFrom.x,reducedFrom.y,'touch',9);
   await page.waitForTimeout(460);
   await pointer('pointermove',200,200,'touch',9);
   await page.waitForTimeout(50);
   const reduced=await page.locator('#ink-dock-puck').evaluate(node=>node.style.transform);
   assert.match(reduced,/rotate\(0deg\) scale\(1, 1\)|rotate\(0deg\) scale\(1,1\)/);
   await pointer('pointerup',40,410,'touch',9);
   await page.evaluate(()=>document.body.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true})));
   await page.waitForFunction(()=>document.body.classList.contains('ink-dock-left'));
   await page.locator('#aafab').click();
   const leftAa=await page.evaluate(()=>{
    const button=document.getElementById('aafab').getBoundingClientRect();
    const pop=document.getElementById('aa-pop');
    return {rightward:pop.style.right==='auto'&&pop.style.left!=='auto',popLeft:pop.getBoundingClientRect().left,buttonLeft:button.left};
   });
   assert.equal(leftAa.rightward,true);
   assert.ok(leftAa.popLeft>=leftAa.buttonLeft-2,'Aa on the left edge opens rightward');
   await page.locator('#aa-ink-dock-move').click();
   await page.evaluate(()=>closeAa());
   await page.waitForFunction(()=>document.body.dataset.inkDock==='bottom'&&!document.body.classList.contains('ink-dock-left'));
   const returned=await center('#readpill');
   await pointer('pointerdown',returned.x,returned.y,'touch',10);
   await page.waitForTimeout(460);
   assert.equal(await page.locator('#ink-dock-puck').evaluate(node=>node.hidden),true,'turning the switch off parks the row at the bottom');
   await pointer('pointerup',returned.x,returned.y,'touch',10);
   assert.deepEqual(errors.filter(message=>!message.includes('ResizeObserver loop')),[]);
   console.log(engine.name()+': writing dock long-press, snap, settings, and Aa passed');
  }finally{await browser.close();rmSync(profile,{recursive:true,force:true});}
 }
}finally{server.close();}
