import { readyApi } from './api.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const SESSION_KEY = 'ready-student-session';
const state = { token:'', student:null, selectedStudent:null, sets:[], publication:null, questions:[], questionIndex:0, startedAt:0 };
let busyCount = 0, toastTimer;

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'})[char]);
function setBusy(on, label='잠시만요…') { busyCount=Math.max(0,busyCount+(on?1:-1)); $('#busy').hidden=!busyCount; $('#busy span:last-child').textContent=label; }
function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('on'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('on'),3200); }
function applyTheme(theme) { const dark=theme==='dark'; document.documentElement.classList.toggle('dark',dark); document.body.classList.toggle('dark',dark); localStorage.setItem('ready-theme',theme); }
function initTheme() { applyTheme(localStorage.getItem('ready-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light')); }
function savedSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)||sessionStorage.getItem(SESSION_KEY)||'null'); } catch { return null; } }
function clearSession() { localStorage.removeItem(SESSION_KEY); sessionStorage.removeItem(SESSION_KEY); state.token=''; state.student=null; }
function saveSession(session) { clearSession(); (session.remember?localStorage:sessionStorage).setItem(SESSION_KEY,JSON.stringify(session)); state.token=session.token; }
async function call(op,data={},token=state.token,label='잠시만요…') { setBusy(true,label); try { return await readyApi(op,data,token); } finally { setBusy(false); } }
async function safely(job,{auth=true}={}) { try { return await job(); } catch(error) { if(auth&&error.status===401){ clearSession(); await showStudentChooser(); } toast(error.message||'요청을 처리하지 못했습니다.'); return null; } }
function showOnly(id) { ['student-home','pin-login','student-sets','student-player'].forEach(name=>$('#'+name).hidden=name!==id); }

