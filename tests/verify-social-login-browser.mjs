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
    Object.defineProperty(window,'webkit',{configurable:true,value:{messageHandlers:{breezeAuth:{postMessage:message=>{
     if(message.action==='cancel')return Promise.resolve(true);
     // Only OS consent is substituted; SDK callback acceptance/storage are real.
     sessionStorage.setItem('__qaNativeStart',JSON.stringify(message));
     return Promise.resolve('kr.io.breeze.app://auth/callback?request='+message.request+'#access_token='+token+'&refresh_token=local-test-refresh&expires_in=3600&token_type=bearer');
    }}}}});
   },{token});
  }
  await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','true'));
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
   if(address.pathname==='/auth/v1/user')return route.fulfill({headers,json:user});
   if(address.pathname.startsWith('/rest/v1/'))return route.fulfill({headers,json:[]});
   return route.abort();
  });
  const page=await context.newPage(),pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));await page.goto(origin);await page.evaluate(()=>homeReady);await page.evaluate(()=>openSettings());
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
   assert.equal(message.action,'start');const url=new URL(message.url);
   assert.equal(url.origin,project);assert.equal(url.pathname,'/auth/v1/authorize');assert.equal(url.searchParams.get('provider'),provider);
   assert.match(message.request,/^[0-9a-f-]{36}$/i);
   assert.equal(url.searchParams.get('redirect_to'),'kr.io.breeze.app://auth/callback?request='+message.request);
   nativeStarts.push(message);
  }
  assert.equal(nativeStarts.length,native?1:0);
  await context.close();
 }
 console.log('Apple/Google web and simulated iOS bridge with real bundled SDK: mocked consent, bound callback, session persistence and reload passed; no live provider or native OS consent claimed');
}finally{await browser.close();await new Promise(done=>server.close(done));}
