import assert from 'node:assert/strict';
import {readFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 try{if(!path.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const output=process.env.BREEZE_QA_OUTPUT;if(output)mkdirSync(output,{recursive:true});
try{for(const engine of [chromium,webkit]){
 const browser=await engine.launch();
 try{for(const viewport of [{width:390,height:844},{width:320,height:740},{width:768,height:1024},{width:1440,height:900},{width:390,height:480}]){
 const page=await browser.newPage({viewport,serviceWorkers:'block'});
 await page.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
 await page.goto(url);await page.evaluate(()=>homeReady);
 await page.evaluate(()=>{
  books=[{id:'transition-fixture',title:'A gentle breeze',kind:'txt',paras:Array.from({length:60},()=>('A gentle breeze makes reading feel easy. ').repeat(8))}];
  positions={'transition-fixture':{t:1,p:.5,y:900,mode:'text'}};renderHomeResume();
  const original=document.startViewTransition.bind(document);
  document.startViewTransition=callback=>{
   window.controlFrameReady=false;
   const transition=original(callback);
   transition.ready.then(()=>{window.controlAnimations=document.getAnimations();controlAnimations.forEach(a=>{a.pause();a.currentTime=220;});window.controlFrameReady=true;});
   return transition;
  };
 });
 for(const dark of [false,true]){
  await page.evaluate(dark=>document.body.classList.toggle('dark',dark),dark);
  for(const direction of ['open','close']){
   await page.evaluate(direction=>{if(direction==='open')void resumeHomeBook(document.getElementById('home-resume'));else void returnHomeFromReader();},direction);
   await page.waitForFunction(()=>window.controlFrameReady);
   const state=await page.evaluate(()=>{
    const group=getComputedStyle(document.documentElement,'::view-transition-group(reader-control)');
    const node=document.querySelector(activeAppView()==='read'?'#readpill':'#home-resume');
    return {filter:group.backdropFilter||group.webkitBackdropFilter,overflow:group.overflow,rect:node.getBoundingClientRect().toJSON(),shadow:getComputedStyle(node).boxShadow};
   });
   assert.equal(state.filter,'none',`${engine.name()} ${direction}: rectangular backdrop still active`);
   assert.notEqual(state.overflow,'clip','must preserve outer capsule shadow');
   assert.notEqual(state.shadow,'none');
   const shot=await page.screenshot({path:output?`${output}/${engine.name()}-${viewport.width}x${viewport.height}-${dark?'dark':'light'}-${direction}.png`:undefined});
   if(engine===chromium){
    // Sample the very corners of the rectangular group, outside the rounded
    // capsule. Compare to the actual scene with the group hidden; allow only
    // the existing soft shadow, not the bright rectangular blur patch.
    const legacy=await page.addStyleTag({content:'html:is(.home-resuming,.home-returning)::view-transition-group(reader-control){backdrop-filter:blur(19px) saturate(122%)!important;-webkit-backdrop-filter:blur(19px) saturate(122%)!important}'});
    const oldShot=await page.screenshot();await legacy.evaluate(n=>n.remove());
    const hide=await page.addStyleTag({content:'::view-transition-group(reader-control){visibility:hidden!important}'});
    const scene=await page.screenshot();await hide.evaluate(n=>n.remove());
    const delta=await page.evaluate(async({shot,oldShot,scene,rect})=>{
     async function pixels(data){const im=await createImageBitmap(new Blob([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],{type:'image/png'}));const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width};}
     const a=await pixels(shot),old=await pixels(oldShot),b=await pixels(scene);let fixedDelta=0,oldDelta=0;
     for(const x of [Math.ceil(rect.x)+1,Math.floor(rect.right)-2])for(const y of [Math.ceil(rect.y)+1,Math.floor(rect.bottom)-2]){
      const i=(y*a.width+x)*4;for(let channel=0;channel<3;channel++){fixedDelta+=Math.abs(a.data[i+channel]-b.data[i+channel]);oldDelta+=Math.abs(old.data[i+channel]-b.data[i+channel]);}
     }return {fixed:fixedDelta,old:oldDelta};
    },{shot:shot.toString('base64'),oldShot:oldShot.toString('base64'),scene:scene.toString('base64'),rect:state.rect});
    assert.ok(delta.fixed<delta.old,`${direction}, ${viewport.width}, dark=${dark}: rectangular corner deltas ${JSON.stringify(delta)}`);
   }
   await page.evaluate(()=>controlAnimations.forEach(a=>a.finish()));
   await page.waitForFunction(()=>!homeResumeOpening&&!homeReturnTransition);
   assert.equal(await page.locator(direction==='open'?'#readpill':'#home-resume').isVisible(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.matches('.home-resuming,.home-returning')),false);
  }
 }
 await page.close();
 }console.log(engine.name()+': both directions, themes, five viewport sizes, shadow and capsule corners passed');
 }finally{await browser.close();}
}}finally{await new Promise(done=>server.close(done));}
