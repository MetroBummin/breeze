import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';

const root=resolve(process.env.BREEZE_LANDING_ROOT||fileURLToPath(new URL('../',import.meta.url)));
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const out=resolve(process.env.BREEZE_LANDING_PROOF||'/tmp/breeze-landing-proof',engine.name());
mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
  const pathname=decodeURIComponent(new URL(req.url,'http://local').pathname);
  const path=resolve(root,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!path.startsWith(root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await engine.launch(engine===chromium?{executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}:{});
const receipts=[];
async function inside(page,selector){
  const box=await page.locator(selector).boundingBox(),size=page.viewportSize();
  const nav=await page.locator('.lp-nav').boundingBox();
  assert.ok(box&&box.x>=15&&box.x+box.width<=size.width-15&&box.y>=nav.y+nav.height+10&&box.y+box.height<=size.height-14,`${selector} outside viewport: ${JSON.stringify({box,size,nav})}`);
}
async function scene(page,state){
  await page.evaluate(state=>window.scrollTo(0,state*document.getElementById('stage').clientHeight),state);
  await page.waitForFunction(state=>document.body.dataset.state===String(state),state);
  await page.waitForFunction(state=>document.getElementById('copy').lang===(state===0?'ko':'en'),state);
}
try{
  for(const [name,width,height] of [['phone',390,844],['tablet',820,1180],['desktop',1440,900],['narrow',320,568],['short',844,390]])for(const dark of [false,true]){
    const theme=dark?'dark':'light',context=await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
    const page=await context.newPage(),errors=[],missing=[],external=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('response',r=>{if(r.status()>=400)missing.push([r.url(),r.status()]);});
    await page.addInitScript(()=>{
      window.qaStorageWrites=[];window.qaDatabaseOpens=[];
      for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...args){window.qaStorageWrites.push(method);return original.apply(this,args);};}
      const open=indexedDB.open.bind(indexedDB);indexedDB.open=(...args)=>{window.qaDatabaseOpens.push(args[0]);return open(...args);};
    });
    await page.route('**/*',r=>{if(r.request().url().startsWith(url))return r.continue();external.push(r.request().url());return r.abort();});
    await page.goto(url+'landing/');await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'),'ko');
    assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('dark')),dark);
    const nav=await page.locator('.lp-nav').boundingBox(),mark=await page.locator('.lp-wordmark').boundingBox(),actions=await page.locator('.lp-actions').boundingBox();
    assert.ok(mark.x+mark.width<=actions.x&&actions.x+actions.width<=width&&nav.height<100,'Navigation fits without overlap');
    for(const selector of ['.lp-cta-web','.lp-cta-store'])assert.ok((await page.locator(selector).boundingBox()).height>=44);
    assert.equal(await page.locator('.lp-cta-web').getAttribute('href'),'../');
    assert.equal(await page.locator('.lp-cta-store').getAttribute('href'),'https://apps.apple.com/kr/app/id6804570182');
    assert.equal(await page.locator('.lp-cta-store').getAttribute('rel'),'noopener');
    for(const state of [0,1,2,3,4,5]){
      await scene(page,state);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name}/${theme}/${state}: horizontal overflow`);
      assert.equal(await page.locator('#copy').evaluate(n=>n.inert),state>=4);
      if(state===0)assert.match(await page.locator('#copy').innerText(),/이야기의 흐름 그대로/);
      if(state===1)assert.match(await page.locator('#copy').innerText(),/Stay with the story/);
      if(state===2){await page.locator('#word-peek').waitFor({state:'visible'});await inside(page,'#word-peek');}
      if(state===3){
        await page.locator('#ps-ko').waitFor({state:'visible'});await inside(page,'#p-sentence');
        assert.equal(await page.locator('#p-sentence').getAttribute('aria-modal'),'false');
        assert.equal(await page.locator('#sentence-scrim').evaluate(n=>getComputedStyle(n).display),'none');
        assert.equal(await page.locator('#ps-source').count(),0);
      }
      if(state>=4){
        const head=await page.locator(`#scene${state===4?'3':'4'} .lp-head`).boundingBox();
        const visual=await page.locator(state===4?'.lp-shelf':'.lp-devices').boundingBox();
        assert.ok(head.y>=nav.height&&head.y+head.height<=height,`${name}/${state}: heading readable`);
        const overlap=Math.max(0,Math.min(head.x+head.width,visual.x+visual.width)-Math.max(head.x,visual.x))*Math.max(0,Math.min(head.y+head.height,visual.y+visual.height)-Math.max(head.y,visual.y));
        assert.equal(overlap,0,`${name}/${state}: screen artwork covers heading`);
      }
      if(state===5){
        await page.locator('.lp-phone img').evaluate(n=>n.decode());
        assert.match(await page.locator('.lp-phone img').evaluate(n=>n.currentSrc),new RegExp(`memory-phone-${theme}\\.png$`));
        const target=await page.locator('.lp-support-link').boundingBox();assert.ok(target.height>=44&&target.y+target.height<=height);
        const phone=await page.locator('.lp-phone').boundingBox();assert.ok(phone.y+phone.height<=target.y,`${name}: Memory image overlaps support link`);
      }
      await page.screenshot({path:resolve(out,`${name}-${theme}-scene${state}.png`),animations:'disabled'});
    }
    // User keyboard and pointer input open the same offline examples.
    await scene(page,1);
    const word=page.locator('.w[data-w="story"]');await word.focus();await page.keyboard.press('Enter');
    await page.locator('#word-peek-more').click();await inside(page,'#panel');
    await page.locator('#p-easy-button').click();assert.match(await page.locator('#p-easy-text').innerText(),/이야기/);
    assert.equal(await page.locator('#p-easy-card').isVisible(),true);
    await page.keyboard.press('Escape');assert.equal(await page.locator('#panel').getAttribute('aria-hidden'),'true');
    await word.focus();await page.keyboard.press('Shift+Enter');await inside(page,'#p-sentence');
    await page.locator('#ps-easy-button').click();assert.equal(await page.locator('#ps-easy-card').isVisible(),true);await inside(page,'#p-sentence');
    await page.keyboard.press('Escape');assert.equal(await page.locator('#sentence-modal').isVisible(),false);
    const box=await word.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.waitForTimeout(820);await page.mouse.up();
    assert.equal(await page.locator('#sentence-modal').isVisible(),true);
    await page.locator('.lp-nav').click({position:{x:width/2,y:5}});assert.equal(await page.locator('#sentence-modal').isVisible(),false);
    await scene(page,5);await page.locator('.lp-support-link').click();assert.match(page.url(),/#support$/);
    const support=await page.locator('#support').boundingBox();assert.ok(support.y>=nav.height&&support.y<height);
    await page.screenshot({path:resolve(out,`${name}-${theme}-support.png`)});
    for(const href of await page.locator('#support a').evaluateAll(nodes=>nodes.map(n=>n.href))){const response=await context.request.get(href);assert.equal(response.status(),200,href);}
    assert.match(await page.locator('#support').innerText(),/Android 앱은 공개 준비 중/);
    assert.match(await page.locator('#support').innerText(),/Google·Apple 로그인은 준비 중/);
    assert.equal(await page.locator('a[href*="play.google"]').count(),0);
    // Preference changes update both shared tokens and real screenshot variants.
    await page.emulateMedia({colorScheme:dark?'light':'dark'});
    await page.waitForFunction(dark=>document.body.classList.contains('dark')===dark,!dark);
    assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('dark')),!dark);
    await page.waitForFunction(theme=>document.querySelector('.lp-phone img').currentSrc.endsWith(`memory-phone-${theme}.png`),dark?'light':'dark');
    assert.deepEqual(await page.evaluate(()=>qaStorageWrites),[]);assert.deepEqual(await page.evaluate(()=>qaDatabaseOpens),[]);
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);assert.deepEqual(external,[]);
    receipts.push({name,width,height,theme,scenes:6,passed:true});await context.close();
  }
  // Exercise live language transitions and the selected sentence on rotation.
  const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference',serviceWorkers:'block'});
  await page.goto(url+'landing/');await scene(page,3);await page.locator('#ps-ko').waitFor({state:'visible'});
  await page.setViewportSize({width:820,height:1180});await page.waitForTimeout(250);
  // Resize picks the current rail scene, then repositions its active surface.
  await scene(page,3);await inside(page,'#p-sentence');
  await scene(page,0);await scene(page,1);await scene(page,0);await scene(page,3);await inside(page,'#p-sentence');
  // Cross the language boundary faster than the text fade, then stop at word demo.
  await scene(page,0);
  for(const state of [1,0,1,2]){
    await page.evaluate(state=>window.scrollTo(0,state*document.getElementById('stage').clientHeight),state);
    await page.waitForFunction(state=>document.body.dataset.state===String(state),state);
  }
  await page.locator('#word-peek').waitFor({state:'visible'});await inside(page,'#word-peek');
  await page.close();
  writeFileSync(resolve(out,'results.json'),JSON.stringify({engine:engine.name(),receipts,checks:'60 scenes, 10 support views, both hero languages, no overlap/overflow, offline lookup/help, pointer/keyboard/escape/outside dismissal, theme changes, anchors/internal links, zero account/storage/network effects, live transitions and rotation'},null,2)+'\n');
  console.log(`${engine.name()}: 60 scenes / 10 support views; input, anchors, themes, links, source language, rotation and no app data writes passed.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
