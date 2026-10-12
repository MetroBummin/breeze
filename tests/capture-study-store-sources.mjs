// Source renders for the store-design owner; not a native Simulator capture.
import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../',import.meta.url)),out=process.env.BREEZE_STORE_SOURCE_OUTPUT||'/tmp/breeze-study-store-sources';mkdirSync(out,{recursive:true});
const server=createServer((req,res)=>{const p=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));try{if(!p.startsWith(root))throw Error();res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml'})[extname(p)]||'application/octet-stream');res.end(readFileSync(p));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${server.address().port}/`,browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE}),files=[];
try{for(const [device,width,height,dpr] of [['iphone-69',440,956,3],['ipad-13',1032,1376,2]])for(const dark of [false,true]){
 const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:true,isMobile:true,serviceWorkers:'block'}),page=await context.newPage();await page.route('**/*',r=>r.request().url().startsWith(url)||r.request().url().startsWith('blob:')?r.continue():r.abort());await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1','"done"'));
 await page.goto(url);await page.evaluate(()=>homeReady);await page.evaluate(dark=>{words={a:{word:'observe',ko:'관찰하다',book:'Saved',example:'She stopped to observe the room.',status:1},b:{word:'evidence',ko:'증거',book:'Saved',example:'There was no evidence of a struggle.',status:2}};saveWords();darkMode=dark;applyDark();show('vocab');commitStudySets(BreezeStudySets.create(readStudySets(),{name:'모아 둔 단어',bookTitles:['Saved']},words,Date.now()).state);openStudySetsDirectory();},dark);
 await page.locator('.study-sets-home-card[data-set-id]').tap();await page.locator('#study-sets-start').tap();
 const capture=async(scene)=>{const name=`${device}-${dark?'dark':'light'}-${scene}.png`;await page.screenshot({path:`${out}/${name}`,omitBackground:false});files.push({name,device,viewport:{width,height,dpr},pixels:{width:width*dpr,height:height*dpr},scene,sha256:createHash('sha256').update(readFileSync(`${out}/${name}`)).digest('hex')});};
 assert.equal(await page.locator('#study-sets-answer').isVisible(),false);await capture('front');await page.locator('#study-sets-flashcard').tap();await capture('revealed');
 const cdp=await context.newCDPSession(page),b=await page.locator('#study-sets-flashcard').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=10;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*12,y:y+2,id:1}]});await page.waitForTimeout(20);}await capture('drag-remember');await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});assert.equal(await page.evaluate(()=>BreezeStudySets.view(readStudySets(),studySetsUI.setId).completed),0);await context.close();
}writeFileSync(`${out}/manifest.json`,JSON.stringify({sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),platform:'Actual Chromium151 source renders, trusted touch. Not a native iOS build; no status-bar fabrication.',captureFiles:files,appleSpecification:'https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/'},null,2)+'\n');console.log('12 high-resolution real front/revealed/drag sources captured');}finally{await browser.close();server.close();}
