import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from 'playwright';
import {serveStudyFixture,prepareStudyPage,studySetFixture} from './helpers/study-sets-browser-fixture.mjs';
import {allWordsFixture} from './helpers/all-words-fixture.mjs';
const engine=process.env.BROWSER==='webkit'?webkit:chromium,server=await serveStudyFixture();
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const out=process.env.BREEZE_ALL_WORDS_OUTPUT||'/tmp/breeze-all-words-after';mkdirSync(out,{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,serviceWorkers:'block'}),page=await context.newPage();
 await prepareStudyPage(page,server.url);
 await page.evaluate(async({records,sets})=>{words=records;await loadStudySets();await commitStudySets(sets);show('vocab');window.scrollTo(0,450);}, {records:allWordsFixture(),sets:studySetFixture(50,10)});
 await page.evaluate(()=>openStudySetsDirectory());await page.waitForFunction(()=>studySetsUI.screen==='directory'&&studySetsUI.dialog.open);
 const position=()=>page.evaluate(()=>({window:window.scrollY,body:studySetsUI.body.scrollTop,reader:readerScroller()?.scrollTop||0}));
 const before=await position();
 const header=await page.locator('#study-sets-title').boundingBox();await page.mouse.move(header.x+20,header.y+10);await page.mouse.wheel(0,400);await page.waitForTimeout(300);
 const wheelHeader=await position();
 const cdp=engine===chromium?await context.newCDPSession(page):null;
 if(cdp){
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:header.y+20,id:1}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:195,y:header.y+20+i*20,id:1}]});await page.waitForTimeout(16);}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.waitForTimeout(300);
 }
 const touchHeader=await position();
 await page.mouse.move(195,450);await page.mouse.wheel(0,350);await page.waitForTimeout(300);const internal=await position();
 await page.evaluate(()=>closeStudySets());await page.waitForFunction(()=>!studySetsIsOpen()&&!studySetsUI.pendingClose);const closed=await position();
 const result={engine:engine.name(),native:false,touch:cdp?'trusted Chromium CDP':'not exercised',before,wheelHeader,touchHeader,internal,closed};
 console.log(JSON.stringify(result));writeFileSync(out+'/picker-'+engine.name()+'.json',JSON.stringify(result,null,2)+'\n');await context.close();
}finally{await browser.close();await server.close();}
