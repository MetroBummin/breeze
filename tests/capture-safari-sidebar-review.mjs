/* Actual own-browser drawer comparison; no private/native Safari equivalence. */
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './helpers/bounded-playwright.mjs';
import {fixturePdf} from './helpers/pdf-scroll-fixture.mjs';
const root=(process.env.BREEZE_SIDEBAR_SOURCE_ROOT||fileURLToPath(new URL('../',import.meta.url))).replace(/\/$/,'')+'/';
const before=process.env.BREEZE_SIDEBAR_PHASE==='before',out=process.env.BREEZE_SIDEBAR_OUTPUT||'/tmp/breeze-sidebar-consistency-'+(before?'before':'after');mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{try{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}),cases=[],errors=[];
try{for(const [device,width,height] of [['phone',390,844],['ipad-portrait',820,1180],['ipad-landscape',1180,820]]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','"done"'));
 await page.goto(url);await page.evaluate(()=>homeReady);await page.locator('#fileinput').setInputFiles({name:'Optical review.pdf',mimeType:'application/pdf',buffer:fixturePdf(4)});await page.waitForFunction(()=>books.some(b=>b.kind==='pdf'));await page.evaluate(async()=>{await openBook(books.find(b=>b.kind==='pdf'));await switchReaderMode('original');});await page.waitForFunction(()=>!readerPositionPending());
 for(const dark of [false,true]){
  const theme=dark?'dark':'light';await page.evaluate(d=>{darkMode=d;applyDark();readerNotices.reset();expandReaderChrome();readerScrollTo(22);},dark);await page.waitForTimeout(400);await page.locator('#pdf-page-button').tap();await page.waitForFunction(()=>document.getElementById('pdf-page-button').getAttribute('aria-expanded')==='true');await page.waitForTimeout(300);
  const styles=await page.locator('.pdf-navigation-head>button').evaluateAll(nodes=>nodes.map(n=>{const s=getComputedStyle(n),r=n.getBoundingClientRect(),svg=n.querySelector('svg'),v=getComputedStyle(svg),b=svg.getBoundingClientRect();return {id:n.id,width:r.width,height:r.height,radius:s.borderRadius,background:s.backgroundColor,iconWidth:b.width,iconHeight:b.height,stroke:v.strokeWidth};}));
  assert.equal(styles.length,2);for(const s of styles){assert.equal(s.width,44);assert.equal(s.height,44);assert.equal(s.radius,'50%');}const [{id:first,...a},{id:second,...b}]=styles;
  if(before){assert.equal(a.iconWidth,22);assert.equal(a.stroke,'2px');assert.equal(b.iconWidth,24);assert.match(b.stroke,/3\.06667/);}
  else{assert.deepEqual(a,b,'sidebar peers retain identical geometry/material/icon weight');assert.equal(a.iconWidth,23);assert.equal(a.stroke,'2.6px');}
  await page.screenshot({path:`${out}/${device}-${theme}-sidebar.png`});const header=await page.locator('.pdf-navigation-head').boundingBox();await page.screenshot({path:`${out}/${device}-${theme}-header-crop.png`,clip:{x:0,y:Math.max(0,header.y-8),width:Math.ceil(header.x+header.width+8),height:Math.ceil(header.height+16)},scale:'device'});
  cases.push({device,theme,viewport:{width,height,dpr:2},scroll:await page.evaluate(()=>readerScrollTop()),styles});await page.locator('#pdf-navigation-toggle').tap();await page.waitForFunction(()=>!document.getElementById('pdf-page-control').classList.contains('pdf-navigation-closing'));
 }
 await context.close();
}assert.deepEqual(errors,[]);writeFileSync(`${out}/sidebar-geometry.json`,JSON.stringify({phase:before?'before':'after',privateReferencePixelsSeen:false,platform:'Actual Chromium touch renders; not native iOS',cases,errors},null,2)+'\n');console.log('Sidebar comparison passed: three viewports/both themes,44px circles, material and icon-weight checks');
}finally{await browser.close();server.close();}
