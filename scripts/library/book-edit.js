/* ================= 책 정보 고치기 =================
   카드를 꾹 누르면(또는 ✕를 누르면) 열립니다. 제목과 표지를 한자리에서
   고치고, 지우는 것도 여기서 합니다.

   지우기는 두 갈래로 물어봅니다. 예전에는 한 번 누르면 서버까지 함께
   지워서, 폰에서 자리만 비우려던 사람이 노트북의 책까지 잃었습니다.
   되돌릴 수 없는 쪽을 기본으로 두면 안 됩니다. */

let editTarget = null;
let selectedCoverPhoto = null;
let coverSearchId = 0;
let coverSavePending = false;

const editModal = () => document.getElementById('edit-modal');

function editStep(step){
  editModal().querySelectorAll('.ed-step').forEach(section =>
    section.classList.toggle('on', section.dataset.step === step));
}

function openEditSheet(book, step){
  if(!book) return;
  editTarget = book;
  selectedCoverPhoto = null;
  coverSearchId++;
  document.getElementById('ed-title').value = book.title;
  document.getElementById('ed-what').textContent = book.title;
  renderCoverChoices(book);
  const source = /** @type {HTMLAnchorElement} */(document.getElementById('ed-cover-source'));
  source.hidden = !book.coverSourcePage;
  if(book.coverSourcePage) source.href = book.coverSourcePage;
  document.getElementById('ed-del-note').textContent = '단어장과 다른 기기의 읽기자료는 그대로 남습니다.';
  editModal().classList.add('on');
  editStep(step || 'edit');
}
function closeEditSheet(){
  editModal().classList.remove('on'); editTarget = null;
  selectedCoverPhoto = null; coverSearchId++;
}

function openCoverSearch(){
  if(!editTarget) return;
  (/** @type {HTMLInputElement} */(document.getElementById('ed-cover-query'))).value = editTarget.title.slice(0, 90);
  document.getElementById('ed-cover-search-status').textContent = '';
  document.getElementById('ed-cover-results').replaceChildren();
  editStep('cover-search');
  searchCoverPhotos();
}

function openverseCoverResults(payload){
  const groups=new Map();
  for(const item of payload?.results || []){
    const license=String(item.license || '').toLowerCase();
    const imageUrl=item.url || '', thumbUrl=item.thumbnail || imageUrl, pageUrl=item.foreign_landing_url || '';
    if(!['cc0','pdm'].includes(license) || !/^https:\/\//.test(imageUrl) ||
       !/^https:\/\//.test(thumbUrl) || !/^https:\/\//.test(pageUrl) ||
       Math.min(Number(item.width)||0,Number(item.height)||0)<300) continue;
    const provider=String(item.provider || item.source || 'Openverse');
    const group=groups.get(provider) || [];
    group.push({title:String(item.title || 'Untitled image'),imageUrl,thumbUrl,pageUrl,license,provider});
    groups.set(provider,group);
  }
  const results=[];
  while(results.length<18){
    let added=false;
    for(const group of groups.values()){
      if(group.length){results.push(group.shift());added=true;if(results.length===18)break;}
    }
    if(!added)break;
  }
  return results;
}

function setCoverSearchPreset(query){
  (/** @type {HTMLInputElement} */(document.getElementById('ed-cover-query'))).value=query;
  searchCoverPhotos();
}

