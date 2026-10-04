/* Presentation preferences only: never rewrite vocabulary or source records. */
const STUDY_PREFS_KEY='breeze.study.v1';
const studyDefaults={direction:'vertical',twoFingerUndo:false,stars:[1,2,3].map((n)=>({visible:true,color:['#ffe28a','#ffab78','#ff8c8c'][n-1]}))};
let studyPrefs=structuredClone(studyDefaults);
try{
  const stored=JSON.parse(localStorage.getItem(STUDY_PREFS_KEY)||'null');
  if(stored){
    studyPrefs.twoFingerUndo=stored.twoFingerUndo===true;
    studyPrefs.direction=stored.direction==='horizontal'?'horizontal':'vertical';
    studyPrefs.stars=studyDefaults.stars.map((fallback,i)=>({visible:stored.stars?.[i]?.visible!==false,
      color:/^#[0-9a-f]{6}$/i.test(stored.stars?.[i]?.color)?stored.stars[i].color:fallback.color}));
  }
}catch(error){console.warn('Reader preferences unavailable',error);}
function persistStudyPrefs(next){
  try{localStorage.setItem(STUDY_PREFS_KEY,JSON.stringify(next));studyPrefs=next;return true;}
  catch(error){toast('설정을 저장하지 못했어요. 저장 공간을 확인해 주세요.');return false;}
}
function starVisible(status){return studyPrefs.stars[(Number(status)||1)-1]?.visible!==false;}
function starFill(status){const s=studyPrefs.stars[status-1];return s.visible?s.color+'66':'transparent';}
function setStudyStyle(style,name,value){if(style.getPropertyValue(name)!==value)style.setProperty(name,value);}
function applyStarPreferences(){
  const root=document.body.style;
  studyPrefs.stars.forEach((s,i)=>{
    const n=i+1,fill=starFill(n);
    for(const name of ['mark','saved'])setStudyStyle(root,'--'+name+n,fill);
    setStudyStyle(root,'--s'+n,s.color);
    document.querySelectorAll(`[data-star-visibility="${n}"]`).forEach(button=>{
      const label='★'.repeat(n),pressed=String(s.visible);
      if(button.textContent!==label)button.textContent=label;
      button.classList.toggle('on',s.visible);
      if(button.getAttribute('aria-pressed')!==pressed)button.setAttribute('aria-pressed',pressed);
    });
  });
  document.querySelectorAll('.epub-chapter-frame').forEach(frame=>{
    if(frame instanceof HTMLIFrameElement&&frame.contentDocument)applyEpubStarPreferences(frame.contentDocument);
  });
  if(typeof selKey!=='undefined'&&selKey&&words[selKey]&&wordPanelOpen())renderPanel();
}
function applyEpubStarPreferences(doc){
  let style=doc.getElementById('breeze-saved-mark-style');
  if(!style){
    style=doc.createElement('style');style.id='breeze-saved-mark-style';
    style.textContent=[1,2,3].map(n=>`::highlight(breeze-saved-${n}){background:var(--breeze-saved-${n})}`).join('\n');
    doc.head.append(style);
  }
  for(const n of [1,2,3])setStudyStyle(doc.documentElement.style,'--breeze-saved-'+n,starFill(n));
}
function setStarPreference(index,patch){
  const next=structuredClone(studyPrefs);Object.assign(next.stars[index-1],patch);
  if(persistStudyPrefs(next))applyStarPreferences();
}
document.addEventListener('DOMContentLoaded',()=>{
  const legend=document.querySelector('.aa-legend');legend.replaceChildren();
  for(const n of [1,2,3]){
    const toggle=document.createElement('button');toggle.type='button';toggle.className='stbtn';toggle.dataset.starVisibility=String(n);toggle.dataset.s=String(n);toggle.setAttribute('aria-label',`별 ${n}개 본문 표시`);
    toggle.onclick=()=>setStarPreference(n,{visible:!starVisible(n)});
    legend.append(toggle);
  }
  applyStarPreferences();
});

function updateTwoFingerUndoSetting(){
  const button=document.getElementById('ink-two-finger-undo');
  if(!button)return;
  button.classList.toggle('on',studyPrefs.twoFingerUndo);
  button.setAttribute('aria-pressed',String(studyPrefs.twoFingerUndo));
}
function toggleTwoFingerUndo(){
  if(persistStudyPrefs({...studyPrefs,twoFingerUndo:!studyPrefs.twoFingerUndo})){
    cancelOriginalUndoTap();updateTwoFingerUndoSetting();
  }
}
document.addEventListener('DOMContentLoaded',updateTwoFingerUndoSetting);
