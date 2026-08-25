import { readyApi } from './api.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = {
  route: 'student', publicData: null, teacherData: null,
  teacherKey: sessionStorage.getItem('ready-teacher-key') || '',
  student: null, publication: null, questions: [], questionIndex: 0, startedAt: 0,
  editor: null, analyticsSetId: null,
};
let busyCount = 0;
let toastTimer;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
}
function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value));
}
function setBusy(on, label = '잠시만요…') {
  busyCount = Math.max(0, busyCount + (on ? 1 : -1));
  $('#busy').hidden = busyCount === 0;
  $('#busy span:last-child').textContent = label;
}
function toast(message) {
  const node = $('#toast');
  node.textContent = message; node.classList.add('on');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => node.classList.remove('on'), 3000);
}
async function call(op, data = {}, teacher = false, label = '잠시만요…') {
  setBusy(true, label);
  try { return await readyApi(op, data, teacher ? state.teacherKey : ''); }
  finally { setBusy(false); }
}
async function safely(job) {
  try { return await job(); }
  catch (error) {
    if (/교사용 키/.test(error.message)) {
      state.teacherKey = ''; sessionStorage.removeItem('ready-teacher-key'); showTeacherGate();
    }
    toast(error.message || '요청을 처리하지 못했습니다.');
    return null;
  }
}

