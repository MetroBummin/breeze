/* Fresh production learning UI, isolated authored demo data, no lookup requests.
   Capture the actual tap/left-repeat/right-remember interaction for the guide. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {serveStudyFixture,prepareStudyPage} from '../tests/helpers/study-sets-browser-fixture.mjs';
const out=resolve(process.env.BREEZE_STUDY_MEDIA_PROOF||'/tmp/breeze-study-media-followup');mkdirSync(out,{recursive:true});
const server=await serveStudyFixture(),browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE});
const receipts=[];
try{for(const dark of [false,true]){
 const theme=dark?'dark':'light',context=await browser.newContext({viewport:{width:390,height:640},deviceScaleFactor:1,hasTouch:true,serviceWorkers:'block',recordVideo:{dir:out,size:{width:390,height:640}}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await prepareStudyPage(page,server.url);
 await page.evaluate(async d=>{darkMode=d;applyDark();words={observe:{word:'observe',ko:'관찰하다',example:'Take a moment to observe the breeze.',clickedIndex:4,book:'예제',addedAt:1,status:1},breeze:{word:'breeze',ko:'산들바람',example:'A gentle breeze moves the leaves.',clickedIndex:2,book:'예제',addedAt:2,status:1}};saveWords();show('vocab');await openVocabularyReview();},dark);
 await page.evaluate(()=>document.fonts.ready);await page.mouse.click(380,80);await page.waitForTimeout(250);
 await page.addStyleTag({content:'#qa-demo-touch{position:fixed;z-index:999;pointer-events:none;width:28px;height:28px;border:2px solid rgba(85,135,175,.8);border-radius:50%;background:rgba(105,155,185,.15);transform:translate(-50%,-50%);opacity:0}'});
 await page.evaluate(()=>{const n=document.createElement('div');n.id='qa-demo-touch';document.body.append(n);});
 const pointer=async(x,y,visible)=>page.evaluate(({x,y,visible})=>{const n=document.getElementById('qa-demo-touch');n.style.left=x+'px';n.style.top=y+'px';n.style.opacity=visible?'1':'0';},{x,y,visible});
 const tap=async()=>{const b=await page.locator('#review-flip').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await pointer(x,y,true);await page.locator('#review-flip').tap();await page.waitForTimeout(350);await pointer(x,y,false);};
 const drag=async dx=>{const b=await page.locator('#review-flip').boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2;await page.mouse.move(x,y);await pointer(x,y,true);await page.mouse.down();for(let i=1;i<=15;i++){await page.mouse.move(x+dx*i/15,y);await pointer(x+dx*i/15,y,true);await page.waitForTimeout(20);}await page.mouse.up();await pointer(x+dx,y,false);await page.waitForFunction(()=>!simpleStudyBusy);await page.waitForTimeout(300);};
 const video=page.video(),cleanStart=Date.now();await page.waitForTimeout(1000);assert.equal(await page.locator('#review-expression').innerText(),'observe');await page.screenshot({path:resolve(out,`study-${theme}-front.png`)});
 await tap();await page.screenshot({path:resolve(out,`study-${theme}-answer.png`)});await page.waitForTimeout(1000);await drag(-140);assert.equal(await page.locator('#review-progress').innerText(),'0 / 2');assert.equal(await page.locator('#review-expression').innerText(),'breeze');await page.waitForTimeout(1000);await tap();await page.waitForTimeout(1000);await drag(140);assert.equal(await page.locator('#review-progress').innerText(),'1 / 2');await page.waitForTimeout(1000);assert.deepEqual(errors,[]);
 const cleanDuration=(Date.now()-cleanStart)/1000;await context.close();const raw=resolve(out,`study-${theme}.webm`);await video.saveAs(raw);
 const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',raw],{encoding:'utf8'});assert.equal(probe.status,0,probe.stderr);const trim=Math.max(0,Number(probe.stdout)-cleanDuration);
 const args=['-y','-loglevel','error','-ss',String(trim),'-i',raw,'-vf','fps=30','-c:v','libx264','-profile:v','baseline','-pix_fmt','yuv420p','-crf','23','-an','-movflags','+faststart',resolve(`assets/onboarding/study-${theme}.mp4`)];const encode=spawnSync('ffmpeg',args,{encoding:'utf8'});assert.equal(encode.status,0,encode.stderr);
 const poster=spawnSync('ffmpeg',['-y','-loglevel','error','-i',resolve(out,`study-${theme}-front.png`),'-q:v','2',resolve(`assets/onboarding/study-${theme}.jpg`)],{encoding:'utf8'});assert.equal(poster.status,0,poster.stderr);
 receipts.push({theme,engine:'Chromium',viewport:{width:390,height:640},native:false,source:'fresh production UI with isolated authored words and saved examples',steps:['front','tap reveal','left repeat 0/2','tap reveal','right remember 1/2'],externalLookupRequests:0});
}}
finally{await browser.close();await server.close();}
writeFileSync(resolve(out,'receipt.json'),JSON.stringify(receipts,null,2)+'\n');console.log('Created light/dark passive study clips and front posters from real production UI.');
