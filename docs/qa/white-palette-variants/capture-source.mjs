import {chromium} from '/workspace/breeze/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root='/workspace/breeze',out='/tmp/breeze-white-variants';mkdirSync(out,{recursive:true});
const original=readFileSync(root+'/assets/brand/wordmark-light.svg','utf8');
const palettes={current:['#acece1','#a9d4ee'],A:['#75b9bd','#79aac8'],B:['#63acb5','#699bbc']};
for(const [variant,[teal,blue]] of Object.entries(palettes)){
 const svg=original.replace(/<linearGradient id="ink">.*?<\/linearGradient>/,`<linearGradient id="ink"><stop stop-color="${teal}"/><stop offset="${variant==='current'?'1':'.8'}" stop-color="${blue}"/>${variant==='current'?'':`<stop offset="1" stop-color="${blue}"/>`}</linearGradient>`);
 assert.equal(svg.match(/<path[^>]+/)[0],original.match(/<path[^>]+/)[0]);writeFileSync(`${out}/white-${variant}.svg`,svg);
}
const server=createServer((req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;
 const file=path.startsWith('/white-preview/')?out+'/'+path.split('/').pop():resolve(root,'.'+path.replace(/^\/$/,'/index.html'));
 res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2','.png':'image/png'})[extname(file)]||'application/octet-stream');res.end(readFileSync(file));
}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
try{for(const variant of Object.keys(palettes)){
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());const page=await context.newPage();
 await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(()=>document.fonts.ready);
 await page.addStyleTag({content:`.breeze-wordmark{background-image:url('${url}white-preview/white-${variant}.svg')!important;}`});
 await page.evaluate(async()=>{const node=document.querySelector('#onboard-welcome .breeze-wordmark');await new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=reject;i.src=getComputedStyle(node).backgroundImage.slice(5,-2);});});
 await page.screenshot({path:`${out}/white-${variant}-welcome.png`});await page.evaluate(()=>endOnboarding(true));await page.evaluate(()=>show('home'));
 await page.screenshot({path:`${out}/white-${variant}-home.png`});
 const box=await page.locator('#logo .breeze-wordmark').boundingBox();assert.ok(Math.abs(box.width/box.height-841/258)<.03);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await context.close();
}
 const compareContext=await browser.newContext({viewport:{width:1230,height:924},reducedMotion:'reduce',serviceWorkers:'block'});
 await compareContext.route('**/*',r=>r.request().url().startsWith(url)?r.continue():r.abort());
 const compare=await compareContext.newPage();
 await compare.setContent(`<style>html,body{margin:0;background:#e8eae9;font:16px system-ui;color:#202522;}main{display:flex;gap:12px;padding:12px;}section{width:390px;}h2{font-size:16px;margin:8px 0 12px;}img{display:block;width:390px;height:844px;}</style><main>${Object.entries(palettes).map(([name,colors])=>`<section><h2>${name==='current'?'현재':name} · ${colors.join(' → ')}</h2><img alt="실제 독립 브라우저 캡처" src="${url}white-preview/white-${name}-welcome.png"></section>`).join('')}</main>`);
 await compare.evaluate(()=>Promise.all([...document.images].map(i=>i.decode())));
 await compare.screenshot({path:`${out}/white-onboarding-comparison.png`});await compareContext.close();
 console.log(JSON.stringify({palettes,out,geometry:'identical original r; not selected',application:'actual production UI, preview-only SVG substitution; dark unchanged'}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
