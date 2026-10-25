import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=process.env.BREEZE_EXPORT_PROOF||'/tmp/breeze-vocabulary-export';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{
  const file=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!file.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.png':'image/png','.svg':'image/svg+xml'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));}
  catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`,reports=[];
try{for(const engine of [chromium,webkit].filter(e=>!process.env.BREEZE_QA_ENGINE||e.name()===process.env.BREEZE_QA_ENGINE)){
  const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce',timezoneId:'UTC'});
    const errors=[],downloads=[],checks=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('download',d=>downloads.push(d));
    await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());
    await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
    await page.goto(url);await page.evaluate(()=>homeReady);
    await page.evaluate(()=>{
      window.exportTest={mode:'unsupported',toasts:[],shares:[],urls:[],revoked:[],clicks:[],revokeTimers:[],failURL:0,failClick:0};
      const originalToast=toast;toast=msg=>{exportTest.toasts.push(msg);originalToast(msg)};
      const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL),click=HTMLAnchorElement.prototype.click,timer=window.setTimeout;
      URL.createObjectURL=file=>{
        if(exportTest.failURL-->0)throw new DOMException('Synthetic Blob failure','NotSupportedError');
        const url=create(file);exportTest.urls.push(url);return url;
      };
      URL.revokeObjectURL=url=>{exportTest.revoked.push(url);revoke(url)};
      window.setTimeout=function(fn,delay,...args){if(delay===60000)exportTest.revokeTimers.push({fn,delay});return timer(fn,delay,...args)};
      HTMLAnchorElement.prototype.click=function(){
        exportTest.clicks.push({active:navigator.userActivation.isActive,connected:this.isConnected,name:this.download});
        if(exportTest.failClick-->0)throw new DOMException('Synthetic download block','NotAllowedError');
        return click.call(this);
      };
      Object.defineProperty(navigator,'canShare',{configurable:true,value:()=>{
        if(exportTest.mode==='canShare-throws')throw new TypeError('Synthetic capability failure');
        return exportTest.mode!=='unsupported';
      }});
      Object.defineProperty(navigator,'share',{configurable:true,value:data=>{
        exportTest.shares.push({active:navigator.userActivation.isActive,file:data.files[0]});
        if(exportTest.mode==='success')return Promise.resolve();
        if(exportTest.mode==='pending')return new Promise((resolve,reject)=>{exportTest.resolve=resolve;exportTest.reject=reject});
        return Promise.reject(new DOMException('Synthetic share result',exportTest.mode));
      }});
      words={
        breeze:{word:'breeze',ko:'산들바람, 미풍',defs:[{pos:'n.',def:'a gentle "wind"'}],example:'A "breeze".\n두 번째 줄',status:2,book:'Synthetic, Book',addedAt:1704153600000},
        apple:{word:'apple',ko:'사과',status:1,addedAt:1704067200000},
        pending:{word:'pending',ko:'  ',status:1,addedAt:1704240000000}
      };
      show('memory');
    });
    await page.evaluate(()=>openStudySetsAllWords());
    await page.waitForFunction(()=>studySetsUI.screen==='all'&&document.getElementById('study-sets-share')&&!document.getElementById('study-sets-share').hidden&&document.getElementById('study-sets-edit').hidden);
    const button=page.locator('#study-sets-share'),dialog=page.locator('#task-dialog'),submit=page.locator('#task-submit');
    const share=async()=>{
      if(await button.isDisabled()){await page.evaluate(()=>studySetsShareVisible());return;}
      await button.tap();
    };
    const idle=()=>page.waitForFunction(()=>!document.getElementById('study-sets-share').disabled);
    const opened=()=>page.waitForFunction(()=>document.getElementById('task-dialog').open);
    const record=name=>{checks.push(name);console.log(`${engine.name()}: ${name}`)};
    const reset=async mode=>{
      assert.equal(await dialog.isVisible(),false);
      await page.evaluate(mode=>{
        Object.assign(exportTest,{mode,toasts:[],shares:[],urls:[],revoked:[],clicks:[],revokeTimers:[],failURL:0,failClick:0});
        clearTimeout(toastTimer);document.getElementById('toast').classList.remove('on');
      },mode);
    };
    const nextDownload=async action=>{
      const pending=page.waitForEvent('download');await action();const download=await pending;
      assert.equal(download.suggestedFilename(),'breeze_vocab.csv');assert.equal(await download.failure(),null);
      await idle();return readFileSync(await download.path());
    };
    const focusReturned=async()=>{await idle();assert.equal(await page.evaluate(()=>document.activeElement.id),'study-sets-share');};

    const originalWords=await page.evaluate(()=>JSON.stringify(words));
    const csv=await nextDownload(()=>share());
    assert.equal(csv.subarray(0,3).toString('hex'),'efbbbf');
    const dates=await page.evaluate(()=>[1704153600000,1704067200000].map(n=>new Date(n).toLocaleDateString('ko-KR')));
    assert.equal(csv.toString('utf8'),'\uFEFF단어,뜻,영어 뜻,예문,모르는 정도,책,저장일\r\nbreeze,"산들바람, 미풍","(n.) a gentle ""wind""","A ""breeze"".\n두 번째 줄",★★,"Synthetic, Book",'+dates[0]+'\r\napple,사과,,,★,,'+dates[1]);
    assert.equal(await page.evaluate(()=>JSON.stringify(words)),originalWords);
    assert.deepEqual(await page.evaluate(()=>exportTest.clicks),[{active:true,connected:true,name:'breeze_vocab.csv'}]);
    assert.equal(await page.locator('a[download="breeze_vocab.csv"]').count(),0);
    assert.deepEqual(await page.evaluate(()=>exportTest.revokeTimers.map(t=>t.delay)),[60000]);
    await page.evaluate(()=>exportTest.revokeTimers[0].fn());
    assert.deepEqual(await page.evaluate(()=>exportTest.revoked),await page.evaluate(()=>exportTest.urls));
    writeFileSync(resolve(out,`${engine.name()}-synthetic.csv`),csv);record('unsupported share: exact CSV bytes, trusted download, cleanup');

    await reset('success');let count=downloads.length;await share();await idle();
    assert.equal(downloads.length,count);assert.equal(await dialog.isVisible(),false);
    assert.deepEqual(await page.evaluate(()=>exportTest.shares.map(s=>({active:s.active,type:s.file.type,name:s.file.name}))),[{active:true,type:'text/csv',name:'breeze_vocab.csv'}]);
    assert.deepEqual(await page.evaluate(async()=>Array.from(new Uint8Array(await exportTest.shares[0].file.arrayBuffer()))),Array.from(csv));
    record('successful share: bare CSV MIME, original bytes and trusted activation');

    await reset('pending');count=downloads.length;await share();
    assert.equal(await button.isDisabled(),true);
    const box=await button.boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await page.evaluate(()=>studySetsShareVisible());
    assert.equal(await page.evaluate(()=>exportTest.shares.length),1);
    await page.evaluate(()=>exportTest.reject(new DOMException('No targets or cancelled','AbortError')));await opened();
    assert.equal(downloads.length,count);assert.equal(await button.isDisabled(),true);
    await page.evaluate(()=>studySetsShareVisible());assert.equal(await page.evaluate(()=>exportTest.shares.length),1);
    assert.equal(await page.locator('dialog[open]').count(),1);
    // Playwright evaluate itself supplies a gesture, so observe expiry inside
    // the delayed callback without another evaluate refreshing it.
    assert.equal(await page.evaluate(()=>{
      words.breeze.ko='changed after export snapshot';
      return new Promise(done=>setTimeout(()=>done(navigator.userActivation.isActive),5200));
    }),false);
    const recovered=await nextDownload(()=>submit.tap());assert.deepEqual(recovered,csv);
    assert.equal(await page.evaluate(()=>exportTest.clicks[0].active),true);
    await focusReturned();await page.evaluate(raw=>{words=JSON.parse(raw)},originalWords);
    record('pending/repeated taps: one share; explicit fresh gesture downloads the original snapshot');

    for(const mode of ['NotAllowedError','DataError','InvalidStateError','canShare-throws']){
      await reset(mode);count=downloads.length;await share();await opened();
      assert.equal(downloads.length,count);assert.match(await page.locator('#task-description').textContent(),/공유하지 못했어요/);
      assert.deepEqual(await nextDownload(()=>submit.tap()),csv);await focusReturned();
      record(`${mode}: explicit recovery download`);
    }
    for(const close of ['Escape','cancel','X']){
      await reset('AbortError');count=downloads.length;await share();await opened();
      assert.equal(downloads.length,count);assert.match(await page.locator('#task-description').textContent(),/공유를 마치지 않았어요/);
      assert.deepEqual(await page.evaluate(()=>exportTest.toasts),[]);
      if(close==='Escape')await page.keyboard.press('Escape');
      else await dialog.locator(close==='X'?'.task-close':'.task-actions [data-task-cancel]').tap();
      await focusReturned();assert.equal(downloads.length,count);record(`${close}: recovery cancellation never downloads`);
    }

    for(const failure of ['failURL','failClick']){
      await reset('unsupported');count=downloads.length;await page.evaluate(key=>{exportTest[key]=2},failure);
      await share();await opened();assert.equal(downloads.length,count);
      await submit.tap();await opened();assert.equal(downloads.length,count);
      assert.match(await page.locator('#task-description').textContent(),/다운로드를 시작하지 못했어요/);
      assert.equal(await button.isDisabled(),true);
      if(failure==='failClick')assert.equal(await page.evaluate(()=>exportTest.revoked.length),2);
      assert.deepEqual(await nextDownload(()=>submit.tap()),csv);await focusReturned();
      assert.equal(await page.locator('a[download="breeze_vocab.csv"]').count(),0);record(`${failure}: failed downloads clean up and wait for an explicit retry`);
    }

    // iOS owns its file/share UI. No browser dialog on native success, cancellation or failure.
    await reset('success');await page.evaluate(()=>{
      window.Capacitor={isNativePlatform:()=>true};window.nativeExports=[];
      window.webkit={messageHandlers:{breezeVocabularyExport:{postMessage:request=>nativeExports.push(request)}}};
    });
    for(const outcome of ['success','cancel','failure']){
      count=downloads.length;await share();assert.equal(await button.isDisabled(),true);
      assert.equal(await page.evaluate(()=>nativeExports.at(-1).csv),csv.toString('utf8'));
      await page.evaluate(()=>studySetsShareVisible());
      await page.evaluate(()=>window.dispatchEvent(new CustomEvent('breeze-vocabulary-export',{detail:{id:'wrong-id',error:''}})));
      assert.equal(await button.isDisabled(),true);
      await page.evaluate(outcome=>window.dispatchEvent(new CustomEvent('breeze-vocabulary-export',{detail:{id:nativeExports.at(-1).id,error:outcome==='failure'?'Synthetic native failure':''}})),outcome);
      await idle();assert.equal(downloads.length,count);assert.equal(await dialog.isVisible(),false);
    }
    assert.equal(await page.evaluate(()=>nativeExports.length),3);assert.equal(await page.evaluate(()=>exportTest.shares.length),0);
    assert.equal(await page.evaluate(()=>exportTest.toasts.length),1);
    await page.evaluate(()=>{delete window.webkit;delete window.Capacitor});record('iOS bridge: exact CSV, one request, matching completion, unchanged cancel/error behavior');

    await reset('unsupported');count=downloads.length;await page.evaluate(()=>{window.Capacitor={isNativePlatform:()=>true}});
    await share();await idle();assert.equal(downloads.length,count);assert.equal(await dialog.isVisible(),false);
    assert.equal(await page.evaluate(()=>exportTest.toasts.length),1);await page.evaluate(()=>{delete window.Capacitor});
    record('unsupported native shell: no web download fallback');

    await reset('AbortError');await share();await opened();
    for(const [width,height] of [[320,568],[390,844],[820,1180],[1440,900],[844,390],[390,300]])for(const dark of [false,true]){
      await page.setViewportSize({width,height});await page.evaluate(dark=>{darkMode=dark;applyDark()},dark);
      const bounds=await dialog.boundingBox();assert.ok(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=width+1&&bounds.y+bounds.height<=height+1);
      assert.equal(await dialog.evaluate(d=>d.scrollWidth<=d.clientWidth),true);
      for(const control of [submit,dialog.locator('.task-actions [data-task-cancel]'),dialog.locator('.task-close')]){
        const b=await control.boundingBox();assert.ok(b.width>=44&&b.height>=44);assert.ok(b.x>=bounds.x&&b.x+b.width<=bounds.x+bounds.width+1);
      }
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.screenshot({path:resolve(out,`${engine.name()}-${width}x${height}-${dark?'dark':'light'}.png`)});
    }
    await page.keyboard.press('Escape');await focusReturned();record('shared recovery dialog: light/dark phone, tablet, desktop, landscape and short viewport');
    await page.setViewportSize({width:390,height:844});
    await reset('AbortError');await share();await opened();
    assert.equal(await page.evaluate(()=>document.activeElement.hasAttribute('data-task-cancel')),true);
    await page.keyboard.press('Tab');assert.equal(await submit.evaluate(e=>e===document.activeElement),true);
    assert.deepEqual(await nextDownload(()=>page.keyboard.press('Enter')),csv);record('keyboard confirmation retains activation and restores focus');

    await reset('unsupported');await page.evaluate(()=>{words={}});count=downloads.length;
    await share();await idle();assert.equal(downloads.length,count);assert.deepEqual(await page.evaluate(()=>exportTest.toasts),['내보낼 단어가 없어요']);
    record('empty vocabulary: no download, button released');
    assert.deepEqual(errors,[]);reports.push({engine:engine.name(),version:browser.version(),checks,unexpectedErrors:errors,scope:'Desktop browser tests and simulated native/share responses; no Android or iOS device validation.'});
  }finally{await browser.close()}
}}finally{await new Promise(r=>server.close(r));writeFileSync(resolve(out,'results.json'),JSON.stringify(reports,null,2)+'\n')}
