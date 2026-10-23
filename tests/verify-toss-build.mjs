/* The toss target is a copy. Web, iOS and Android keep the source page. */
import assert from 'node:assert/strict';
import { readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import test from 'node:test';
import { buildToss, transformTossConfig, transformTossHtml } from '../tools/build-toss.mjs';
import { tossBackPlan } from '../scripts/platform/toss-nav.mjs';
import { TOSS_APP_NAME, TOSS_CORS_ORIGINS, tossBuildAllows, tossBuildForbids } from '../scripts/platform/toss-policy.mjs';

const root=resolve(import.meta.dirname,'..');
const read=path=>readFileSync(join(root,path),'utf8');

function walk(dir,out=[]){
  for(const name of readdirSync(dir,{withFileTypes:true})){
    const path=join(dir,name.name);
    if(name.isDirectory()) walk(path,out);
    else out.push(path);
  }
  return out;
}

function pngSize(path){
  const bytes=readFileSync(path);
  assert.equal(bytes.toString('ascii',1,4),'PNG');
  return {
    width:bytes.readUInt32BE(16),
    height:bytes.readUInt32BE(20),
    colorType:bytes[25],
  };
}

test('toss policy keeps classics, lookup and vocabulary, and blocks the rest',()=>{
  assert.equal(TOSS_APP_NAME,'breeze');
  assert.deepEqual(TOSS_CORS_ORIGINS,[
    'https://breeze.apps.tossmini.com',
    'https://breeze.private-apps.tossmini.com',
    'https://breeze.web.tossmini.com',
    'https://breeze.private-web.tossmini.com',
  ]);
  for(const feature of ['classics','word-lookup','vocabulary']) assert.equal(tossBuildAllows(feature),true);
  for(const feature of ['login','email-login','apple-login','google-login','pdf-import','epub-import','external-link','install-prompt','website-share','service-worker','iframe'])
    assert.equal(tossBuildForbids(feature),true);
});

test('toss back closes the top layer and leaves from home',()=>{
  assert.equal(tossBackPlan({view:'home'}),'exit');
  assert.equal(tossBackPlan({view:'read'}),'home');
  assert.equal(tossBackPlan({view:'read',panel:true}),'close-panel');
  assert.equal(tossBackPlan({view:'read',panel:true,sentence:true}),'close-sentence');
  assert.equal(tossBackPlan({view:'memory',studyOpen:true}),'study-back');
  assert.equal(tossBackPlan({view:'home',aiNotice:true,panel:true}),'close-notice');
  assert.equal(tossBackPlan({view:'home',settings:true}),'close-settings');
  assert.equal(tossBackPlan({view:'home',dialog:true}),'close-dialog');
});

test('source page still has login and import for web',()=>{
  const html=read('index.html');
  assert.match(html,/id="login-nudge"/);
  assert.match(html,/id="fileinput"/);
  assert.match(html,/id="add-modal"/);
  assert.match(html,/id="home-add"/);
  assert.match(html,/maximum-scale=1, user-scalable=no/);
  assert.doesNotMatch(html,/BREEZE_TARGET/);
});

test('toss html drops login, import and outbound links',()=>{
  const html=transformTossHtml(read('index.html'));
  assert.match(html,/window\.BREEZE_TARGET='toss'/);
  assert.match(html,/data-breeze-target="toss"/);
  assert.match(html,/styles\/toss\.css/);
  assert.match(html,/scripts\/platform\/toss-boot\.js/);
  assert.match(html,/scripts\/library\/remote-classics\.js/);
  assert.match(html,/scripts\/dictionary\/dictionary\.js/);
  assert.match(html,/scripts\/library\/longreads\.js/);
  assert.match(html,/maximum-scale=1, user-scalable=no/);
  assert.doesNotMatch(html,/id="login-nudge"/);
  assert.doesNotMatch(html,/id="fileinput"/);
  assert.doesNotMatch(html,/id="onboard-fileinput"/);
  assert.doesNotMatch(html,/id="original-fileinput"/);
  assert.doesNotMatch(html,/id="add-modal"/);
  assert.doesNotMatch(html,/id="home-add"/);
  assert.doesNotMatch(html,/data-kind="articles"/);
  assert.doesNotMatch(html,/href="https?:/);
  assert.doesNotMatch(html,/breeze\.io\.kr/);
  assert.doesNotMatch(html,/apps\.apple\.com/);
  assert.doesNotMatch(html,/play\.google/);
  assert.doesNotMatch(html,/Google로 로그인/);
  assert.doesNotMatch(html,/Apple로 로그인/);
  const config=transformTossConfig(read('config.js'));
  assert.match(config,/RSS_CATALOG:\s*false/);
  assert.match(config,/BOOK_CLOUD:\s*false/);
  assert.match(config,/INK_SYNC:\s*false/);
  assert.match(config,/SB_URL:/);
  assert.match(read('config.js'),/RSS_CATALOG:\s*true/);
});

test('shared guards run only when the toss flag is set',()=>{
  const main=read('scripts/main.js');
  assert.match(main,/BREEZE_TARGET!=='toss'/);
  const sync=read('scripts/sync/sync.js');
  const social=sync.slice(sync.indexOf('async function sbSocialLogin'),sync.indexOf('async function sbSendLink'));
  assert.ok(social.indexOf("BREEZE_TARGET==='toss'")>=0);
  assert.ok(social.indexOf("BREEZE_TARGET==='toss'")<social.indexOf('location.replace'));
  const modal=sync.slice(sync.indexOf('function renderSyncModal'),sync.indexOf('async function sbAppleLogin'));
  assert.ok(modal.indexOf("BREEZE_TARGET==='toss'")<modal.indexOf('Google로 로그인'));
  assert.match(read('scripts/dictionary/dictionary.js'),/toss-ai-notice/);
  assert.match(read('scripts/dictionary/dictionary.js'),/toss-ai-badge/);
  assert.match(read('scripts/reader/epub-original.js'),/appendEpubChapter[\s\S]*BREEZE_TARGET==='toss'/);
  assert.match(read('scripts/reader/pdf-navigation.js'),/renderEpubPreviewQueue[\s\S]*BREEZE_TARGET==='toss'/);
  assert.match(read('scripts/library/article-preview.js'),/BREEZE_TARGET==='toss'\)\{[\s\S]*createElement\('span'\)/);
  const config=read('apps-in-toss.config.ts');
  assert.match(config,/appName:\s*'breeze'/);
  assert.match(config,/webBundleDir:\s*'toss\/dist'/);
});

test('toss bundle builds without login, import libraries, eval or remote pages',async()=>{
  const dist=await buildToss();
  const html=readFileSync(join(dist,'index.html'),'utf8');
  assert.match(html,/window\.BREEZE_TARGET='toss'/);
  assert.doesNotMatch(html,/id="login-nudge"/);
  assert.doesNotMatch(html,/id="add-modal"/);
  assert.doesNotMatch(html,/href="https?:/);
  assert.equal(statSync(join(dist,'scripts/platform/toss-boot.js')).isFile(),true);
  assert.equal(statSync(join(dist,'scripts/library/longreads.js')).isFile(),true);
  for(const name of ['pdf-3.11.174.min.js','pdf-3.11.174.worker.min.js','jszip-3.10.1.min.js','qrcode-1.5.4.min.js']){
    assert.throws(()=>statSync(join(dist,'assets/lib',name)));
  }
  const files=walk(dist);
  let bytes=0;
  const dynamic=[];
  for(const file of files){
    bytes+=statSync(file).size;
    if(!file.endsWith('.js')) continue;
    const source=readFileSync(file,'utf8');
    if(/\beval\s*\(/.test(source)||/new Function\s*\(/.test(source)) dynamic.push(file.slice(dist.length+1));
  }
  assert.deepEqual(dynamic,[]);
  assert.ok(bytes<100*1024*1024,`bundle ${bytes} bytes`);
});

test('current app icon is opaque and square, and is not the 600 console logo',()=>{
  const icon=pngSize(join(root,'assets/favicon/icon-512.png'));
  assert.equal(icon.width,512);
  assert.equal(icon.height,512);
  assert.equal(icon.colorType,2);
  assert.notEqual(icon.width,600);
});
