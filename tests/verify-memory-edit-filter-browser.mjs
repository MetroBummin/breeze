import assert from 'node:assert/strict';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';

const root=resolve(process.env.MEMORY_ROOT||new URL('../',import.meta.url).pathname);
const phase=process.env.MEMORY_PHASE||'after',engine=process.env.BROWSER||'chromium';
const out=process.env.MEMORY_PROOF||`/tmp/breeze-memory-edit-filter/${phase}/${engine}`;
mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
  const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
let browser;
const measurements=[];
try{
  browser=await (engine==='webkit'?webkit:chromium).launch(engine==='chromium'&&process.env.BREEZE_BROWSER_EXECUTABLE?{executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}:{});
  for(const [name,width,height] of [['phone',390,844],['narrow',320,568],['tablet',820,1180],['desktop',1440,900],['short',844,390],['keyboard-sized',390,400]])for(const dark of [false,true]){
    const context=await browser.newContext({viewport:{width,height},hasTouch:true,isMobile:width<500,serviceWorkers:'block',reducedMotion:'reduce'});
    await context.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
    await context.addInitScript(d=>{localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));localStorage.setItem('breeze.dark',JSON.stringify(d));},dark);
    const page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url,{waitUntil:'domcontentloaded'});await page.evaluate(()=>homeReady);
    await page.evaluate(()=>{
      words={and:{word:'and',ko:'그리고',status:2,book:'Book A',addedAt:1},port:{word:'port',ko:'항구',status:1,book:'Book B',addedAt:2}};
      saveWords(Object.keys(words));
      show('vocab');
    });
    await page.evaluate(()=>document.fonts.ready);
    const sample=()=>page.evaluate(()=>{
      const cell=document.querySelector('.vko'),style=getComputedStyle(cell),vv=visualViewport;
      return {fontSize:style.fontSize,lineHeight:style.lineHeight,editable:cell.getAttribute('contenteditable'),focused:document.activeElement===cell,
        innerWidth,innerHeight,scrollX,scrollY,visualViewport:vv?{scale:vv.scale,width:vv.width,height:vv.height,offsetLeft:vv.offsetLeft,offsetTop:vv.offsetTop}:null,
        viewport:document.querySelector('meta[name="viewport"]').content,dialogs:document.querySelectorAll('dialog[open]').length,
        menus:[...document.querySelectorAll('#vbooks[open],#vsort-menu[open]')].map(e=>e.id)};
    });
    const key=`${name}-${dark?'dark':'light'}`,record={key,engine,coverage:'Browser engine only; keyboard-sized is a resized viewport, not a native keyboard',collapsed:await sample()};
    const cell=page.locator('.vko').first();
    await page.locator('.vword').first().click();
    record.expanded=await sample();
    await cell.tap();record.focused=await sample();
    await page.screenshot({path:`${out}/${key}-meaning-focused.png`});
    await cell.fill('항구와 부두 — 저장 확인');
    await page.locator('#wordbook-home').focus();record.blurred=await sample();
    assert.equal(await page.evaluate(()=>words.port.ko),'항구와 부두 — 저장 확인');
    await page.locator('.vword').first().click();record.closed=await sample();
    assert.equal(record.closed.editable,null);
    assert.equal(record.closed.dialogs,0);
    for(const state of [record.focused,record.blurred,record.closed])assert.equal(state.visualViewport.scale,record.collapsed.visualViewport.scale,'Engine focus/blur/close changed viewport scale');
    assert.equal(record.collapsed.fontSize,'14px');

    assert.equal(await page.locator('.wordbook-filters,#vbooks,#vsort,#vfilter-clear').count(),0,'sort and book filters stay removed');
    assert.equal(await page.locator('#vstars').isVisible(),false);
    if(phase!=='before'){
      await page.locator('.vword').first().click();
      await page.evaluate(()=>document.documentElement.style.fontSize='20px');
      record.largeText=await sample();
      assert.ok(parseFloat(record.largeText.fontSize)>=20,'Editable text follows larger root font preference');
      await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
      await cell.fill('긴 한글 뜻 '.repeat(30));await page.locator('#wordbook-home').focus();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
      await page.locator('#wordbook-add').click();
      const add=page.locator('#wordbook-add-dialog');
      await page.locator('#wordbook-new-meaning').fill('취소할 뜻');
      assert.equal(await page.locator('#wordbook-new-meaning').evaluate(e=>getComputedStyle(e).fontSize),'16px');
      await add.getByRole('button',{name:'취소',exact:true}).click();
      assert.equal(await page.locator('dialog[open]').count(),0,'Cancel releases native dialog');
      await page.screenshot({path:`${out}/${key}-closed.png`});
      if(engine==='chromium'&&key==='phone-light'){
        // CDP scale is a simulation, not evidence of a physical pinch gesture.
        // The viewport lock rejects it: editing must not leave the page scaled.
        const cdp=await context.newCDPSession(page);
        await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});
        await cell.focus();record.simulatedUserZoomFocused=await sample();
        await page.locator('#wordbook-home').focus();record.simulatedUserZoomBlurred=await sample();
        assert.equal(record.simulatedUserZoomFocused.visualViewport.scale,1,'Page zoom stays locked while a meaning is focused');
        assert.equal(record.simulatedUserZoomBlurred.visualViewport.scale,1,'Page zoom stays locked after editing');
        await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await cdp.detach();
      }
    }
    measurements.push(record);writeFileSync(`${out}/measurements.json`,JSON.stringify(measurements,null,2)+'\n');
    if(phase==='before'){
      assert.equal(record.focused.fontSize,'14px');
    }else{
      assert.ok(parseFloat(record.expanded.fontSize)>=16,'Editable meaning must reach the focus font floor before focus');
      assert.equal(await page.locator('.wordbook-filters,#vbooks,#vsort,#vfilter-clear').count(),0);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log(`${engine}: 12 ${phase} theme/size cases passed. Evidence: ${out}. Native iOS focus zoom/keyboard/pinch are unverified.`);
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
