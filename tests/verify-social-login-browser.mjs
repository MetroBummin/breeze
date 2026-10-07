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
 for(const provider of ['apple','google']){
  const context=await browser.newContext({serviceWorkers:'block'}),requests=[];
  const user={id:'11111111-1111-4111-8111-111111111111',email:'reader@example.com',aud:'authenticated',role:'authenticated',app_metadata:{provider},user_metadata:{},created_at:'2026-10-07T00:00:00Z'};
  const token=[{alg:'HS256',typ:'JWT'},{sub:user.id,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600,iat:Math.floor(Date.now()/1000)},'test-signature'].map((part,index)=>index===2?part:Buffer.from(JSON.stringify(part)).toString('base64url')).join('.');
  await context.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','true'));
  await context.route('**/*',async route=>{
   const address=new URL(route.request().url());
   if(address.origin===origin){
    if(address.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:`window.BREEZE_CONFIG={SB_URL:${JSON.stringify(project)},SB_KEY:'existing-public-test-key'};`});
    return route.continue();
   }
   if(address.origin!==project)return route.abort();
   requests.push(address.pathname);
   if(address.pathname==='/auth/v1/settings')return route.fulfill({json:{external:{apple:true,google:true}}});
   if(address.pathname==='/auth/v1/authorize'){
    assert.equal(address.searchParams.get('provider'),provider);
    assert.equal(address.searchParams.get('redirect_to'),origin+'/');
    // Only the provider server is substituted. The bundled SDK, callback,
    // auth listener, persistent store and app reload below are real.
    return route.fulfill({status:302,headers:{location:origin+'/#access_token='+token+'&refresh_token=local-test-refresh&expires_in=3600&token_type=bearer'}});
   }
   if(address.pathname==='/auth/v1/user')return route.fulfill({json:user});
   if(address.pathname.startsWith('/rest/v1/'))return route.fulfill({json:[]});
   return route.abort();
  });
  const page=await context.newPage();await page.goto(origin);await page.evaluate(()=>homeReady);await page.evaluate(()=>openSettings());
  assert.equal(await page.locator('#sm-'+provider+'-login').isEnabled(),true);
  await page.locator('#sm-'+provider+'-login').click();
  await page.waitForFunction(()=>typeof sbUser!=='undefined'&&sbUser?.email==='reader@example.com');
  assert.equal(await page.evaluate(async()=>(await sb.auth.getSession()).data.session?.user.email),'reader@example.com');
  assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(key=>key.startsWith('sb-')&&key.endsWith('-auth-token'))),true);
  await page.reload();await page.evaluate(()=>homeReady);await page.waitForFunction(()=>typeof sbUser!=='undefined'&&sbUser?.email==='reader@example.com');
  await page.evaluate(()=>openSettings());assert.equal(await page.locator('.sm-account b').textContent(),'reader@example.com');
  assert.equal(await page.locator('#sm-'+provider+'-login').count(),0);
  assert.equal(requests.filter(path=>path==='/auth/v1/authorize').length,1);
  await context.close();
 }
 console.log('Apple/Google real bundled SDK: mocked provider consent, callback into app, session persistence and reload passed; no live provider authentication claimed');
}finally{await browser.close();await new Promise(done=>server.close(done));}