function applyTheme(theme) {
  const dark = theme === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.body.classList.toggle('dark', dark);
  localStorage.setItem('ready-theme', theme);
}
function initTheme() {
  applyTheme(localStorage.getItem('ready-theme') || (matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light'));
}

function route(name) {
  state.route = name;
  $$('.view').forEach(view => view.classList.toggle('on', view.id === `v-${name}`));
  $$('.navbtn').forEach(button => button.classList.toggle('on', button.dataset.route === name));
  scrollTo({ top: 0, behavior: 'smooth' });
  if (name === 'student' && !state.publicData) loadStudentHome();
  if (name === 'teacher') ensureTeacher();
  if (name === 'analytics') ensureAnalytics();
}

async function loadStudentHome() {
  const data = await safely(() => call('student_home', {}, false, '학생 목록을 불러오는 중…'));
  if (!data) {
    $('#student-list').innerHTML = '<div class="empty">학생 목록을 불러오지 못했습니다.<br><button class="button quiet small" style="margin-top:14px" type="button" data-retry-student>다시 시도</button></div>';
    return;
  }
  state.publicData = data; state.student = null;
  $('#student-home').hidden = false; $('#student-sets').hidden = true; $('#student-player').hidden = true;
  $('#student-list').innerHTML = data.students.length
    ? data.students.map(student => `<button class="student-button" type="button" data-student-id="${student.id}">${escapeHtml(student.name)}</button>`).join('')
    : '<div class="empty">등록된 학생이 없습니다. SQL에서 학생을 먼저 추가해 주세요.</div>';
}

function showStudentSets(studentId) {
  state.student = state.publicData.students.find(student => student.id === studentId);
  if (!state.student) return;
  $('#student-home').hidden = true; $('#student-player').hidden = true;
  const area = $('#student-sets'); area.hidden = false;
  area.innerHTML = `
    <div class="backline"><button class="button quiet small" type="button" data-student-back>← 이름 선택</button><strong>${escapeHtml(state.student.name)}</strong></div>
    <p class="eyebrow">PUBLISHED STUDY SETS</p><h1>무엇을 풀어볼까요?</h1>
    <div class="set-grid" style="margin-top:30px">${state.publicData.sets.length ? state.publicData.sets.map(set => `
      <button class="card set-button" type="button" data-publication-id="${set.publicationId}">
        <span class="pill">ORDER · ${set.total}문제</span><h2>${escapeHtml(set.title)}</h2>
        <p class="lead">${escapeHtml(set.description || '문장을 읽고 가장 자연스러운 순서로 배열하세요.')}</p>
      </button>`).join('') : '<div class="empty">지금 공개된 학습세트가 없습니다.</div>'}</div>`;
}

async function startPublication(publicationId) {
  const set = state.publicData.sets.find(item => item.publicationId === publicationId);
  const data = await safely(() => call('student_questions', { studentId: state.student.id, publicationId }, false, '문제를 준비하는 중…'));
  if (!data) return;
  state.publication = set; state.questions = data.questions; state.questionIndex = 0;
  $('#student-sets').hidden = true; $('#student-player').hidden = false;
  renderQuestion();
}

function renderQuestion() {
  const area = $('#student-player');
  if (state.questionIndex >= state.questions.length) {
    area.innerHTML = `<div class="player-shell card" style="text-align:center"><p class="eyebrow">ALL DONE</p><h1 style="margin:auto">오늘 문제를 모두 풀었어요.</h1><p class="lead">선생님 화면에 모든 시도가 저장됐습니다.</p><button class="button primary" style="margin-top:24px" type="button" data-finish-player>학습세트로 돌아가기</button></div>`;
    return;
  }
  const question = state.questions[state.questionIndex];
  state.startedAt = performance.now();
  area.innerHTML = `<div class="player-shell">
    <div class="backline"><button class="button quiet small" type="button" data-exit-player>← 나가기</button><strong>${escapeHtml(state.student.name)}</strong></div>
    <div class="progress-line"><span style="width:${(state.questionIndex / state.questions.length) * 100}%"></span></div>
    <p class="question-kicker">${escapeHtml(question.passageTitle)} · Level ${question.difficulty} · ${state.questionIndex + 1}/${state.questions.length}</p>
    <h2 class="question-title">가장 자연스러운 순서로 배열하세요.</h2>
    <div class="order-list" id="order-list">${question.items.map((item, index) => orderItem(item, index, question.items.length)).join('')}</div>
    <div id="answer-result"></div>
    <div class="player-actions"><span class="lead" style="margin:0">끌거나 ↑ ↓ 버튼으로 움직일 수 있어요.</span><button class="button primary" type="button" data-submit-order>정답 제출</button></div>
  </div>`;
  setupDragAndDrop();
}
function orderItem(item, index, total) {
  return `<article class="order-item" draggable="true" data-chunk-id="${escapeHtml(item.id)}">
    <div class="drag-handle" aria-hidden="true">⠿</div><div class="order-text">${escapeHtml(item.text)}</div>
    <div class="move-stack"><button type="button" data-order-move="up" aria-label="위로 이동" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-order-move="down" aria-label="아래로 이동" ${index === total - 1 ? 'disabled' : ''}>↓</button></div>
  </article>`;
}
function updateMoveButtons() {
  const items = $$('#order-list .order-item');
  items.forEach((item, index) => {
    item.querySelector('[data-order-move="up"]').disabled = index === 0;
    item.querySelector('[data-order-move="down"]').disabled = index === items.length - 1;
  });
}
function setupDragAndDrop() {
  let dragged = null;
  $$('#order-list .order-item').forEach(item => {
    item.addEventListener('dragstart', event => { dragged = item; item.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); dragged = null; updateMoveButtons(); });
    item.addEventListener('dragover', event => {
      event.preventDefault(); if (!dragged || dragged === item) return;
      const before = event.clientY < item.getBoundingClientRect().top + item.offsetHeight / 2;
      item.parentNode.insertBefore(dragged, before ? item : item.nextSibling);
    });
  });
}
async function submitOrder() {
  const question = state.questions[state.questionIndex];
  const order = $$('#order-list .order-item').map(item => item.dataset.chunkId);
  const data = await safely(() => call('submit_attempt', {
    studentId: state.student.id, publicationId: state.publication.publicationId,
    questionId: question.id, order, elapsedMs: Math.round(performance.now() - state.startedAt),
  }, false, '답을 저장하는 중…'));
  if (!data) return;
  $('[data-submit-order]').disabled = true;
  $$('#order-list button').forEach(button => { button.disabled = true; });
  const correct = data.attempt.correct;
  $('#answer-result').innerHTML = `<div class="result ${correct ? 'good' : 'bad'}">${correct ? '정답이에요. 흐름을 정확히 읽었어요.' : '아쉬워요. 이 시도도 그대로 기록했어요.'}</div><button class="button primary" type="button" data-next-question>${state.questionIndex + 1 === state.questions.length ? '마치기' : '다음 문제'}</button>`;
}

function showTeacherGate() {
  $('#teacher-gate').hidden = false; $('#teacher-workspace').hidden = true;
}
async function ensureTeacher() {
  if (!state.teacherKey) { showTeacherGate(); return; }
  await loadTeacher();
}
async function loadTeacher() {
  const data = await safely(() => call('teacher_bootstrap', {}, true, '교사 화면을 불러오는 중…'));
  if (!data) return;
  state.teacherData = data; $('#teacher-gate').hidden = true; $('#teacher-workspace').hidden = false;
  renderTeacherSets();
}
function passageQuestions(passageId) {
  return state.teacherData.questions.filter(question => question.passage_id === passageId);
}
function activePublication(setId) {
  return state.teacherData.publications.find(publication => publication.study_set_id === setId && publication.active);
}
function renderTeacherSets() {
  const target = $('#teacher-sets');
  if (!state.teacherData.sets.length) { target.innerHTML = '<div class="empty">첫 학습세트를 만들어 주세요.</div>'; return; }
  target.innerHTML = state.teacherData.sets.map(set => {
    const passages = state.teacherData.passages.filter(passage => passage.study_set_id === set.id);
    const published = activePublication(set.id);
    return `<section class="card teacher-set">
      <div class="card-head"><div><span class="pill ${published ? 'good' : ''}">${published ? 'Published' : 'Draft'}</span><h2>${escapeHtml(set.title)}</h2></div>
      <button class="button primary" type="button" data-publish-set="${set.id}" ${passages.some(p => passageQuestions(p.id).some(q => q.status === 'approved')) ? '' : 'disabled'}>${published ? '새 버전 Publish' : 'Publish'}</button></div>
      <div class="passage-list">${passages.map(passage => renderPassage(passage)).join('') || '<div class="empty">아래에서 첫 지문을 추가하세요.</div>'}</div>
      <form class="add-passage" data-add-passage="${set.id}">
        <div class="card-head"><div><span class="step">2</span><h3>지문 붙여넣기</h3></div></div>
        <div class="form-grid"><label><span>지문 제목</span><input name="title" maxlength="120" required placeholder="예: 2026년 6월 모의고사 32번"></label>
        <label><span>영어 원문</span><textarea name="sourceText" maxlength="30000" required placeholder="영어 지문을 그대로 붙여넣으세요."></textarea></label></div>
        <p class="eyebrow" style="margin:0">ORDER DIFFICULTY</p><div class="difficulty">${[1,2,3,4].map(level => `<label><input type="radio" name="difficulty" value="${level}" ${level === 1 ? 'checked' : ''}><span>Level ${level}<small>${['3 chunks','4–5 chunks','1–2 sentences','Every sentence'][level - 1]}</small></span></label>`).join('')}</div>
        <button class="button primary" type="submit">저장하고 AI 생성</button>
      </form>
    </section>`;
  }).join('');
}
function renderPassage(passage) {
  const sentences = state.teacherData.sentences.filter(sentence => sentence.passage_id === passage.id);
  const questions = passageQuestions(passage.id);
  return `<article class="passage"><div class="passage-head"><div><h3>${escapeHtml(passage.title)}</h3><p>${sentences.length} sentences · 원문 ID 고정</p></div>
    <form class="actions" data-generate-passage="${passage.id}"><select name="difficulty" aria-label="난이도">${[1,2,3,4].map(level => `<option value="${level}">Level ${level}</option>`).join('')}</select><button class="button quiet small" type="submit">문제 추가</button></form></div>
    ${questions.map(question => `<div class="question-row"><div><span class="pill ${question.status === 'approved' ? 'good' : 'warn'}">${question.status}</span> <strong>ORDER · Level ${question.difficulty}</strong><div class="meta" style="margin-top:6px">${question.payload.chunks.length} chunks · generation ${question.generation}</div></div>
      <div class="actions"><button class="button quiet small" type="button" data-preview-question="${question.id}">Preview</button>${question.status === 'draft' ? `<button class="button primary small" type="button" data-question-status="${question.id}" data-status="approved">승인</button>` : `<button class="button quiet small" type="button" data-question-status="${question.id}" data-status="draft">승인 취소</button>`}<button class="button danger small" type="button" data-delete-question="${question.id}">삭제</button></div></div>`).join('')}
  </article>`;
}

function openEditor(questionId) {
  const question = state.teacherData.questions.find(item => item.id === questionId);
  if (!question) return;
  const order = question.payload.correctOrder.map(id => question.payload.chunks.find(chunk => chunk.id === id)).filter(Boolean);
  state.editor = { questionId, passageId: question.passage_id, difficulty: question.difficulty, chunks: structuredClone(order) };
  renderEditor(); $('#question-modal').classList.add('on'); $('#question-modal').setAttribute('aria-hidden', 'false');
}
function renderEditor() {
  const editor = state.editor;
  $('#question-editor').innerHTML = `<div class="editor-note">학생에게 보일 순서와 정답 순서는 분리됩니다. 여기서는 정답 순서와 문구를 검수하고, 학생 화면에서는 매번 섞어서 보여줍니다.</div>
    <div class="chunk-list">${editor.chunks.map((chunk, index) => `<div class="chunk-edit" data-editor-chunk="${escapeHtml(chunk.id)}"><div class="chunk-number">${index + 1}</div><textarea aria-label="${index + 1}번 chunk">${escapeHtml(chunk.text)}</textarea><div class="move-stack"><button type="button" data-editor-move="up" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-editor-move="down" ${index === editor.chunks.length - 1 ? 'disabled' : ''}>↓</button></div></div>`).join('')}</div>
    <div class="editor-actions"><button class="button primary" type="button" data-save-question>수정 저장</button><button class="button quiet" type="button" data-regenerate-question>AI 다시 생성</button><button class="button ${state.teacherData.questions.find(q => q.id === editor.questionId).status === 'approved' ? 'quiet' : 'primary'}" type="button" data-editor-approve>${state.teacherData.questions.find(q => q.id === editor.questionId).status === 'approved' ? '승인 취소' : '문제 승인'}</button><button class="button danger" type="button" data-editor-delete>삭제</button></div>`;
}
function closeEditor() { $('#question-modal').classList.remove('on'); $('#question-modal').setAttribute('aria-hidden', 'true'); state.editor = null; }
function captureEditorText() {
  if (!state.editor) return;
  $$('#question-editor [data-editor-chunk]').forEach(row => {
    const chunk = state.editor.chunks.find(item => item.id === row.dataset.editorChunk);
    if (chunk) chunk.text = row.querySelector('textarea').value.trim();
  });
}
async function saveEditor() {
  captureEditorText();
  const payload = { difficulty: state.editor.difficulty, chunks: state.editor.chunks, correctOrder: state.editor.chunks.map(chunk => chunk.id) };
  const data = await safely(() => call('update_question', { questionId: state.editor.questionId, payload }, true, '문제를 저장하는 중…'));
  if (!data) return;
  toast('수정 내용을 저장했습니다.'); closeEditor(); await loadTeacher();
}
async function regenerateQuestion(questionId, passageId, difficulty) {
  const data = await safely(() => call('generate_order', { passageId, difficulty, replaceQuestionId: questionId }, true, 'AI가 의미 흐름을 분석하는 중…'));
  if (!data) return;
  toast('새 generation을 만들었습니다.'); closeEditor(); await loadTeacher(); openEditor(data.question.id);
}
async function setStatus(questionId, status) {
  const data = await safely(() => call('set_question_status', { questionId, status }, true, '상태를 저장하는 중…'));
  if (!data) return;
  toast(status === 'approved' ? '문제를 승인했습니다.' : '승인을 취소했습니다.'); closeEditor(); await loadTeacher();
}
async function deleteQuestion(questionId) {
  if (!confirm('이 문제를 삭제할까요? 게시된 문제는 삭제할 수 없습니다.')) return;
  const data = await safely(() => call('delete_question', { questionId }, true, '문제를 삭제하는 중…'));
  if (!data) return;
  toast('문제를 삭제했습니다.'); closeEditor(); await loadTeacher();
}

async function ensureAnalytics() {
  if (!state.teacherKey) {
    $('#analytics-content').innerHTML = '<div class="card empty">Teacher 화면에서 교사용 키를 먼저 입력해 주세요.</div>';
    return;
  }
  if (!state.teacherData) await loadTeacher();
  if (state.teacherData) renderAnalytics();
}
function analyticsContext() {
  const active = state.teacherData.publications.filter(publication => publication.active);
  if (!state.analyticsSetId || !active.some(publication => publication.study_set_id === state.analyticsSetId)) state.analyticsSetId = active[0]?.study_set_id || null;
  const publication = active.find(item => item.study_set_id === state.analyticsSetId);
  const set = state.teacherData.sets.find(item => item.id === state.analyticsSetId);
  const links = publication ? state.teacherData.publicationQuestions.filter(link => link.publication_id === publication.id) : [];
  const qids = new Set(links.map(link => link.question_id));
  const attempts = publication ? state.teacherData.attempts.filter(attempt => attempt.publication_id === publication.id && qids.has(attempt.question_id)) : [];
  return { active, publication, set, links, qids, attempts };
}
function renderAnalytics() {
  const root = $('#analytics-content'); const ctx = analyticsContext();
  if (!ctx.active.length) { root.innerHTML = '<div class="empty">게시된 학습세트가 없습니다.</div>'; return; }
  const tabs = `<div class="analytics-tabs">${ctx.active.map(pub => { const set = state.teacherData.sets.find(item => item.id === pub.study_set_id); return `<button class="button ${pub.study_set_id === state.analyticsSetId ? 'primary' : 'quiet'} small" type="button" data-analytics-set="${pub.study_set_id}">${escapeHtml(set?.title || '학습세트')}</button>`; }).join('')}</div>`;
  const studentRows = state.teacherData.students.filter(student => student.active).map(student => {
    const attempts = ctx.attempts.filter(attempt => attempt.student_id === student.id);
    const completed = new Set(attempts.map(attempt => attempt.question_id)).size;
    const correct = attempts.filter(attempt => attempt.correct).length;
    const repeated = repeatedWrongPassages(attempts).length;
    return `<tr><td><strong>${escapeHtml(student.name)}</strong></td><td>${completed} / ${ctx.links.length}</td><td>${attempts.length ? Math.round(correct / attempts.length * 100) : 0}%</td><td>${attempts.length}</td><td class="${repeated ? 'repeat-count' : ''}">${repeated}</td></tr>`;
  }).join('');
  root.innerHTML = `${tabs}<div class="table-wrap"><table><thead><tr><th>학생</th><th>Completed</th><th>Accuracy</th><th>Total attempts</th><th>반복 오답 Passage</th></tr></thead><tbody>${studentRows}</tbody></table></div>
    <div class="detail-grid"><section class="card detail-card"><h2>학생 상세</h2>${studentDetails(ctx)}</section><section class="card detail-card"><h2>Passage 상세</h2>${passageDetails(ctx)}</section></div>`;
}
function questionPassage(questionId) {
  const question = state.teacherData.questions.find(item => item.id === questionId);
  return state.teacherData.passages.find(passage => passage.id === question?.passage_id);
}
function repeatedWrongPassages(attempts) {
  const counts = new Map();
  attempts.filter(attempt => !attempt.correct).forEach(attempt => {
    const passage = questionPassage(attempt.question_id); if (passage) counts.set(passage.id, (counts.get(passage.id) || 0) + 1);
  });
  return [...counts.entries()].filter(([, count]) => count >= 2);
}
function studentDetails(ctx) {
  return state.teacherData.students.filter(student => student.active).map(student => {
    const attempts = ctx.attempts.filter(attempt => attempt.student_id === student.id);
    if (!attempts.length) return `<div class="recent-row"><strong>${escapeHtml(student.name)}</strong><span>아직 시도 없음</span></div>`;
    const passageGroups = new Map();
    attempts.forEach(attempt => { const passage = questionPassage(attempt.question_id); if (!passage) return; const list = passageGroups.get(passage.id) || []; list.push(attempt); passageGroups.set(passage.id, list); });
    const repeat = repeatedWrongPassages(attempts).map(([id]) => id);
    return `<div style="margin-bottom:18px"><h3>${escapeHtml(student.name)}</h3><div class="recent-list">${[...passageGroups.entries()].map(([passageId, list]) => { const passage = state.teacherData.passages.find(item => item.id === passageId); const latest = list[0]; const wrong = list.filter(a => !a.correct).length; return `<div class="recent-row"><span>${escapeHtml(passage?.title || 'Passage')} ${repeat.includes(passageId) ? '<span class="pill warn">반복 오답</span>' : ''}</span><span>${latest.correct ? '정답' : '오답'} · ${list.length}회${wrong ? ` · 오답 ${wrong}` : ''}</span></div>`; }).join('')}${attempts.slice(0, 3).map(attempt => `<div class="meta">최근 ${formatDate(attempt.created_at)} · ${attempt.correct ? '정답' : '오답'} · ${Math.round(attempt.elapsed_ms / 1000)}초</div>`).join('')}</div></div>`;
  }).join('');
}
function passageDetails(ctx) {
  const passageIds = [...new Set([...ctx.qids].map(questionId => questionPassage(questionId)?.id).filter(Boolean))];
  return passageIds.map(passageId => {
    const passage = state.teacherData.passages.find(item => item.id === passageId);
    const qids = new Set(state.teacherData.questions.filter(question => question.passage_id === passageId).map(question => question.id));
    const attempts = ctx.attempts.filter(attempt => qids.has(attempt.question_id));
    const correct = attempts.filter(attempt => attempt.correct).length;
    const wrongStudents = [...new Set(attempts.filter(attempt => !attempt.correct).map(attempt => state.teacherData.students.find(student => student.id === attempt.student_id)?.name).filter(Boolean))];
    return `<div style="margin-bottom:18px"><h3>${escapeHtml(passage?.title || 'Passage')}</h3><div class="meta" style="margin:8px 0">전체 accuracy ${attempts.length ? Math.round(correct / attempts.length * 100) : 0}% · ${attempts.length} attempts</div><div class="recent-row"><span>틀린 학생</span><strong>${wrongStudents.length ? wrongStudents.map(escapeHtml).join(', ') : '없음'}</strong></div></div>`;
  }).join('') || '<p class="lead">문제가 없습니다.</p>';
}

document.addEventListener('click', async event => {
  if (event.target.closest('[data-close-modal]')) return closeEditor();
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.route) return route(button.dataset.route);
  if (button.id === 'theme-toggle') return applyTheme(document.body.classList.contains('dark') ? 'light' : 'dark');
  if (button.dataset.studentId) return showStudentSets(button.dataset.studentId);
  if (button.hasAttribute('data-retry-student')) return loadStudentHome();
  if (button.hasAttribute('data-student-back')) return loadStudentHome();
  if (button.dataset.publicationId) return startPublication(button.dataset.publicationId);
  if (button.hasAttribute('data-exit-player') || button.hasAttribute('data-finish-player')) return showStudentSets(state.student.id);
  if (button.dataset.orderMove) {
    const item = button.closest('.order-item'); const sibling = button.dataset.orderMove === 'up' ? item.previousElementSibling : item.nextElementSibling;
    if (sibling) item.parentNode.insertBefore(item, button.dataset.orderMove === 'up' ? sibling : sibling.nextSibling); updateMoveButtons(); return;
  }
  if (button.hasAttribute('data-submit-order')) return submitOrder();
  if (button.hasAttribute('data-next-question')) { state.questionIndex += 1; return renderQuestion(); }
  if (button.id === 'refresh-teacher') return ensureTeacher();
  if (button.id === 'refresh-analytics') { await loadTeacher(); return renderAnalytics(); }
  if (button.dataset.previewQuestion) return openEditor(button.dataset.previewQuestion);
  if (button.dataset.questionStatus) return setStatus(button.dataset.questionStatus, button.dataset.status);
  if (button.dataset.deleteQuestion) return deleteQuestion(button.dataset.deleteQuestion);
  if (button.dataset.publishSet) {
    const data = await safely(() => call('publish_set', { studySetId: button.dataset.publishSet }, true, '학생에게 게시하는 중…'));
    if (data) { toast(`${data.questionCount}개 문제를 Publish했습니다.`); await loadTeacher(); }
    return;
  }
  if (button.dataset.editorMove) {
    captureEditorText(); const row = button.closest('[data-editor-chunk]'); const index = state.editor.chunks.findIndex(chunk => chunk.id === row.dataset.editorChunk); const next = button.dataset.editorMove === 'up' ? index - 1 : index + 1;
    if (next >= 0 && next < state.editor.chunks.length) [state.editor.chunks[index], state.editor.chunks[next]] = [state.editor.chunks[next], state.editor.chunks[index]]; renderEditor(); return;
  }
  if (button.hasAttribute('data-save-question')) return saveEditor();
  if (button.hasAttribute('data-regenerate-question')) return regenerateQuestion(state.editor.questionId, state.editor.passageId, state.editor.difficulty);
  if (button.hasAttribute('data-editor-approve')) { const question = state.teacherData.questions.find(q => q.id === state.editor.questionId); return setStatus(question.id, question.status === 'approved' ? 'draft' : 'approved'); }
  if (button.hasAttribute('data-editor-delete')) return deleteQuestion(state.editor.questionId);
  if (button.dataset.analyticsSet) { state.analyticsSetId = button.dataset.analyticsSet; return renderAnalytics(); }
});

