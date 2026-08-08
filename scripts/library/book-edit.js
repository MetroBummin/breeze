/* ================= 책 정보 고치기 =================
   카드를 꾹 누르면(또는 ✕를 누르면) 열립니다. 제목과 표지를 한자리에서
   고치고, 지우는 것도 여기서 합니다.

   지우기는 두 갈래로 물어봅니다. 예전에는 한 번 누르면 서버까지 함께
   지워서, 폰에서 자리만 비우려던 사람이 노트북의 책까지 잃었습니다.
   되돌릴 수 없는 쪽을 기본으로 두면 안 됩니다. */

let editTarget = null;

const editModal = () => document.getElementById('edit-modal');

function editStep(step){
  editModal().querySelectorAll('.ed-step').forEach(section =>
    section.classList.toggle('on', section.dataset.step === step));
}

function openEditSheet(book, step){
  if(!book) return;
  editTarget = book;
  document.getElementById('ed-title').value = book.title;
  document.getElementById('ed-what').textContent = book.title;
  renderCoverChoices(book);
  /* 로그인하지 않았으면 서버에 사본이 없습니다. 고를 것이 없는 갈림길을
     보여줄 이유가 없습니다. */
  const signedIn = !!(typeof sbUser !== 'undefined' && sbUser);
  editModal().querySelector('.ed-all').hidden = !signedIn;
  document.getElementById('ed-del-note').textContent = signedIn
    ? '단어장은 어느 쪽이든 그대로 남습니다.'
    : '로그인하지 않아 서버에는 사본이 없습니다. 단어장은 그대로 남습니다.';
  editModal().classList.add('on');
  editStep(step || 'edit');
}
function closeEditSheet(){ editModal().classList.remove('on'); editTarget = null; }

/* 표지 고르기 — 기사라면 그 기사가 데려온 사진 중에서 고릅니다. 그림을
   새로 만들 필요가 없는 가장 흔한 경우입니다. */
function renderCoverChoices(book){
  const wrap = document.getElementById('ed-covers');
  wrap.innerHTML = '';
  const add = (key, label) => {
    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'ed-cover' + (key === (book.cover || '') ? ' on' : '');
    cell.innerHTML = key ? '<img alt="">' : `<span>${label}</span>`;
    cell.onclick = () => {
      wrap.querySelectorAll('.ed-cover').forEach(other => other.classList.remove('on'));
      cell.classList.add('on');
      wrap.dataset.pick = key;
    };
    if(key) bookImageBlob(book, key).then(blob => {
      if(blob) cell.querySelector('img').src = URL.createObjectURL(blob);
      else cell.remove();
    });
    wrap.appendChild(cell);
  };
  wrap.dataset.pick = book.cover || '';
  add('', '없음');
  const own = new Set(Object.keys(book.imgSrc || {}));
  (book.paras || []).forEach(paragraph => {
    if(paragraph.startsWith(IMG_MARK)) own.add(paragraph.slice(IMG_MARK.length));
  });
  own.forEach(key => add(key, ''));
}

async function pickCoverFile(input){
  const file = input.files[0];
  input.value = '';
  if(!file || !editTarget) return;
  if(!/^image\//.test(file.type)){ toast('그림 파일을 골라주세요'); return; }
  const key = editTarget.id + '|cover';
  await imgPut(key, file);
  editTarget.cover = key;
  await bookPut(editTarget);
  renderCoverChoices(editTarget);
  renderAllBookViews();
}

async function saveEditSheet(){
  if(!editTarget) return;
  const book = editTarget;
  const typed = document.getElementById('ed-title').value.trim();
  const picked = document.getElementById('ed-covers').dataset.pick || '';
  let changed = false;

  if(typed && typed !== book.title){
    book.title = typed;
    book.renamedAt = Date.now();        // 어느 쪽 이름이 최신인지 판단하는 기준
    changed = true;
  }
  if(picked !== (book.cover || '')){ book.cover = picked || null; changed = true; }
  if(!changed){ closeEditSheet(); return; }

  await bookPut(book);
  closeEditSheet();
  renderAllBookViews();
  toast('바꿨어요');
  pushBookTitle(book);
}

/* ---------- 지우기 ---------- */

function confirmDeleteBook(book){ openEditSheet(book, 'delete'); }

editModal().addEventListener('click', event => {
  if(event.target.id === 'edit-modal') closeEditSheet();
});

async function runDelete(scope){
  const book = editTarget;
  if(!book) return;
  closeEditSheet();
  await deleteBook(book, scope);
}
