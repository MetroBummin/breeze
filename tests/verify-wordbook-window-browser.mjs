import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createServer} from 'node:http';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from './helpers/bounded-playwright.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const mime={'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=createServer((req,res)=>{
  const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/^\/$/,'/index.html'));
  if(!path.startsWith(root)){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');res.end(readFileSync(path));}
  catch{res.writeHead(404).end();}
});
await new Promise(done=>server.listen(0,'127.0.0.1',done));
const url=`http://127.0.0.1:${server.address().port}/`;
const browser=await chromium.launch({executablePath:process.env.BREEZE_BROWSER_EXECUTABLE||'/usr/bin/google-chrome'});

function savedWords(count){
  return Object.fromEntries(Array.from({length:count},(_,i)=>['w'+i,{word:'word'+i,ko:'뜻'+i,status:(i%3)+1,book:i%2?'Book A':'Book B',addedAt:i+1}]));
}

try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block',hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>route.request().url().startsWith(url)?route.continue():route.abort());
  await page.addInitScript(()=>localStorage.setItem('breeze.onboarding.v1',JSON.stringify('done')));
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.evaluate(()=>homeReady);

  await page.evaluate(data=>{words=data;dead={};vocabOpen.clear();saveWords();show('vocab');},savedWords(40));
  assert.equal(await page.locator('#vtablewrap .vgroup').count(),40,'Short Memory lists still mount every row');
  assert.equal(await page.locator('#vtablewrap .wordbook-swipe .study-sets-row-action').count(),40,'The wordbook shown on entry can remove each word');
  assert.equal(await page.locator('.vocab-window-spacer').count(),0);
  assert.equal(await page.locator('#vcnt').textContent(),'전체 40단어');
  const removedWord=await page.evaluate(()=>{
    const shell=document.querySelector('#vtablewrap .wordbook-swipe');
    const word=shell.querySelector('.vword').textContent;
    shell.querySelector('.study-sets-row-action').click();
    return word;
  });
  await page.waitForFunction(word=>!Object.values(words).some(item=>item&&item.word===word),removedWord);
  assert.match(await page.locator('#wordbook-undo').innerText(),/삭제됨/);
  await page.locator('#wordbook-undo button').click();
  await page.waitForFunction(word=>Object.values(words).some(item=>item&&item.word===word),removedWord);
  assert.equal(await page.locator('#vcnt').textContent(),'전체 40단어');

  await page.evaluate(data=>{words=data;dead={};vocabOpen.clear();saveWords();renderVocab();},savedWords(180));
  const mounted=await page.locator('#vtablewrap .vgroup').count();
  assert.ok(mounted>8&&mounted<100,`Windowed Memory mounted ${mounted} rows`);
  assert.ok(await page.locator('.vocab-window-spacer').count()>=1);
  assert.equal(await page.locator('#vcnt').textContent(),'전체 180단어');
  assert.equal(await page.evaluate(()=>visibleVocabularyReviewKeys().length),180,'Filtered practice scope stays the whole list');
  assert.equal(await page.locator('#vtablewrap .vgroup').first().locator('.vword').textContent(),'word179');

  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForFunction(()=>[...document.querySelectorAll('#vtablewrap .vgroup')].some(node=>node.dataset.g==='w0'));
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#vtablewrap .vgroup')].some(node=>node.dataset.g==='w179')),false,'Scrolled-away rows are not mounted');
  const reached=await page.evaluate(()=>{
    const first=document.querySelector('#vtablewrap .vgroup');
    first.querySelector('.vword').focus();
    return Number(first.dataset.index);
  });
  assert.ok(reached>0);
  await page.keyboard.press('Shift+Tab');
  const afterTab=await page.evaluate(()=>Number(document.activeElement?.closest('.vgroup')?.dataset.index));
  assert.equal(afterTab,reached-1,'Shift+Tab mounts the previous offscreen word');

  await page.evaluate(()=>window.scrollTo(0,0));
  await page.locator('#vsearch').fill('뜻42');
  assert.equal(await page.locator('#vtablewrap .vgroup').count(),1);
  assert.equal(await page.locator('.vocab-window-spacer').count(),0,'A short search result mounts every match');
  assert.equal(await page.locator('#vcnt').textContent(),'전체 180단어 · 1개 표시');
  await page.locator('#vsearch').fill('');
  assert.ok(await page.locator('#vtablewrap .vgroup').count()<100);

  await page.locator('#vtablewrap .vword').first().click();
  assert.equal(await page.locator('#vtablewrap .vgroup.open .rowdel').count(),1);
  const beforeDelete=await page.locator('#vtablewrap .vgroup').count();
  await page.locator('#vtablewrap .rowdel').click();
  await page.waitForFunction(()=>document.getElementById('vcnt').textContent==='전체 179단어');
  const afterDelete=await page.locator('#vtablewrap .vgroup').count();
  assert.ok(afterDelete<100&&afterDelete<=beforeDelete+5,'Deleting one word does not mount the rest');
  assert.equal(await page.evaluate(()=>!!words.w179),false);

  await page.locator('#vstars button[data-status="3"]').click({force:true});
  const starred=await page.evaluate(()=>document.querySelectorAll('#vtablewrap .vgroup').length);
  const starredTotal=await page.evaluate(()=>visibleVocabularyReviewKeys().length);
  assert.ok(starredTotal<179&&starredTotal>0);
  assert.ok(starred<=starredTotal);
  await page.locator('#vstars button[data-status="3"]').click({force:true});

  await page.evaluate(()=>openStudySetsDirectory());
  await page.waitForSelector('#study-sets-all');
  assert.ok(await page.locator('#v-vocab .vgroup').count()<100,'학습하기 does not lay out every Memory row');
  await page.locator('#study-sets-all').click();
  await page.waitForSelector('#study-all-words-list');
  const allWords=await page.evaluate(()=>({
    total:document.getElementById('study-all-words-list').dataset.total,
    mounted:document.querySelectorAll('#study-all-words-list > li').length
  }));
  assert.equal(allWords.total,'179');
  assert.ok(allWords.mounted<100,'전체 단어 keeps its own window');

  assert.deepEqual(errors,[]);
  console.log('Memory window, search, delete, stars and 전체 단어 passed.');
}finally{
  await browser.close();
  await new Promise(done=>server.close(done));
}