document.addEventListener('submit', async event => {
  event.preventDefault(); const form = event.target;
  if (form.id === 'teacher-key-form') {
    state.teacherKey = $('#teacher-key').value; sessionStorage.setItem('ready-teacher-key', state.teacherKey); await loadTeacher(); return;
  }
  if (form.id === 'create-set-form') {
    const body = Object.fromEntries(new FormData(form)); const data = await safely(() => call('create_set', body, true, '학습세트를 만드는 중…'));
    if (data) { form.reset(); toast('학습세트를 만들었습니다.'); await loadTeacher(); } return;
  }
  if (form.dataset.addPassage) {
    const body = Object.fromEntries(new FormData(form));
    const passage = await safely(() => call('create_passage', { studySetId: form.dataset.addPassage, title: body.title, sourceText: body.sourceText }, true, '문장을 나누어 저장하는 중…'));
    if (!passage) return;
    const generated = await safely(() => call('generate_order', { passageId: passage.passage.id, difficulty: Number(body.difficulty) }, true, 'AI가 의미 흐름을 분석하는 중…'));
    await loadTeacher();
    if (generated) { toast('지문과 ORDER 문제를 만들었습니다.'); openEditor(generated.question.id); }
    else toast('지문은 저장했습니다. 문제 추가로 다시 생성할 수 있습니다.');
    return;
  }
  if (form.dataset.generatePassage) {
    const difficulty = Number(new FormData(form).get('difficulty'));
    const generated = await safely(() => call('generate_order', { passageId: form.dataset.generatePassage, difficulty }, true, 'AI가 의미 흐름을 분석하는 중…'));
    if (generated) { await loadTeacher(); openEditor(generated.question.id); } return;
  }
});

document.addEventListener('keydown', event => { if (event.key === 'Escape' && $('#question-modal').classList.contains('on')) closeEditor(); });
initTheme();
loadStudentHome();
