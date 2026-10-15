import {chromium,webkit} from 'playwright';
import {createServer} from 'node:http';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
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
      await page.addScriptTag({content:`window.load=(_key,fallback)=>fallback;window.words={};window.dead={};window.esc=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;');window.closeSettings=()=>document.getElementById('settings-modal').classList.remove('on');window.openSettings=()=>{document.getElementById('settings-modal').classList.add('on');renderSyncModal();};${source}\nwindow.requests=[];window.verified=[];sb={auth:{signInWithOtp:args=>new Promise(resolve=>window.requests.push({args,resolve})),verifyOtp:async args=>{window.verified.push(args);return {error:null};}}};renderSyncModal();`});
      assert.equal(await page.locator('#sm-apple-login').isDisabled(),true);
      assert.equal(await page.locator('#sm-google-login').isDisabled(),true);
      await page.evaluate(()=>{sb.auth.signInWithOAuth=()=>{throw new Error('Consent is outside artwork review');};renderSyncModal();});
      await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('.settings-signin-choices img')].map(img=>img.decode()));});
      assert.equal(await page.getByRole('button',{name:'Apple로 로그인',exact:true}).count(),1);
      assert.equal(await page.getByRole('button',{name:'Google로 로그인',exact:true}).count(),1);
      const artwork=await page.evaluate(()=>{
        const g=document.getElementById('sm-google-login'),a=document.getElementById('sm-apple-login');
        const logo=g.querySelector('img'),mark=a.querySelector('svg'),style=getComputedStyle(g);
        const lr=logo.getBoundingClientRect(),mr=mark.getBoundingClientRect();
        const label=g.querySelector('span').getBoundingClientRect(),gr=g.getBoundingClientRect();
        const primary=getComputedStyle(document.getElementById('sm-send-link'));
        return {logo:[Math.round(lr.width),Math.round(lr.height)],mark:[Math.round(mr.width),Math.round(mr.height)],
          font:style.fontSize,weight:style.fontWeight,gap:style.gap,fill:style.backgroundColor,border:style.borderTopWidth,color:style.color,
          radius:style.borderRadius,height:Math.round(gr.height),pair:Math.abs((lr.left+label.right)/2-(gr.left+gr.right)/2)<2,
          primaryFill:primary.backgroundColor,primaryColor:primary.color,primaryHeight:Math.round(parseFloat(primary.height))};
      });
      assert.deepEqual(artwork.logo,[18,18]);
      assert.deepEqual(artwork.mark,[16,19]);
      assert.equal(artwork.font,'17px');assert.equal(artwork.weight,'500');assert.equal(artwork.gap,'10px');assert.equal(artwork.pair,true);
      assert.equal(artwork.fill,'rgba(0, 0, 0, 0)');assert.equal(artwork.border,'1px');assert.equal(artwork.height,58);assert.equal(artwork.radius,'999px');
      assert.equal(artwork.color,dark?'rgb(255, 255, 255)':'rgb(13, 13, 13)');
      assert.equal(artwork.primaryFill,dark?'rgb(255, 255, 255)':'rgb(13, 13, 13)');
      assert.equal(artwork.primaryColor,dark?'rgb(13, 13, 13)':'rgb(255, 255, 255)');
      assert.equal(artwork.primaryHeight,58);
      await page.locator('#sm-google-login').focus();
      assert.equal(await page.locator('#sm-google-login').evaluate(n=>getComputedStyle(n).outlineStyle),'solid');
      await page.locator('#sm-google-login').blur();
      const apple=await page.locator('#sm-apple-login').boundingBox(),google=await page.locator('#sm-google-login').boundingBox();
      assert.ok(google.y<apple.y && google.height===58 && apple.height===58 && Math.abs(google.width-apple.width)<1);
      assert.equal(await page.locator('#sm-password-login').evaluate(n=>n.getBoundingClientRect().height>=44),true);
      assert.equal(await page.locator('#sm-email-login summary').count(),0);
      assert.equal(await page.locator('#sm-send-link').innerText(),'인증 코드 받기');
      assert.equal(await page.locator('.bz-legal a').nth(0).getAttribute('href'),'https://breeze.io.kr/docs/terms.html');
      assert.equal(await page.locator('.bz-legal a').nth(1).getAttribute('href'),'https://breeze.io.kr/docs/privacy.html');
      const choiceShot=await page.screenshot({path:`${proof}/${name}-${dark?'dark':'light'}-choices.png`});
      if(process.env.BREEZE_AUTH_INLINE_PROOF==='1' && ['phone','tablet'].includes(name))console.log('SCREENSHOT_JSON '+JSON.stringify({name:`${name}-${dark?'dark':'light'}`,base64:choiceShot.toString('base64')}));
      await page.locator('#sm-email').fill('reader@example.com');await page.locator('#sm-send-link').click();
      assert.equal(await page.locator('#sm-send-link').isDisabled(),true);
      await page.evaluate(()=>requests[0].resolve({error:null}));
      await page.locator('#sm-code-0').waitFor({state:'visible'});assert.equal(await page.locator('#sm-email').inputValue(),'reader@example.com');
      await page.locator('#set-close').click();await page.locator('#reopen').click();
      await page.locator('#sm-code-0').waitFor({state:'visible'});assert.equal(await page.locator('#sm-email').inputValue(),'reader@example.com');
      await page.getByRole('button',{name:'비밀번호 로그인',exact:true}).click();
      assert.equal(await page.locator('#sm-password-email').inputValue(),'reader@example.com');
      await page.getByRole('button',{name:'이메일 코드 로그인으로 돌아가기',exact:true}).click();
      await page.locator('#sm-code-0').waitFor({state:'visible'});
      assert.match(await page.locator('#sm-code-sent').innerText(),/코드를 보냈어요: reader@example.com/);
      assert.match(await page.locator('#sm-send-link').innerText(),/다시 보내기/);
      assert.equal(await page.locator('.bz-otp-box').count(),6);
      assert.equal(await page.locator('#sm-body').innerText().then(text=>text.includes('링크')),false);
      await page.locator('#sm-code-0').fill('123456');
      await page.waitForFunction(()=>window.verified.length===1);
      assert.deepEqual(await page.evaluate(()=>window.verified[0]),{email:'reader@example.com',token:'123456',type:'email'});
      await page.getByRole('button',{name:'이메일 변경',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'sm-email');
      if(name==='phone') await page.locator('#set-card').screenshot({path:`${proof}/${name}-${dark?'dark':'light'}-code.png`});
      assert.equal(await page.locator('html').evaluate(node=>getComputedStyle(node).colorScheme),dark?'dark':'light');
      const overflow=await page.evaluate(()=>document.getElementById('set-card').scrollWidth>document.getElementById('set-card').clientWidth+1);
      assert.equal(overflow,false);assert.equal(await page.evaluate(()=>requests.length),1);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
      await page.screenshot({path:`${proof}/${name}-${dark?'dark':'light'}.png`,fullPage:true});
      results.push({viewport:name,theme:dark?'dark':'light',horizontalOverflow:overflow,requests:1,pageErrors:errors.length,externalRequests:external.length});
      await page.close();
    }
  }
  results.push(...await webBuild(browser,proof));
}finally{await browser.close();}

