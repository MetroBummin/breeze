import {chromium} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const cssRoot=new URL('../styles/',import.meta.url);
const css=['tokens.css','base.css','components.css','responsive.css','home-shell.css','surfaces.css'].map(file=>readFileSync(new URL(file,cssRoot),'utf8')).join('\n');
const source=readFileSync(new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
const browser=await chromium.launch();
const proof=process.env.BREEZE_AUTH_PROOF||'/tmp/breeze-email-login-proof';
mkdirSync(proof,{recursive:true});
const results=[];
try{
  for(const [name,width,height] of [['narrow',320,568],['phone',375,812],['tablet',820,1180],['desktop',1280,800],['short',896,414]]){
    for(const dark of [false,true]){
      const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',userAgent:name==='tablet'?'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36':undefined});
      const external=[];await page.route('**/*',route=>{external.push(route.request().url());route.abort();});
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.setContent(`<html class="${dark?'dark':''}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="${dark?'dark':''}"><button id="reopen" onclick="openSettings()">설정 열기</button><div id="settings-modal" class="on"><div id="set-card"><button id="set-close" class="task-close" onclick="closeSettings()">×</button><h2>설정</h2><div class="set-panel"><div id="sm-body"></div><div id="sm-status"></div></div></div></div><input id="recovery-fileinput" hidden><input id="reading-backup-input" hidden></body></html>`);
      await page.addScriptTag({content:`window.load=(_key,fallback)=>fallback;window.words={};window.dead={};window.esc=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;');window.closeSettings=()=>document.getElementById('settings-modal').classList.remove('on');window.openSettings=()=>{document.getElementById('settings-modal').classList.add('on');renderSyncModal();};${source}\nwindow.requests=[];sb={auth:{signInWithOtp:args=>new Promise(resolve=>window.requests.push({args,resolve}))}};renderSyncModal();`});
      assert.equal(await page.locator('#sm-apple-login').isDisabled(),true);
      assert.equal(await page.locator('#sm-password-login').evaluate(n=>n.getBoundingClientRect().height>=44),true);
      await page.screenshot({path:`${proof}/${name}-${dark?'dark':'light'}-choices.png`});
      await page.locator('#sm-email-login summary').focus();await page.keyboard.press('Enter');
      await page.locator('#sm-email').fill('reader@example.com');await page.locator('#sm-send-link').click();
      assert.equal(await page.locator('#sm-send-link').isDisabled(),true);
      await page.evaluate(()=>requests[0].resolve({error:null}));
      await page.locator('#sm-code').waitFor({state:'visible'});assert.equal(await page.locator('#sm-email').inputValue(),'reader@example.com');
      await page.locator('#set-close').click();await page.locator('#reopen').click();
      await page.locator('#sm-code').waitFor({state:'visible'});assert.equal(await page.locator('#sm-email').inputValue(),'reader@example.com');
      await page.getByRole('button',{name:'비밀번호 로그인',exact:true}).click();
      assert.equal(await page.locator('#sm-password-email').inputValue(),'reader@example.com');
      await page.getByRole('button',{name:'이메일 코드 로그인으로 돌아가기',exact:true}).click();
      await page.locator('#sm-code').waitFor({state:'visible'});
      await page.locator('#sm-code').fill('123456');
      await page.getByRole('button',{name:'코드로 로그인',exact:true}).scrollIntoViewIfNeeded();
      assert.equal(await page.locator('html').evaluate(node=>getComputedStyle(node).colorScheme),dark?'dark':'light');
      const overflow=await page.evaluate(()=>document.getElementById('set-card').scrollWidth>document.getElementById('set-card').clientWidth+1);
      assert.equal(overflow,false);assert.equal(await page.evaluate(()=>requests.length),1);assert.deepEqual(errors,[]);
      await page.screenshot({path:`${proof}/${name}-${dark?'dark':'light'}.png`,fullPage:true});
      results.push({viewport:name,theme:dark?'dark':'light',horizontalOverflow:overflow,requests:1,pageErrors:errors.length,externalRequests:external.length});
      await page.close();
    }
  }
}finally{await browser.close();}
console.log(JSON.stringify(results,null,2));
