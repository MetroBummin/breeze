import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve(new URL('..',import.meta.url).pathname);
const server=createServer((req,res)=>{
 const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
 if(!path.startsWith(root+'/')){res.writeHead(403).end();return;}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const origin=`http://127.0.0.1:${server.address().port}`,project='https://onboarding-test.supabase.co';
const browser=await (process.env.BROWSER==='webkit'?webkit:chromium).launch(process.env.BREEZE_CHROMIUM?{executablePath:process.env.BREEZE_CHROMIUM}:{});
try{
 for(const provider of ['apple','google'])for(const native of [false,true]){
  const context=await browser.newContext({serviceWorkers:'block'}),requests=[],nativeStarts=[];
  const user={id:'11111111-1111-4111-8111-111111111111',email:'reader@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider},user_metadata:{},created_at:'2026-10-07T00:00:00Z'};
  const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)},'test-signature'].map((part,index)=>index===2?part:Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  if(native){
   await context.addInitScript(({token})=>{
    window.Capacitor={isNativePlatform:()=>true,getPlatform:()=>'ios'};
    Object.defineProperty(window,'webkit',{configurable:true,value:{messageHandlers:{breezeAuth:{postMessage:async message=>{
     if(message.action==='cancel')return Promise.resolve(true);
     // Only OS consent is substituted; SDK callback acceptance/storage are real.
     sessionStorage.setItem('__qaNativeStart',JSON.stringify(message));
     if(message.action==='apple'){
      if(window.__qaNativeMode==='cancel')throw Error('로그인을 취소했어요.');
      if(window.__qaNativeMode==='error')throw Error('OS authorization failed');
      if(window.__qaNativeMode==='holdOS')await new Promise(resolve=>window.__qaReleaseOS=resolve);
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(message.nonce));
      const hashed=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
      const payload={iss:'https://appleid.apple.com',aud:'kr.io.breeze.app',sub:'existing-apple-subject',nonce:hashed,exp:Math.floor(Date.now()/1000)+600};
      const identityToken='header.'+btoa(JSON.stringify(payload)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_')+'.fixture-signature';
      return {request:message.request,nonce:message.nonce,identityToken};
     }
     return Promise.resolve('kr.io.breeze.app://auth/callback?request='+message.request+'#access_token='+token+'&refresh_token=local-test-refresh&expires_in=3600&token_type=bearer');
    }}}}});
   },{token});
  }
  // The combined guide persists its existing completed marker as JSON "done".
  // Keep auth fixtures outside an active guide, matching a returning reader.
  await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await context.route('**/*',async route=>{
   const address=new URL(route.request().url());
   if(address.origin===origin){
    if(address.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:`window.BREEZE_CONFIG={SB_URL:${JSON.stringify(project)},SB_KEY:'existing-public-test-key'};`});
    return route.continue();
   }
   if(address.origin!==project)return route.abort();
   // The real PostgREST SDK sends profile headers; WebKit enforces their CORS
   // allowance even for intercepted local provider responses.
   const headers={'access-control-allow-origin':origin,
    'access-control-allow-headers':route.request().headers()['access-control-request-headers']||'apikey,authorization,x-client-info,content-type,prefer,accept-profile,content-profile',
    'access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS'};
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
   requests.push(address.pathname);
   if(address.pathname==='/auth/v1/settings')return route.fulfill({headers,json:{external:{apple:true,google:true}}});
   if(address.pathname==='/auth/v1/authorize'){
    assert.equal(address.searchParams.get('provider'),provider);
    assert.equal(address.searchParams.get('redirect_to'),origin+'/');
    // Only the provider server is substituted. The bundled SDK, callback,
    // auth listener, persistent store and app reload below are real.
    const callback=origin+'/#access_token='+token+'&refresh_token=local-test-refresh&expires_in=3600&token_type=bearer';
    // WebKit cannot synthesize an HTTP redirect with route.fulfill. A provider
    // page navigation exercises the same real app callback on both engines.
    return route.fulfill({contentType:'text/html',body:'<!doctype html><script>location.replace('+JSON.stringify(callback)+')</script>'});
   }
   if(address.pathname==='/auth/v1/token'&&address.searchParams.get('grant_type')==='id_token'){
    const body=route.request().postDataJSON();assert.equal(provider,'apple');assert.equal(native,true);assert.equal(body.provider,'apple');assert.match(body.nonce,/^[a-f0-9]{64}$/);
    const claims=JSON.parse(Buffer.from(body.id_token.split('.')[1],'base64url'));
    const {createHash}=await import('node:crypto');assert.equal(claims.nonce,createHash('sha256').update(body.nonce).digest('hex'));assert.equal(claims.aud,'kr.io.breeze.app');
    return route.fulfill({headers,json:{access_token:token,refresh_token:'local-test-refresh',expires_in:3600,token_type:'bearer',user}});
   }
   if(address.pathname==='/auth/v1/user')return route.fulfill({headers,json:user});
   if(address.pathname.startsWith('/rest/v1/'))return route.fulfill({headers,json:[]});
   return route.abort();
  });
  const page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));await page.goto(origin);await page.evaluate(()=>homeReady);
  await page.evaluate(()=>openSettings());
  // Mac WebKit can report the button stable while its sheet still translates.
  // The recorded down/up targets crossed from Apple artwork to the email form.
  // Wait for the actual opening transform, retaining real animation and input.
  await page.waitForFunction(()=>{
    const transform=getComputedStyle(document.getElementById('set-card')).transform;
    return transform==='none'||new DOMMatrixReadOnly(transform).m42===0;
  });
  assert.equal(await page.locator('#sm-'+provider+'-login').isEnabled(),true);
  await page.locator('#sm-'+provider+'-login').click();
  try{await page.waitForFunction(()=>typeof sbUser!=='undefined'&&sbUser?.email==='reader@example.com');}
  catch(error){console.error({provider,native,pageErrors,requests,status:await page.locator('#sm-status').textContent(),url:page.url().split('#')[0],state:await page.evaluate(()=>({operation:!!socialLoginOperation,aborted:socialLoginOperation?.controller.signal.aborted,epoch:syncSessionEpoch,operationEpoch:socialLoginOperation?.epoch,callbackRecorded:!!sessionStorage.getItem('__qaNativeStart'),user:!!sbUser}))});throw error;}
  const session=await page.evaluate(async()=>(await sb.auth.getSession()).data.session);
  assert.equal(session?.user.email,'reader@example.com');assert.equal(session?.user.id,user.id);
  assert.equal(new URL(page.url()).searchParams.has('breeze_auth_return'),false);
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'))),true);
  // Auth acceptance starts the real wordbook sync. Wait for its actual owner
  // before a deliberate reload, so WebKit does not abort an intercepted REST
  // response mid-navigation and report a synthetic access-control page error.
  await page.waitForFunction(()=>!remoteSyncPromise&&!syncPromise);
  assert.deepEqual(pageErrors,[],'No errors before deliberate reload');
  await page.reload();await page.evaluate(()=>homeReady);await page.waitForFunction(()=>typeof sbUser!=='undefined'&&sbUser?.email==='reader@example.com');
  await page.waitForFunction(()=>!remoteSyncPromise&&!syncPromise);
  await page.evaluate(()=>openSettings());assert.equal(await page.locator('.sm-account b').textContent(),'reader@example.com');
  assert.equal(await page.evaluate(()=>sbUser.id),user.id);
  if(pageErrors.length)console.error({provider,native,pageErrors,requests});
  assert.deepEqual(pageErrors,[]);
  assert.equal(await page.locator('#sm-'+provider+'-login').count(),0);
  assert.equal(requests.filter(path=>path==='/auth/v1/authorize').length,native?0:1);
  if(native){
   const message=await page.evaluate(()=>JSON.parse(sessionStorage.getItem('__qaNativeStart')));
   if(provider==='apple'){assert.equal(message.action,'apple');assert.match(message.nonce,/^[a-f0-9]{64}$/);assert.equal(message.url,undefined);assert.equal(requests.filter(path=>path==='/auth/v1/token').length,1);}
   else {assert.equal(message.action,'start');const url=new URL(message.url);
   assert.equal(url.origin,project);assert.equal(url.pathname,'/auth/v1/authorize');assert.equal(url.searchParams.get('provider'),provider);
   assert.match(message.request,/^[0-9a-f-]{36}$/i);
   assert.equal(url.searchParams.get('redirect_to'),'kr.io.breeze.app://auth/callback?request='+message.request);}
   nativeStarts.push(message);
  }
  assert.equal(nativeStarts.length,native?1:0);
  if(native&&provider==='apple'){
   const initialWords=await page.evaluate(()=>JSON.stringify(words));
   const loggedOut=async()=>{
    await page.evaluate(()=>sbLogout());
    await page.waitForFunction(()=>sbUser===null);
    assert.equal(await page.evaluate(async()=>(await sb.auth.getSession()).data.session),null);
   };
   await loggedOut();
   await page.evaluate(()=>sbAppleLogin());await page.waitForFunction(()=>sbUser?.id==='11111111-1111-4111-8111-111111111111');
   await page.waitForFunction(()=>!remoteSyncPromise&&!syncPromise);
   assert.equal(await page.evaluate(()=>JSON.stringify(words)),initialWords,'Existing wordbook survives logout and native relogin');
   await loggedOut();
   for(const mode of ['cancel','error','holdOS','network','json','storage']){
    await page.evaluate(mode=>{
     window.__qaNativeMode=mode;window.__qaReleaseOS=null;window.__qaReleaseExchange=null;
     if(mode==='storage'){
      const original=sb.auth._saveSession.bind(sb.auth);
      sb.auth._saveSession=async session=>{
       sb.auth._saveSession=original;
       await new Promise(resolve=>window.__qaReleaseExchange=resolve);
       return original(session);
      };
     }
     if(mode==='network'||mode==='json'){
      const original=window.fetch;
      window.fetch=async(input,options)=>{
       if(!String(input).includes('/auth/v1/token?grant_type=id_token'))return original(input,options);
       window.fetch=original;
       if(mode==='network')await new Promise(resolve=>window.__qaReleaseExchange=resolve);
       const response=await original(input,options);
       if(mode!=='json')return response;
       return new Proxy(response,{get(target,key){
        if(key==='json')return async()=>{await new Promise(resolve=>window.__qaReleaseExchange=resolve);return target.json();};
        const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
       }});
      };
     }
     window.__qaLoginDone=false;sbAppleLogin().finally(()=>window.__qaLoginDone=true);
    },mode);
    if(mode==='cancel'||mode==='error'){
     await page.waitForFunction(()=>window.__qaLoginDone);assert.match(await page.locator('#sm-status').textContent(),mode==='cancel'?/취소/:/연결하지 못했/);
    }else{
     await page.waitForFunction(()=>!!(window.__qaReleaseOS||window.__qaReleaseExchange));
     await page.evaluate(()=>cancelSocialLogin());await page.waitForFunction(()=>window.__qaLoginDone);
     await page.evaluate(()=>{window.__qaReleaseOS?.();window.__qaReleaseExchange?.();});
     // Let the real SDK's delayed completion attempt its final write.
     await page.waitForTimeout(120);
    }
    assert.equal(await page.evaluate(()=>sbUser),null,mode+': no late account accepted');
    assert.equal(await page.evaluate(async()=>(await sb.auth.getSession()).data.session),null,mode+': no late session persisted');
    assert.equal(await page.locator('#sm-apple-login').isEnabled(),true);
    assert.equal(await page.evaluate(()=>JSON.stringify(words)),initialWords,mode+': wordbook unchanged');
   }
   await page.evaluate(()=>{window.__qaNativeMode='';return sbAppleLogin();});
   await page.waitForFunction(()=>sbUser?.id==='11111111-1111-4111-8111-111111111111');
   await page.waitForFunction(()=>!remoteSyncPromise&&!syncPromise);
   assert.equal(await page.evaluate(()=>JSON.stringify(words)),initialWords);
  }
  await context.close();
 }
 console.log('Apple/Google web and simulated iOS bridge with real bundled SDK: mocked consent, bound callback, native Apple ID token/raw nonce, existing user ID, session persistence and reload passed; no live provider or native OS consent claimed');
}finally{await browser.close();await new Promise(done=>server.close(done));}
