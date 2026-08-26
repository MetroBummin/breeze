import { readyApi } from './api.js';

const $ = s => document.querySelector(s);
const SESSION_KEY = 'ready-student-session';
const state = { token:'', student:null, selectedStudent:null, scope:null, passages:[], passage:null, sentences:[] };
let busyCount = 0, toastTimer;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function busy(on,label='잠시만요…'){busyCount=Math.max(0,busyCount+(on?1:-1));$('#busy').hidden=!busyCount;$('#busy span:last-child').textContent=label;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('on'),3200);}
function theme(next){const dark=next==='dark';document.documentElement.classList.toggle('dark',dark);document.body.classList.toggle('dark',dark);localStorage.setItem('ready-theme',next);}
async function call(op,data={},token=state.token,label='잠시만요…'){busy(true,label);try{return await readyApi(op,data,token);}finally{busy(false);}}
function clearSession(){localStorage.removeItem(SESSION_KEY);state.token='';state.student=null;state.scope=null;state.passages=[];}
async function safely(job,{auth=true}={}){try{return await job();}catch(error){if(auth&&error.status===401){clearSession();await chooseStudent();}toast(error.message||'요청을 처리하지 못했습니다.');return null;}}
function show(...ids){['student-home','pin-login','student-sets','student-reader'].forEach(id=>$('#'+id).hidden=!ids.includes(id));}

async function chooseStudent(){
  const data=await safely(()=>call('list_students',{},'','학생 목록을 불러오는 중…'),{auth:false});if(!data)return;
  state.selectedStudent=null;show('student-home');
  $('#student-list').innerHTML=data.students.length?data.students.map(s=>'<button class="student-button" type="button" data-student-id="'+s.id+'" data-student-name="'+esc(s.name)+'">'+esc(s.name)+'</button>').join(''):'<div class="empty">등록된 학생이 없습니다. 관리자에게 문의해 주세요.</div>';
}
function openPin(student){state.selectedStudent=student;show('pin-login');$('#pin-student-name').textContent=student.name;$('#student-pin').focus();}
async function login(form){
  const values=Object.fromEntries(new FormData(form)),data=await safely(()=>call('student_login',{studentId:state.selectedStudent.id,pin:values.pin,remember:values.remember==='on'},'','PIN을 확인하는 중…'),{auth:false});form.reset();if(!data)return;
  state.token=data.session.token;state.student=data.student;
  if(data.session.remember)localStorage.setItem(SESSION_KEY,JSON.stringify(data.session));else localStorage.removeItem(SESSION_KEY);
  await loadDashboard();
}
async function loadDashboard(){const data=await safely(()=>call('student_bootstrap',{},state.token,'시험범위를 준비하는 중…'));if(!data)return;state.student=data.student;state.scope=data.scope;state.passages=data.passages;renderScope();}
function renderScope(){
  show('student-sets');$('#session-name').textContent=state.student?.name||'';$('#logout').hidden=!state.token;
  const content=!state.scope?'<div class="empty scope-empty"><strong>아직 배정된 시험범위가 없습니다.</strong><span>관리자가 지문을 배정하면 이곳에 표시됩니다.</span></div>':state.passages.length?'<div class="passage-choice-list">'+state.passages.map((passage,index)=>'<button class="card set-button passage-choice" type="button" data-start-passage="'+passage.id+'"><span class="pill">Passage '+String(index+1).padStart(2,'0')+'</span><h2>'+esc(passage.title)+'</h2><p class="meta">영어 지문 읽기</p></button>').join('')+'</div>':'<div class="empty scope-empty"><strong>아직 배정된 지문이 없습니다.</strong><span>관리자가 지문을 배정하면 이곳에 표시됩니다.</span></div>';
  $('#student-sets').innerHTML='<p class="eyebrow">CURRENT SCOPE</p><h1>'+esc(state.student.school)+' · '+esc(state.student.grade)+'</h1><p class="lead">'+esc(state.student.name)+' 학생의 현재 시험범위입니다.</p>'+content;
}
async function openPassageStudy(passageId){
  if(!state.scope)return;
  const data=await safely(()=>call('student_passage',{examId:state.scope.id,passageId},state.token,'지문을 준비하는 중…'));if(!data)return;
  state.passage=data.passage;state.sentences=data.sentences;show('student-reader');
  $('#student-reader').innerHTML='<div class="reader-shell"><div class="backline"><button class="button quiet small" type="button" data-exit-study>← 지문 목록</button></div><p class="eyebrow">PASSAGE</p><h1>'+esc(data.passage.title)+'</h1><p class="reader-hint">문장을 누르면 한국어 해석을 확인할 수 있어요.</p><article class="reading-passage">'+data.sentences.map(sentence=>'<button class="reading-sentence" type="button" data-study-toggle><span class="preview-english">'+esc(sentence.text)+'</span><span class="preview-translation" hidden>'+esc(sentence.translation||'준비된 해석이 없습니다.')+'</span></button>').join('')+'</article><div class="player-actions"><button class="button quiet" type="button" data-exit-study>지문 목록</button></div></div>';
}
async function logout(){if(state.token)await safely(()=>call('logout',{},state.token,'로그아웃하는 중…'));clearSession();await chooseStudent();}
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-study-toggle')){const translation=button.querySelector('.preview-translation');translation.hidden=!translation.hidden;button.classList.toggle('translation-open',!translation.hidden);return;}if(button.id==='theme-toggle')return theme(document.body.classList.contains('dark')?'light':'dark');if(button.id==='logout')return logout();if(button.hasAttribute('data-home'))return state.token?loadDashboard():chooseStudent();if(button.dataset.studentId)return openPin({id:button.dataset.studentId,name:button.dataset.studentName});if(button.hasAttribute('data-back-students'))return chooseStudent();if(button.dataset.startPassage)return openPassageStudy(button.dataset.startPassage);if(button.hasAttribute('data-exit-study'))return renderScope();});
document.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='pin-form')login(event.target);});
theme(localStorage.getItem('ready-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));const previous=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(previous?.token){state.token=previous.token;loadDashboard();}else chooseStudent();
