import { readyApi } from './api.js';

const $ = s => document.querySelector(s);
const SESSION_KEY = 'ready-student-session';
const state = { token:'', student:null, selectedStudent:null, exams:[], exam:null, examData:null, passage:null, sentences:[] };
let busyCount = 0, toastTimer;
const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
function busy(on,label='잠시만요…'){busyCount=Math.max(0,busyCount+(on?1:-1));$('#busy').hidden=!busyCount;$('#busy span:last-child').textContent=label;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('on');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('on'),3200);}
function theme(next){const dark=next==='dark';document.documentElement.classList.toggle('dark',dark);document.body.classList.toggle('dark',dark);localStorage.setItem('ready-theme',next);}
async function call(op,data={},token=state.token,label='잠시만요…'){busy(true,label);try{return await readyApi(op,data,token);}finally{busy(false);}}
function clearSession(){localStorage.removeItem(SESSION_KEY);state.token='';state.student=null;state.exams=[];state.exam=null;state.examData=null;}
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
async function loadDashboard(){const data=await safely(()=>call('student_bootstrap',{},state.token,'학습 목록을 준비하는 중…'));if(!data)return;state.student=data.student;state.exams=data.exams;renderExams();}
function renderExams(){
  show('student-sets');$('#session-name').textContent=state.student?.name||'';$('#logout').hidden=!state.token;
  const cards=state.exams.length?state.exams.map(e=>'<button class="card set-button" type="button" data-exam-id="'+e.id+'"><span class="pill">지문 '+e.passageCount+'</span><h2>'+esc(e.title)+'</h2><p class="lead">'+esc(e.description||'시험범위 지문을 읽어보세요.')+'</p></button>').join(''):'<div class="empty">현재 열려 있는 Exam이 없습니다.</div>';
  $('#student-sets').innerHTML='<p class="eyebrow">MY EXAMS</p><h1>'+esc(state.student.school)+' · '+esc(state.student.grade)+'</h1><p class="lead">'+esc(state.student.name)+' 학생이 풀 수 있는 시험범위입니다.</p><div class="set-grid" style="margin-top:30px">'+cards+'</div>';
}
async function loadExam(examId){const data=await safely(()=>call('student_exam',{examId},state.token,'Exam을 준비하는 중…'));if(!data)return;state.exam=data.exam;state.examData=data;renderExam('passages');}
function renderExam(tab='passages'){
  show('student-sets');const data=state.examData,content=data.passages.length?'<div class="passage-choice-list">'+data.passages.map((p,i)=>'<button class="card set-button passage-choice" type="button" data-start-passage="'+p.id+'"><span class="pill">Passage '+String(i+1).padStart(2,'0')+'</span><h2>'+esc(p.title)+'</h2><p class="meta">문장을 눌러 영어 원문과 해석을 확인하세요.</p></button>').join('')+'</div>':'<div class="empty">등록된 지문이 없습니다.</div>';
  $('#student-sets').innerHTML='<div class="backline"><button class="button quiet small" type="button" data-back-exams>← Exam 목록</button><strong>'+esc(data.exam.title)+'</strong></div><p class="eyebrow">'+esc(data.exam.school)+' · '+esc(data.exam.grade)+'</p>'+content;
}
async function openPassageStudy(passageId){const data=await safely(()=>call('student_passage',{examId:state.exam.id,passageId},state.token,'지문을 준비하는 중…'));if(!data)return;state.passage=data.passage;state.sentences=data.sentences;show('student-reader');$('#student-reader').innerHTML='<div class="reader-shell"><div class="backline"><button class="button quiet small" type="button" data-exit-study>← 지문 목록</button><strong>'+esc(data.passage.title)+'</strong></div><p class="eyebrow">PASSAGE STUDY</p><h1>'+esc(data.passage.title)+'</h1><p class="lead">문장을 누르면 같은 행에 저장된 한국어 해석을 확인할 수 있어요.</p><div class="study-sentences">'+data.sentences.map((s,i)=>'<button class="study-sentence" type="button" data-study-toggle><span class="sentence-no">'+String(i+1).padStart(2,'0')+'</span><span><span class="preview-english">'+esc(s.text)+'</span><span class="preview-translation" hidden>'+esc(s.translation||'준비된 해석이 없습니다.')+'</span></span></button>').join('')+'</div><div class="player-actions"><button class="button quiet" type="button" data-exit-study>지문 목록</button></div></div>';}
async function logout(){if(state.token)await safely(()=>call('logout',{},state.token,'로그아웃하는 중…'));clearSession();await chooseStudent();}
document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;if(button.hasAttribute('data-study-toggle')){const translation=button.querySelector('.preview-translation');translation.hidden=!translation.hidden;button.classList.toggle('translation-open',!translation.hidden);return;}if(button.id==='theme-toggle')return theme(document.body.classList.contains('dark')?'light':'dark');if(button.id==='logout')return logout();if(button.hasAttribute('data-home'))return state.token?loadDashboard():chooseStudent();if(button.dataset.studentId)return openPin({id:button.dataset.studentId,name:button.dataset.studentName});if(button.hasAttribute('data-back-students'))return chooseStudent();if(button.dataset.examId)return loadExam(button.dataset.examId);if(button.hasAttribute('data-back-exams'))return renderExams();if(button.dataset.startPassage)return openPassageStudy(button.dataset.startPassage);if(button.hasAttribute('data-exit-study'))return renderExam('passages');});
document.addEventListener('submit',event=>{event.preventDefault();if(event.target.id==='pin-form')login(event.target);});
theme(localStorage.getItem('ready-theme')||(matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light'));const previous=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');if(previous?.token){state.token=previous.token;loadDashboard();}else chooseStudent();
