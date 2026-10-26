/* Replay of onboarding v2 must not touch an existing study library, and the
   choice screen has to stay inside short and wide viewports. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {chromium,webkit} from './helpers/bounded-playwright.mjs';
import {serveStudyFixture,prepareStudyPage} from './helpers/study-sets-browser-fixture.mjs';
const out=process.env.BREEZE_GUIDE_PROOF||'/tmp/breeze-onboarding-v2-study';
mkdirSync(out,{recursive:true});
const server=await serveStudyFixture();
const engine=process.env.BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({executablePath:engine===chromium?process.env.BREEZE_BROWSER_EXECUTABLE:undefined});
const rows=[];
try{
 for(const [device,width,height] of [['phone',390,844],['ipad',820,1180],['landscape',1180,820],['desktop',1440,900],['short',844,390]])for(const dark of [false,true]){
  const context=await browser.newContext({viewport:{width,height},deviceScaleFactor:2,hasTouch:true,serviceWorkers:'block',reducedMotion:'reduce'});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await prepareStudyPage(page,server.url);
  await page.evaluate(async darkModeValue=>{
   darkMode=darkModeValue;applyDark();
   words={quiet:{word:'quiet',ko:'조용한',book:'Saved',status:2,addedAt:1}};
   saveWords();
   await commitStudySets(BreezeStudySets.create(await loadStudySets(),{name:'Saved',bookTitles:['Saved']},words,10).state);
   localStorage.setItem(learningStorageKey('breeze.simple-study-session.v1'),'{"sentinel":"keep"}');
   openSettings();
  },dark);
  const data=()=>page.evaluate(async()=>({words:JSON.stringify(words),sets:JSON.stringify(await loadStudySets()),simple:localStorage.getItem(learningStorageKey('breeze.simple-study-session.v1'))}));
  const before=await data();
  await page.getByRole('button',{name:'튜토리얼 다시보기',exact:true}).click();
  await page.waitForFunction(()=>!!onboardingSession&&document.getElementById('onboarding').dataset.scene==='word');
  await page.waitForFunction(()=>Number(getComputedStyle(document.getElementById('settings-modal')).opacity)===0);
  await page.evaluate(()=>goOnboardingPage(1));
  await page.locator('#onboard-read').waitFor();
  assert.equal(await page.locator('.onboard-meaning').count(),0);
  assert.equal(await page.locator('#onboard-read').isEnabled(),true);
  assert.ok(await page.locator('.onboard-cover').count()>1);
  for(const selector of ['#onboard-coverflow','#onboard-read','#onboard-file','#onboard-browse']){
   const box=await page.locator(selector).boundingBox();
   assert.ok(box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=width+1&&box.y+box.height<=height+1,`${device} ${selector} ${JSON.stringify(box)}`);
  }
  await page.screenshot({path:`${out}/${device}-${dark?'dark':'light'}-choice.png`});
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#onboarding').isVisible(),false);
  for(let i=0;i<2;i++){
   await page.evaluate(()=>startOnboarding(true));
   await page.evaluate(()=>goOnboardingPage(1));
   await page.keyboard.press('Escape');
  }
  assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,'')),'done');
  assert.equal(await page.evaluate(()=>!!words.take),false);
  assert.deepEqual(await data(),before);
  assert.deepEqual(errors,[]);
  rows.push({device,dark,choiceInside:true,replayKeptLibrary:true});
  await context.close();
 }
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block',reducedMotion:'reduce'});
 const page=await context.newPage();
 await page.route('**/*',route=>route.request().url().startsWith(server.url)?route.continue():route.abort());
 await page.goto(server.url);
 await page.evaluate(()=>homeReady);
 await page.evaluate(()=>goOnboardingPage(1));
 await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>load(ONBOARD_KEY,null)),null);
 await page.reload();
 await page.evaluate(()=>homeReady);
 assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'choice');
 await page.locator('#onboard-browse').click();
 await page.reload();
 await page.evaluate(()=>homeReady);
 assert.equal(await page.locator('#onboarding').isVisible(),false);
 await page.evaluate(()=>{localStorage.removeItem(ONBOARD_KEY);localStorage.setItem(ONBOARD_PROGRESS_KEY,JSON.stringify({page:7}));startOnboarding(false);});
 assert.equal(await page.locator('#onboarding').getAttribute('data-scene'),'choice');
 assert.match(await page.locator('#onboard-read').innerText(),/바로 읽기$/);
 await context.close();
 writeFileSync(`${out}/receipt.json`,JSON.stringify({engine:engine.name(),rows,firstRunResume:true,legacyChoice:true},null,2)+'\n');
 console.log('Onboarding v2 replay kept study data; choice screen fit 10 layouts; resume and legacy progress passed');
}finally{await browser.close();await server.close();}
