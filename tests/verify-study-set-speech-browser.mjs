import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {extname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://local').pathname.replace(/^\/$/,'/index.html'));
  try{
    if(!path.startsWith(root)) throw Error();
    res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.woff2':'font/woff2'})[extname(path)]||'application/octet-stream');
    res.end(readFileSync(path));
  }catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE,args:['--no-sandbox']});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)||route.request().url().startsWith('blob:')?route.continue():route.abort());
  await page.addInitScript(()=>{
    localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done'));
    window.qaSpoken=[];
    window.qaBlockSpeech=true;
    const synth={
      speaking:false,pending:false,paused:false,
      getVoices:()=>[{lang:'en-US',name:'Test',voiceURI:'test',default:true,localService:true}],
      speak(utterance){
        window.qaSpoken.push(utterance.text);
        if(window.qaBlockSpeech){
          if(typeof utterance.onerror==='function') utterance.onerror({error:'not-allowed'});
          return;
        }
        synth.speaking=true;
        if(typeof utterance.onstart==='function') utterance.onstart({});
      },
      cancel(){synth.speaking=false;},pause(){},resume(){},addEventListener(){},removeEventListener(){}
    };
    Object.defineProperty(window,'speechSynthesis',{configurable:true,get:()=>synth});
    window.SpeechSynthesisUtterance=class{constructor(text){this.text=text;this.lang='';this.rate=1;this.voice=null;}};
  });
  await page.goto(url);
  await page.evaluate(()=>homeReady);
  await page.evaluate(async()=>{
    words={ephemeral:{word:'ephemeral',ko:'덧없는',book:'Saved book',status:1,addedAt:1,up:1,defs:[{pos:'adj',def:'lasting a very short time'}],phon:'/ɪˈfem.ər.əl/'}};
    saveWords();
    const made=BreezeStudySets.create(await loadStudySets(),{name:'Saved set',bookTitles:['Saved book']},words,100);
    await commitStudySets(made.state);
    await openStudySets(false,'detail',made.set.id,true);
  });
  assert.equal(await page.locator('#study-sets-speak').count(),0,'the set word list is not a player');
  await page.locator('#study-sets-start').click();
  await page.locator('#study-sets-speak').waitFor();
  const speak=page.locator('#study-sets-speak');
  assert.equal(await speak.isVisible(),true,'saved-set study card has no speaker');
  const box=await speak.boundingBox();
  assert.ok(box.width>=44&&box.height>=44,'set speaker is smaller than 44px');
  assert.equal(await speak.getAttribute('aria-label'),'발음 켜짐');
  assert.equal(await page.locator('#study-sets-answer').isHidden(),true,'auto-play revealed the card');
  assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['ephemeral'],'auto-play did not ask for the saved word');
  assert.equal(await page.locator('#toast').evaluate(node=>node.classList.contains('on')),false,'a blocked auto-play raised an error toast');
  await page.evaluate(()=>{window.qaBlockSpeech=false;window.qaSpoken=[];});
  await speak.click();
  assert.equal(await page.locator('#study-sets-answer').isHidden(),true,'speaker tap revealed the card');
  assert.equal(await speak.getAttribute('aria-label'),'발음 켜짐','a blocked card muted instead of speaking');
  assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['ephemeral'],'the tap did not speak the saved word');
  assert.equal(await page.evaluate(()=>Object.prototype.hasOwnProperty.call(words.ephemeral,'audio')),false,'speech wrote an audio field');
  await speak.click();
  assert.equal(await speak.getAttribute('aria-label'),'발음 꺼짐','the second tap did not mute after speech was accepted');
  assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['ephemeral'],'muting replayed the word');

  await page.evaluate(async()=>{
    setSimpleCardSpeechEnabled(true);
    window.qaBlockSpeech=true;window.qaSpoken=[];
    await startStudySetsAllWords();
  });
  const all=page.locator('#review-speak');
  await all.waitFor();
  assert.equal(await all.getAttribute('aria-label'),'발음 켜짐');
  assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['ephemeral'],'all-words auto-play did not ask for the saved word');
  await page.evaluate(()=>{window.qaBlockSpeech=false;window.qaSpoken=[];});
  await all.click();
  assert.equal(await all.getAttribute('aria-label'),'발음 켜짐','all-words speaker muted a card the browser had not played');
  assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['ephemeral'],'all-words tap did not speak after blocked auto-play');
  assert.equal(await page.evaluate(()=>simpleWordCards.flipped),false,'all-words speaker tap flipped the card');

  await page.evaluate(()=>{
    window.qaBlockSpeech=false;window.qaSpoken=[];
    selectWord('ephemeral',null);
    document.getElementById('p-speak').click();
  });
  assert.deepEqual(await page.evaluate(()=>window.qaSpoken),['ephemeral'],'dictionary speaker needs a stored audio url');
  assert.deepEqual(errors,[]);
  console.log('study-set speaker: missing on the list, present on the card, tap plays after a blocked auto-play, dictionary speaks without an audio field');
}finally{await browser.close();await new Promise(r=>server.close(r));}
