import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
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
    await page.locator('#vsearch').focus();record.blurred=await sample();
    assert.equal(await page.evaluate(()=>words.port.ko),'항구와 부두 — 저장 확인');
    await page.locator('.vword').first().click();record.closed=await sample();
    assert.equal(record.closed.editable,null);
    assert.equal(record.closed.dialogs,0);
    for(const state of [record.focused,record.blurred,record.closed])assert.equal(state.visualViewport.scale,record.collapsed.visualViewport.scale,'Engine focus/blur/close changed viewport scale');
    assert.equal(record.collapsed.fontSize,'14px');

    const books=page.locator('#vbooks'),trigger=page.locator('#vbooks summary');
    await trigger.click();
    await page.getByLabel('Book B',{exact:true}).check();
    assert.equal(await books.getAttribute('open')!==null,true,'Inside selection must keep multi-select menu open');
    assert.equal(await page.locator('.vgroup').count(),1);
    assert.equal(await page.locator('#vbook-label').textContent(),'책 1권');
    await page.screenshot({path:`${out}/${key}-book-menu.png`});
    await page.locator('#vsearch').tap();
    record.bookOutsideTapClosed=await books.getAttribute('open')===null;
    await page.screenshot({path:`${out}/${key}-book-outside-tap.png`});
    if(!record.bookOutsideTapClosed)await trigger.click();
    await trigger.click();
    assert.equal(await page.getByLabel('Book B',{exact:true}).isChecked(),true,'Closing must preserve selection');
    await page.getByLabel('Book B',{exact:true}).focus();await page.keyboard.press('Escape');
    record.bookEscapeClosed=await books.getAttribute('open')===null;
    if(phase!=='before'){
      assert.equal(await trigger.evaluate(e=>e===document.activeElement),true,'Escape returns focus to summary');
      await trigger.click();await trigger.click();
      assert.equal(await books.getAttribute('open'),null,'Summary toggles close');
      await trigger.click();await page.locator('#vsort-menu summary').click();
      assert.equal(await books.getAttribute('open'),null,'Only one disclosure may remain open');
      await page.getByLabel('알파벳순',{exact:true}).check();
      assert.equal(await page.locator('#vsort-menu').getAttribute('open'),null,'Sort still closes on selection');
      await trigger.click();await page.goBack();
      await page.waitForFunction(()=>activeAppView()==='home');
      assert.equal(await books.getAttribute('open'),null,'Back follows existing Home navigation and closes hidden menu');
      await page.goForward();await page.waitForFunction(()=>activeAppView()==='vocab');
      assert.equal(await books.getAttribute('open'),null,'Forward must not resurrect an open menu');
      assert.equal(await page.locator('#vbook-label').textContent(),'책 1권');
      await trigger.click();assert.equal(await page.getByLabel('Book B',{exact:true}).isChecked(),true);
      await page.locator('#wordbook-home').click();await page.evaluate(()=>show('vocab'));
      assert.equal(await books.getAttribute('open'),null,'Navigation/reopen closes disclosure');
      await page.evaluate(()=>clearWordbookFilters());
      await page.evaluate(()=>{
        for(let i=0;i<40;i++)words['fixture'+i]={word:'fixture'+i,ko:'긴 뜻과 한글 입력 확인 '.repeat(8),status:1,book:'ZZ '+i+' 아주 긴 책 제목 '.repeat(6),addedAt:i+3};
        renderVocab();
      });
      await trigger.click();
      const options=page.locator('#vbook-options');
      assert.ok(await options.evaluate(e=>e.scrollHeight>e.clientHeight),'Long book list is internally scrollable');
      // Locator hover can first scroll the short viewport to reveal the menu.
      await options.hover();
      const bodyScroll=await page.evaluate(()=>scrollY);
      // Playwright mobile WebKit rejects mouse.wheel before dispatch. Keep
      // wheel coverage on supported contexts and label the mobile simulation.
      if(engine==='webkit'&&width<500){
        record.bookListScrollInput='DOM scrollBy; mobile WebKit wheel unsupported';
        await options.evaluate(e=>e.scrollBy(0,600));
      }else{
        record.bookListScrollInput='mouse wheel';
        await page.mouse.wheel(0,600);
      }
      await page.waitForFunction(()=>document.getElementById('vbook-options').scrollTop>0);
      assert.equal(await page.evaluate(()=>scrollY),bodyScroll,'Menu wheel scroll stays inside the book list');
      assert.equal(await books.getAttribute('open')!==null,true,'Scrolling does not dismiss the menu');
      await options.evaluate(e=>e.scrollTop=e.scrollHeight);
      await page.getByLabel('Book B',{exact:true}).check();
      assert.equal(await books.getAttribute('open')!==null,true,'Scroll/selection remain inside');
      await trigger.click();await page.evaluate(()=>clearWordbookFilters());
      await page.locator('.vword').first().click();
      await page.evaluate(()=>document.documentElement.style.fontSize='20px');
      record.largeText=await sample();
      assert.ok(parseFloat(record.largeText.fontSize)>=20,'Editable text follows larger root font preference');
      await page.evaluate(()=>document.documentElement.style.removeProperty('font-size'));
      await cell.fill('긴 한글 뜻 '.repeat(30));await page.locator('#vsearch').focus();
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow');
      await page.locator('#wordbook-add').click();
      const add=page.locator('#wordbook-add-dialog');
      await page.locator('#wordbook-new-meaning').fill('취소할 뜻');
      assert.equal(await page.locator('#wordbook-new-meaning').evaluate(e=>getComputedStyle(e).fontSize),'16px');
      await add.getByRole('button',{name:'취소',exact:true}).click();
      assert.equal(await page.locator('dialog[open]').count(),0,'Cancel releases native dialog');
      assert.equal(await page.locator('#vbook-options').count(),1,'No duplicate menu or overlay');
      await page.screenshot({path:`${out}/${key}-closed.png`});
      if(engine==='chromium'&&key==='phone-light'){
        // CDP scale is a simulation, not evidence of a physical pinch gesture.
        const cdp=await context.newCDPSession(page);
        await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1.5});
        await cell.focus();record.simulatedUserZoomFocused=await sample();
        await page.locator('#vsearch').focus();record.simulatedUserZoomBlurred=await sample();
        assert.equal(record.simulatedUserZoomFocused.visualViewport.scale,1.5);
        assert.equal(record.simulatedUserZoomBlurred.visualViewport.scale,1.5,'Editing must not force an existing page zoom back to 1');
        await cdp.send('Emulation.setPageScaleFactor',{pageScaleFactor:1});await cdp.detach();
      }
    }
    measurements.push(record);writeFileSync(`${out}/measurements.json`,JSON.stringify(measurements,null,2)+'\n');
    if(phase==='before'){
      assert.equal(record.focused.fontSize,'14px');
      assert.equal(record.bookOutsideTapClosed,false);assert.equal(record.bookEscapeClosed,false);
    }else{
      assert.ok(parseFloat(record.expanded.fontSize)>=16,'Editable meaning must reach the focus font floor before focus');
      assert.equal(record.bookOutsideTapClosed,true,'Outside tap must dismiss book disclosure');
      assert.equal(record.bookEscapeClosed,true,'Escape must dismiss book disclosure');
    }
    assert.deepEqual(errors,[]);await context.close();
  }
  console.log(`${engine}: 12 ${phase} theme/size cases passed. Evidence: ${out}. Native iOS focus zoom/keyboard/pinch are unverified.`);
}finally{if(browser)await browser.close();await new Promise(done=>server.close(done));}