async function showStudentChooser() {
  showOnly('student-home'); $('#logout').hidden=true; $('#session-name').textContent='';
  const data=await safely(()=>call('list_students',{},'','학생 목록을 불러오는 중…'),{auth:false});
  $('#student-list').innerHTML=data?.students?.length?data.students.map(student=>`<button class="student-button" type="button" data-student-id="${student.id}" data-student-name="${escapeHtml(student.name)}">${escapeHtml(student.name)}</button>`).join(''):'<div class="empty">로그인 가능한 학생이 없습니다. 선생님께 알려 주세요.</div>';
}
function openPin(student) { state.selectedStudent=student; $('#pin-student-name').textContent=student.name; $('#pin-form').reset(); showOnly('pin-login'); setTimeout(()=>$('#student-pin').focus(),0); }
async function login(form) {
  const values=new FormData(form), remember=values.get('remember')==='on';
  const data=await safely(()=>call('student_login',{studentId:state.selectedStudent.id,pin:values.get('pin'),remember},'','PIN을 확인하는 중…'),{auth:false});
  if(!data)return; saveSession(data.session); state.student=data.student; await loadDashboard();
}
async function loadDashboard() {
  const data=await safely(()=>call('student_bootstrap',{},state.token,'학습세트를 불러오는 중…')); if(!data)return;
  state.student=data.student; state.sets=data.sets; $('#logout').hidden=false; $('#session-name').textContent=state.student.name; renderSets();
}
function renderSets() {
  showOnly('student-sets');
  $('#student-sets').innerHTML=`<p class="eyebrow">PUBLISHED STUDY SETS</p><h1>${escapeHtml(state.student.name)} 학생, 무엇을 풀어볼까요?</h1><div class="set-grid" style="margin-top:30px">${state.sets.length?state.sets.map(set=>`<button class="card set-button" type="button" data-publication-id="${set.publicationId}"><span class="pill">ORDER · ${set.total}문제</span><h2>${escapeHtml(set.title)}</h2><p class="lead">${escapeHtml(set.description||'문장을 읽고 가장 자연스러운 순서로 배열하세요.')}</p></button>`).join(''):'<div class="empty">지금 공개된 학습세트가 없습니다.</div>'}</div>`;
}
async function startPublication(publicationId) {
  const data=await safely(()=>call('student_questions',{publicationId},state.token,'문제를 준비하는 중…')); if(!data)return;
  state.publication=state.sets.find(set=>set.publicationId===publicationId); state.questions=data.questions; state.questionIndex=0; renderQuestion();
}
function orderItem(item,index,total) { return `<article class="order-item" draggable="true" data-chunk-id="${escapeHtml(item.id)}"><div class="drag-handle" aria-hidden="true">⠿</div><div class="order-text">${escapeHtml(item.text)}</div><div class="move-stack"><button type="button" data-order-move="up" aria-label="위로 이동" ${index===0?'disabled':''}>↑</button><button type="button" data-order-move="down" aria-label="아래로 이동" ${index===total-1?'disabled':''}>↓</button></div></article>`; }
function renderQuestion() {
  showOnly('student-player'); const area=$('#student-player');
  if(state.questionIndex>=state.questions.length){ area.innerHTML=`<div class="player-shell card" style="text-align:center"><p class="eyebrow">ALL DONE</p><h1 style="margin:auto">오늘 문제를 모두 풀었어요.</h1><p class="lead">선생님 화면에 모든 시도가 저장됐습니다.</p><button class="button primary" style="margin-top:24px" type="button" data-finish-player>학습세트로 돌아가기</button></div>`; return; }
  const question=state.questions[state.questionIndex]; state.startedAt=performance.now();
  area.innerHTML=`<div class="player-shell"><div class="backline"><button class="button quiet small" type="button" data-exit-player>← 나가기</button><strong>${escapeHtml(state.student.name)}</strong></div><div class="progress-line"><span style="width:${state.questionIndex/state.questions.length*100}%"></span></div><p class="question-kicker">${escapeHtml(question.passageTitle)} · Level ${question.difficulty} · ${state.questionIndex+1}/${state.questions.length}</p><h2 class="question-title">가장 자연스러운 순서로 배열하세요.</h2><div class="order-list" id="order-list">${question.items.map((item,index)=>orderItem(item,index,question.items.length)).join('')}</div><div id="answer-result"></div><div class="player-actions"><span class="lead" style="margin:0">끌거나 ↑ ↓ 버튼으로 움직일 수 있어요.</span><button class="button primary" type="button" data-submit-order>정답 제출</button></div></div>`;
  setupDragAndDrop();
}
function updateMoveButtons(){const items=$$('#order-list .order-item');items.forEach((item,index)=>{item.querySelector('[data-order-move="up"]').disabled=index===0;item.querySelector('[data-order-move="down"]').disabled=index===items.length-1;});}
function setupDragAndDrop(){let dragged=null;$$('#order-list .order-item').forEach(item=>{item.addEventListener('dragstart',event=>{dragged=item;item.classList.add('dragging');event.dataTransfer.effectAllowed='move';});item.addEventListener('dragend',()=>{item.classList.remove('dragging');dragged=null;updateMoveButtons();});item.addEventListener('dragover',event=>{event.preventDefault();if(!dragged||dragged===item)return;const before=event.clientY<item.getBoundingClientRect().top+item.offsetHeight/2;item.parentNode.insertBefore(dragged,before?item:item.nextSibling);});});}
async function submitOrder(){const question=state.questions[state.questionIndex],order=$$('#order-list .order-item').map(item=>item.dataset.chunkId);const data=await safely(()=>call('submit_attempt',{publicationId:state.publication.publicationId,questionId:question.id,order,elapsedMs:Math.round(performance.now()-state.startedAt)},state.token,'답을 저장하는 중…'));if(!data)return;$('[data-submit-order]').disabled=true;$$('#order-list button').forEach(button=>button.disabled=true);const correct=data.attempt.correct;$('#answer-result').innerHTML=`<div class="result ${correct?'good':'bad'}">${correct?'정답이에요. 흐름을 정확히 읽었어요.':'아쉬워요. 이 시도도 그대로 기록했어요.'}</div><button class="button primary" type="button" data-next-question>${state.questionIndex+1===state.questions.length?'마치기':'다음 문제'}</button>`;}
async function logout(){if(state.token)await safely(()=>call('logout',{},state.token,'로그아웃하는 중…'));clearSession();await showStudentChooser();}

document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.id==='theme-toggle')return applyTheme(document.body.classList.contains('dark')?'light':'dark');if(button.id==='logout')return logout();if(button.hasAttribute('data-home'))return state.token?loadDashboard():showStudentChooser();if(button.dataset.studentId)return openPin({id:button.dataset.studentId,name:button.dataset.studentName});if(button.hasAttribute('data-back-students'))return showStudentChooser();if(button.dataset.publicationId)return startPublication(button.dataset.publicationId);if(button.hasAttribute('data-exit-player')||button.hasAttribute('data-finish-player'))return renderSets();if(button.dataset.orderMove){const item=button.closest('.order-item'),sibling=button.dataset.orderMove==='up'?item.previousElementSibling:item.nextElementSibling;if(sibling)item.parentNode.insertBefore(item,button.dataset.orderMove==='up'?sibling:sibling.nextSibling);updateMoveButtons();return;}if(button.hasAttribute('data-submit-order'))return submitOrder();if(button.hasAttribute('data-next-question')){state.questionIndex+=1;return renderQuestion();}});
document.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='pin-form')login(event.target);});

initTheme(); const previous=savedSession(); if(previous?.token){state.token=previous.token;loadDashboard();}else showStudentChooser();