async function searchCoverPhotos(event){
  event?.preventDefault();
  if(!editTarget) return;
  const query=(/** @type {HTMLInputElement} */(document.getElementById('ed-cover-query'))).value.trim().slice(0,90);
  const status=document.getElementById('ed-cover-search-status');
  const results=document.getElementById('ed-cover-results');
  const id=++coverSearchId;
  results.replaceChildren();
  if(!query){status.textContent='검색어를 입력해 주세요.';return;}
  status.textContent='사진을 찾는 중…';
  // Openverse allows at most 20 results per anonymous request.
  const params=new URLSearchParams({q:query,license:'cc0,pdm',page_size:'20'});
  try{
    const response=await fetch('https://api.openverse.org/v1/images/?'+params,
      {credentials:'omit',signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw response.status;
    const photos=openverseCoverResults(await response.json());
    if(id!==coverSearchId || !editTarget)return;
    status.textContent=photos.length ? '사진을 누르면 표지로 고를 수 있어요.' : '쓸 수 있는 사진이 없어요. 검색어를 바꿔보세요.';
    for(const photo of photos){
      const button=document.createElement('button');
      button.type='button';button.className='ed-search-result';
      button.setAttribute('aria-label',photo.title+' 표지로 선택');
      const image=document.createElement('img');image.alt='';image.loading='lazy';
      image.referrerPolicy='no-referrer';image.src=photo.thumbUrl;
      const caption=document.createElement('span');caption.textContent=`${photo.title} · ${photo.provider}`;
      button.append(image,caption);
      button.onclick=()=>selectCoverPhoto(photo);
      results.appendChild(button);
    }
  }catch(error){
    if(id===coverSearchId && editTarget){
      const statusCode=typeof error==='number' ? error : 0;
      status.textContent=statusCode===401 ? '이미지 검색 한도에 도달했어요. 잠시 후 다시 시도해 주세요.' :
        statusCode===429 ? '검색 요청이 잠시 많아요. 잠시 후 다시 시도해 주세요.' :
        '사진을 찾지 못했어요. 잠시 후 다시 시도해 주세요.';
    }
  }
}

function selectCoverPhoto(photo){
  if(!editTarget)return;
  selectedCoverPhoto=photo;
  editStep('edit');
  const wrap=document.getElementById('ed-covers');
  wrap.querySelectorAll('.ed-search-pick').forEach(node=>node.remove());
  wrap.querySelectorAll('.ed-cover').forEach(node=>node.classList.remove('on'));
  const cell=document.createElement('button');cell.type='button';cell.className='ed-cover ed-search-pick on';
  cell.setAttribute('aria-label','선택한 사진');
  const image=document.createElement('img');image.alt='';image.src=photo.thumbUrl || photo.imageUrl;
  image.referrerPolicy='no-referrer';cell.appendChild(image);
  cell.onclick=()=>{wrap.querySelectorAll('.ed-cover').forEach(node=>node.classList.remove('on'));cell.classList.add('on');wrap.dataset.pick='__search__';};
  wrap.appendChild(cell);wrap.dataset.pick='__search__';cell.scrollIntoView({block:'nearest',inline:'nearest'});
  const source=/** @type {HTMLAnchorElement} */(document.getElementById('ed-cover-source'));
  source.href=photo.pageUrl;source.hidden=false;
}

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
      selectedCoverPhoto = null;
      document.getElementById('ed-cover-source').hidden = key !== (book.cover || '') || !book.coverSourcePage;
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
  editTarget.coverSourcePage = '';
  editTarget.coverUpdatedAt = Date.now();
  await bookPut(editTarget);
  queueSync();
  renderCoverChoices(editTarget);
  document.getElementById('ed-cover-source').hidden = true;
  renderAllBookViews();
}

async function saveEditSheet(){
  if(!editTarget) return;
  const book = editTarget;
  const typed = document.getElementById('ed-title').value.trim();
  const picked = document.getElementById('ed-covers').dataset.pick || '';
  let changed = false;

  if(picked === '__search__' && selectedCoverPhoto){
    if(coverSavePending)return;
    coverSavePending=true;
    const photo=selectedCoverPhoto;
    const requestId=coverSearchId;
    try{
      const blob=await fetchArticleImage(photo.imageUrl);
      if(editTarget!==book || requestId!==coverSearchId)return;
      if(!blob){toast('사진을 저장하지 못했어요. 다른 사진을 골라주세요.');return;}
      const key=book.id+'|cover|'+(crypto.randomUUID?.() || Date.now().toString(36)+Math.random().toString(36).slice(2));
      await imgPut(key,blob);
      try{
        if(editTarget!==book || requestId!==coverSearchId){await imgDel(key);return;}
        const next={...book,title:typed || book.title,
          renamedAt:typed && typed!==book.title ? Date.now() : book.renamedAt,
          cover:key,coverUpdatedAt:Date.now(),coverSourcePage:photo.pageUrl,
          imgSrc:{...book.imgSrc,[key]:photo.imageUrl}};
        await bookPut(next);
        Object.assign(book,next);
      }catch(error){await imgDel(key);throw error;}
    }catch(error){
      toast('표지를 저장하지 못했어요. 다시 시도해 주세요.');
      return;
    }finally{coverSavePending=false;}
    closeEditSheet();renderAllBookViews();toast('표지를 바꿨어요');queueSync();
    return;
  }
  if(typed && typed !== book.title){
    book.title = typed;
    book.renamedAt = Date.now();        // 어느 쪽 이름이 최신인지 판단하는 기준
    changed = true;
  }
  if(picked !== (book.cover || '')){
    book.cover = picked || null;
    book.coverUpdatedAt = Date.now();
    book.coverSourcePage = '';
    changed = true;
  }
  if(!changed){ closeEditSheet(); return; }

  await bookPut(book);
  closeEditSheet();
  renderAllBookViews();
  toast('바꿨어요');
  queueSync();
}

/* ---------- 지우기 ----------
   카드의 ✕ 를 걷어내면서 지우기로 곧장 들어오던 문(`confirmDeleteBook`)도
   함께 없앴습니다. 이제는 꾹 눌러 이 시트를 열고 `삭제…` 를 고릅니다. */

editModal().addEventListener('click', event => {
  if(event.target.id === 'edit-modal') closeEditSheet();
});

async function runDelete(){
  const book = editTarget;
  if(!book) return;
  closeEditSheet();
  await deleteBook(book);
}
