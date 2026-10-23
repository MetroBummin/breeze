/* Toss WebView boot. Bundled to scripts/platform/toss-boot.js.
   Runs after the app scripts. Outside the Toss app the bridge calls fail
   once and the reader still works. */
import { graniteEvent, Screen, User } from '@apps-in-toss/web-framework';
import { tossBackPlan } from './toss-nav.mjs';

const ANON_STORAGE_KEY='breeze.toss.anon-key';
let anonRequested=false;

function viewName(){
  const view=document.querySelector('.view.on');
  return view?view.id.replace(/^v-/,''):'home';
}

function tossSnapshot(){
  const panel=document.getElementById('panel');
  const settings=document.getElementById('settings-modal');
  const notice=document.getElementById('toss-ai-notice');
  return {
    aiNotice:!!(notice&&notice.open),
    sentence:typeof sentenceLookupOpen==='function'&&sentenceLookupOpen(),
    panel:!!(panel&&(panel.classList.contains('on')||panel.getAttribute('aria-hidden')==='false'&&panel.classList.contains('anchored'))),
    settings:!!(settings&&settings.classList.contains('on')),
    dialog:!!document.querySelector('dialog[open]'),
    studyOpen:typeof studySetsIsOpen==='function'&&studySetsIsOpen(),
    view:viewName(),
  };
}

function closeOpenDialog(){
  const notice=document.getElementById('toss-ai-notice');
  const dialog=document.querySelector('dialog[open]');
  if(dialog&&dialog!==notice) dialog.close();
}

function applyTossBack(){
  const plan=tossBackPlan(tossSnapshot());
  if(plan==='close-notice') document.getElementById('toss-ai-notice')?.close();
  else if(plan==='close-sentence'&&typeof closeSentence==='function') closeSentence();
  else if(plan==='close-panel'&&typeof closePanel==='function') closePanel();
  else if(plan==='close-settings'&&typeof closeSettings==='function') closeSettings();
  else if(plan==='close-dialog') closeOpenDialog();
  else if(plan==='study-back'&&typeof studySetsBack==='function') studySetsBack();
  else if(plan==='home'&&typeof show==='function') show('home');
  else Screen.close().catch(()=>{});
}

function applyTossHome(){
  if(typeof closeSentence==='function') closeSentence();
  if(typeof closePanel==='function') closePanel();
  if(typeof closeSettings==='function') closeSettings();
  closeOpenDialog();
  if(typeof closeStudySets==='function') closeStudySets(true);
  if(typeof show==='function') show('home');
}

async function rememberTossAnonKey(){
  if(anonRequested) return;
  anonRequested=true;
  try{
    if(typeof localStorage==='undefined') return;
    if(typeof User.getAnonymousKey.isSupported==='function'&&!User.getAnonymousKey.isSupported()) return;
    const result=await User.getAnonymousKey();
    if(result&&result.type==='HASH'&&typeof result.hash==='string'&&result.hash)
      localStorage.setItem(ANON_STORAGE_KEY,result.hash);
  }catch(error){
    /* One call. A browser preview has no Toss bridge. */
  }
}

function blockExternalLinks(){
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    const link=target?.closest?.('a[href]');
    if(!link) return;
    const href=link.getAttribute('href')||'';
    if(/^https?:/i.test(href)){
      event.preventDefault();
      event.stopPropagation();
    }
  },true);
}

function startToss(){
  document.documentElement.dataset.breezeTarget='toss';
  document.documentElement.classList.remove('dark');
  document.body?.classList.remove('dark');
  blockExternalLinks();
  let stopBack=()=>{};
  let stopHome=()=>{};
  try{
    stopBack=graniteEvent.addEventListener('backEvent',{onEvent:applyTossBack,onError:()=>{}});
    stopHome=graniteEvent.addEventListener('homeEvent',{onEvent:applyTossHome,onError:()=>{}});
  }catch(error){}
  window.addEventListener('pagehide',()=>{ stopBack(); stopHome(); });
  void rememberTossAnonKey();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',startToss);
else startToss();
