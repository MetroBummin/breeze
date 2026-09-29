/* Presentation preferences only: never rewrite vocabulary or source records. */
const STUDY_PREFS_KEY='breeze.study.v1';
const studyDefaults={direction:'vertical',stars:[1,2,3].map((n)=>({visible:true,color:['#ffe28a','#ffab78','#ff8c8c'][n-1]}))};
let studyPrefs=structuredClone(studyDefaults);
try{
  const stored=JSON.parse(localStorage.getItem(STUDY_PREFS_KEY)||'null');
  if(stored){
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
function applyStarPreferences(){
  const root=document.body.style;
  studyPrefs.stars.forEach((s,i)=>{
    const n=i+1,fill=starFill(n);
    for(const name of ['mark','saved'])root.setProperty('--'+name+n,fill);
    root.setProperty('--s'+n,s.color);root.setProperty('--pick'+n+'-fill',fill);
    root.setProperty('--pick'+n+'-line',s.visible?s.color:'transparent');
    document.querySelectorAll(`[data-star-visibility="${n}"]`).forEach(button=>{
      button.textContent=s.visible?'켜짐':'꺼짐';button.setAttribute('aria-pressed',String(s.visible));
    });
    const input=document.querySelector(`input[data-star-color="${n}"]`);
    if(input instanceof HTMLInputElement)input.value=s.color;
  });
  document.querySelectorAll('.epub-chapter-frame').forEach(frame=>{
    if(frame instanceof HTMLIFrameElement&&frame.contentDocument)applyEpubStarPreferences(frame.contentDocument);
  });
  if(typeof selKey!=='undefined'&&selKey&&words[selKey])renderPanel();
}
function applyEpubStarPreferences(doc){
  let style=doc.getElementById('breeze-star-preferences');
  if(!style){style=doc.createElement('style');style.id='breeze-star-preferences';doc.head.append(style);}
  doc.head.append(style);
  for(const marker of doc.querySelectorAll('.original-selection-marker')){
    const n=[1,2,3].find(n=>marker.classList.contains('s'+n));
    if(n){marker.style.background=starFill(n);marker.style.boxShadow=`0 0 0 2px ${starFill(n)}`;}
  }
  style.textContent=[1,2,3].map(n=>`::highlight(breeze-saved-${n}){background:${starFill(n)}} .breeze-original-word.s${n}{background:${starFill(n)}!important}`).join('\n');
}
function setStarPreference(index,patch){
  const next=structuredClone(studyPrefs);Object.assign(next.stars[index-1],patch);
  if(persistStudyPrefs(next))applyStarPreferences();
}
document.addEventListener('DOMContentLoaded',()=>{
  const legend=document.querySelector('.aa-legend');legend.replaceChildren();
  for(const n of [1,2,3]){
    const row=document.createElement('div');row.className='study-star-row';
    const label=document.createElement('span');label.className='study-star-label';label.textContent='★'.repeat(n);label.dataset.s=String(n);
    const toggle=document.createElement('button');toggle.type='button';toggle.dataset.starVisibility=String(n);toggle.setAttribute('aria-label',`별 ${n}개 본문 표시`);
    toggle.onclick=()=>setStarPreference(n,{visible:!starVisible(n)});
    const color=document.createElement('input');color.type='color';color.dataset.starColor=String(n);color.setAttribute('aria-label',`별 ${n}개 색상 변경`);
    color.onchange=()=>setStarPreference(n,{color:color.value});
    row.append(label,toggle,color);legend.append(row);
  }
  applyStarPreferences();
});
