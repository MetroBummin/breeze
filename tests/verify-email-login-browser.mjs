import {chromium,webkit} from 'playwright';
import {readFileSync,mkdirSync} from 'node:fs';
import assert from 'node:assert/strict';
const cssRoot=new URL('../styles/',import.meta.url);
const css=['tokens.css','base.css','components.css','responsive.css','home-shell.css','surfaces.css'].map(file=>readFileSync(new URL(file,cssRoot),'utf8')).join('\n');
const source=readFileSync(new URL('../scripts/sync/sync.js',import.meta.url),'utf8');
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch();
const proof=process.env.BREEZE_AUTH_PROOF||'/tmp/breeze-email-login-proof';
mkdirSync(proof,{recursive:true});
const results=[];
try{
  for(const [name,width,height] of [['narrow',320,568],['phone',375,812],['tablet',820,1180],['desktop',1280,800],['short',896,414]]){
    for(const dark of [false,true]){
      const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce',userAgent:name==='tablet'?'Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36':undefined});
      const external=[];await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin==='http://breeze-auth.test' && /^\/assets\/[a-zA-Z0-9/_.-]+$/.test(url.pathname)){
          const body=readFileSync(new URL('..'+url.pathname,import.meta.url));
          return route.fulfill({body,contentType:url.pathname.endsWith('.png')?'image/png':'font/ttf'});
        }
        external.push(url.href);return route.abort();
      });
      const errors=[];page.on('pageerror',error=>errors.push(error.message));
      await page.setContent(`<html class="${dark?'dark':''}"><head><base href="http://breeze-auth.test/"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}</style></head><body class="${dark?'dark':''}"><button id="reopen" onclick="openSettings()">설정 열기</button><div id="settings-modal" class="on"><div id="set-card"><button id="set-close" class="task-close" onclick="closeSettings()">×</button><h2>설정</h2><div class="set-panel"><div id="sm-body"></div><div id="sm-status"></div></div></div></div><input id="recovery-fileinput" hidden><input id="reading-backup-input" hidden></body></html>`);
      await page.addScriptTag({content:`window.load=(_key,fallback)=>fallback;window.words={};window.dead={};window.esc=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;');window.closeSettings=()=>document.getElementById('settings-modal').classList.remove('on');window.openSettings=()=>{document.getElementById('settings-modal').classList.add('on');renderSyncModal();};${source}\nwindow.requests=[];sb={auth:{signInWithOtp:args=>new Promise(resolve=>window.requests.push({args,resolve}))}};renderSyncModal();`});
      assert.equal(await page.locator('#sm-apple-login').isDisabled(),true);
      assert.equal(await page.locator('#sm-google-login').isDisabled(),true);
      await page.evaluate(()=>{sb.auth.signInWithOAuth=()=>{throw new Error('Consent is outside artwork review');};renderSyncModal();});
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.settings-signin-choices img')].map(img=>img.decode()));});
      assert.equal(await page.getByRole('button',{name:'Apple로 로그인',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'Google로 로그인',exact:true}).count(),1);
      const artwork=await page.evaluate(()=>{
        const a=document.querySelector('body.dark .settings-apple-art.dark,body:not(.dark) .settings-apple-art.light');
        const g=document.querySelector('.settings-google-signin'),logo=g.querySelector('img'),style=getComputedStyle(g);
        const ar=a.getBoundingClientRect(),lr=logo.getBoundingClientRect();
        return {appleRatio:ar.width/ar.height,appleNatural:[a.naturalWidth,a.naturalHeight],logo:[lr.width,lr.height],logoFit:getComputedStyle(logo).objectFit,font:style.fontSize,line:style.lineHeight,gap:style.gap,fill:style.backgroundColor,stroke:style.borderColor,color:style.color,fontLoaded:document.fonts.check('500 14px "Breeze Google Sign-in"','Google')};
      });
      assert.ok(Math.abs(artwork.appleRatio-250/48)<0.01);
      assert.deepEqual(artwork.logo,[20,20]);assert.equal(artwork.logoFit,'contain');assert.equal(artwork.font,'14px');assert.equal(artwork.line,'20px');assert.equal(artwork.gap,'10px');assert.equal(artwork.fontLoaded,true);
      assert.equal(artwork.fill,dark?'rgb(19, 19, 20)':'rgb(255, 255, 255)');
      assert.equal(artwork.stroke,dark?'rgb(142, 145, 143)':'rgb(116, 119, 117)');
      assert.equal(artwork.color,dark?'rgb(227, 227, 227)':'rgb(31, 31, 31)');
      await page.locator('#sm-google-login').focus();
      assert.equal(await page.locator('#sm-google-login').evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
      await page.locator('#sm-google-login').blur();
      const apple=await page.locator('#sm-apple-login').boundingBox(),google=await page.locator('#sm-google-login').boundingBox();
      assert.ok(google.y>apple.y && google.height===48 && apple.height===48 && Math.abs(google.width-apple.width)<1);
      assert.equal(await page.locator('#sm-password-login').evaluate(n=>n.getBoundingClientRect().height>=44),true);
      const choiceShot=await page.screenshot({path:`${proof}/${name}-${dark?'dark':'light'}-choices.png`});
      if(process.env.BREEZE_AUTH_INLINE_PROOF==='1' && ['phone','tablet'].includes(name))console.log('SCREENSHOT_JSON '+JSON.stringify({name:`${name}-${dark?'dark':'light'}`,base64:choiceShot.toString('base64')}));
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
      assert.equal(overflow,false);assert.equal(await page.evaluate(()=>requests.length),1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      await page.screenshot({path:`${proof}/${name}-${dark?'dark':'light'}.png`,fullPage:true});
      results.push({viewport:name,theme:dark?'dark':'light',horizontalOverflow:overflow,requests:1,pageErrors:errors.length,externalRequests:external.length});
      await page.close();
    }
  }
}finally{await browser.close();}
console.log(JSON.stringify(results,null,2));