async function webBuild(browser,proof){
  const root=resolve(new URL('..',import.meta.url).pathname);
  const server=createServer((req,res)=>{
    const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
    if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
    try{
      const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.ttf':'font/ttf','.json':'application/json','.webmanifest':'application/manifest+json'}[extname(path)]||'application/octet-stream';
      res.setHeader('Content-Type',type);res.end(readFileSync(path));
    }catch{res.writeHead(404).end();}
  });
  await new Promise(done=>server.listen(0,'127.0.0.1',done));
  const origin=`http://127.0.0.1:${server.address().port}`,out=[];
  try{
    for(const dark of [false,true]){
      const context=await browser.newContext({serviceWorkers:'block',viewport:{width:390,height:844},deviceScaleFactor:2,reducedMotion:'reduce'});
      await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
      const page=await context.newPage(),errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin===origin) return route.continue();
        return route.abort();
      });
      await page.goto(origin,{waitUntil:'domcontentloaded'});
      await page.evaluate(()=>homeReady);
      await page.evaluate(dark=>{
        if(dark&&!document.body.classList.contains('dark')) toggleDark();
        window.__otp=[];window.__verified=[];
        sb.auth.signInWithOtp=args=>new Promise(resolve=>{window.__otp.push(args);window.__otpDone=resolve;});
        sb.auth.verifyOtp=async args=>{window.__verified.push(args);return {error:null};};
        openSettings();
      },dark);
      await page.locator('#sm-send-link').waitFor();
      assert.equal(await page.locator('#sm-send-link').evaluate(n=>getComputedStyle(n).backgroundColor),dark?'rgb(255, 255, 255)':'rgb(13, 13, 13)');
      assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('dark')),dark);
      assert.equal(await page.locator('#sm-send-link').innerText(),'인증 코드 받기');
      assert.equal(await page.locator('.bz-or').innerText(),'또는');
      assert.equal(await page.locator('#sm-email-login summary').count(),0);
      const sheet=page.locator('.bz-auth');
      const theme=dark?'dark':'light';
      const align=await page.evaluate(()=>{
        const input=document.getElementById('sm-email'),label=input.nextElementSibling,box=input.getBoundingClientRect(),text=label.getBoundingClientRect();
        const inputStyle=getComputedStyle(input),labelStyle=getComputedStyle(label);
        return {padTop:parseFloat(inputStyle.paddingTop),padBottom:parseFloat(inputStyle.paddingBottom),
          textLeft:box.left+parseFloat(inputStyle.paddingLeft),labelLeft:text.left+parseFloat(labelStyle.paddingLeft),
          inputMid:box.top+box.height/2,labelMid:text.top+text.height/2,inputTop:box.top};
      });
      assert.equal(align.padTop,align.padBottom);
      assert.ok(Math.abs(align.textLeft-align.labelLeft)<2,JSON.stringify(align));
      assert.ok(Math.abs(align.inputMid-align.labelMid)<2,JSON.stringify(align));
      await sheet.screenshot({path:`${proof}/email-empty-${theme}.png`});
      await page.locator('#sm-email').fill('reader@example.com');
      const filled=await page.evaluate(()=>{
        const input=document.getElementById('sm-email'),label=input.nextElementSibling,box=input.getBoundingClientRect(),text=label.getBoundingClientRect();
        const inputStyle=getComputedStyle(input),labelStyle=getComputedStyle(label);
        return {textLeft:box.left+parseFloat(inputStyle.paddingLeft),labelLeft:text.left+parseFloat(labelStyle.paddingLeft),inputTop:box.top,labelMid:text.top+text.height/2};
      });
      assert.ok(Math.abs(filled.textLeft-filled.labelLeft)<2,JSON.stringify(filled));
      assert.ok(Math.abs(filled.labelMid-filled.inputTop)<3,JSON.stringify(filled));
      await sheet.screenshot({path:`${proof}/email-filled-${theme}.png`});
      await page.locator('#sm-send-link').click();
      await page.evaluate(()=>__otpDone({error:null}));
      await page.locator('#sm-code-0').waitFor({state:'visible'});
      assert.match(await page.locator('#sm-code-sent').innerText(),/코드를 보냈어요: reader@example.com/);
      assert.match(await page.locator('#sm-send-link').innerText(),/다시 보내기/);
      for(const [index,digit] of ['1','2','3'].entries()) await page.locator('#sm-code-'+index).fill(digit);
      assert.equal(await page.locator('.bz-otp-box').evaluateAll(nodes=>nodes.map(node=>node.value).join('')),'123');
      await sheet.screenshot({path:`${proof}/code-partial-${theme}.png`});
      await page.locator('#sm-code-0').fill('123456');
      await page.waitForFunction(()=>window.__verified&&window.__verified.length===1);
      assert.equal(await page.evaluate(()=>__verified[0].token),'123456');
      assert.equal(await page.evaluate(()=>__verified[0].type),'email');
      await sheet.screenshot({path:`${proof}/code-full-${theme}.png`});
      await page.getByRole('button',{name:'이메일 변경',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.activeElement&&document.activeElement.id),'sm-email');
      assert.equal((await page.locator('#sm-body').innerText()).includes('링크'),false);
      assert.equal(errors.filter(message=>!/ResizeObserver/.test(message)).length,0,errors.join('\n'));
      out.push({viewport:'web',theme:dark?'dark':'light',verified:1,pageErrors:errors.length});
      await context.close();
    }
  }finally{await new Promise(done=>server.close(done));}
  return out;
}
console.log(JSON.stringify(results,null,2));
