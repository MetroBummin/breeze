/* ================= 무료 고전 =================
   프로젝트 구텐베르크의 퍼블릭 도메인 EPUB을 앱과 함께 배포합니다. 파일도
   DRM도 없이 "무엇을 읽지"에 바로 답하는 다섯 권입니다.

   눌렀을 때 하는 일은 사용자가 같은 파일을 끌어다 놓은 것과 완전히
   같습니다 — 받아서 `importFile()`에 넘깁니다. 그래서 `원본`과 `글자`
   모드, 단어장, 동기화가 전부 저절로 따라옵니다. 별도 경로가 없습니다. */

const CLASSICS = [
  { id:'sherlock-holmes', title:'The Adventures of Sherlock Holmes',
    author:'Arthur Conan Doyle', year:1892, kb:308,
    blurb:'셜록 홈즈 단편 12편. 한 편이 30분쯤이라 끊어 읽기 좋습니다.' },
  { id:'alice-in-wonderland', title:"Alice's Adventures in Wonderland",
    author:'Lewis Carroll', year:1865, kb:136,
    blurb:'가장 짧고 가장 쉽습니다. 첫 원서로 자주 고르는 책.' },
  { id:'the-great-gatsby', title:'The Great Gatsby',
    author:'F. Scott Fitzgerald', year:1925, kb:180,
    blurb:'문장이 아름답기로 이름난 미국 소설. 5만 단어 남짓.' },
  { id:'pride-and-prejudice', title:'Pride and Prejudice',
    author:'Jane Austen', year:1813, kb:548,
    blurb:'대화가 많아 읽는 속도가 붙습니다. 다만 19세기 영어입니다.' },
  { id:'frankenstein', title:'Frankenstein',
    author:'Mary Shelley', year:1818, kb:372,
    blurb:'다섯 권 중 가장 어렵습니다. 문장이 길고 어휘가 넓어요.' },
];

const classicFile = id => `assets/classics/${id}.epub`;

/* 이미 서가에 있는 고전은 권유 카드에서 뺍니다. */
function pendingClassics(){
  const owned = new Set(books.map(book => book.classicId).filter(Boolean));
  return CLASSICS.filter(classic => !owned.has(classic.id));
}

let classicBusy = false;
async function importClassic(classic, card){
  if(classicBusy) return;
  classicBusy = true;
  if(card) card.classList.add('busy');
  try{
    const response = await fetch(classicFile(classic.id));
    if(!response.ok) throw new Error('HTTP '+response.status);
    const blob = await response.blob();
    /* 파일 이름이 곧 책 제목이 됩니다. 반입기가 쓰는 규칙 그대로입니다. */
    const file = new File([blob], `${classic.title}.epub`, {type:'application/epub+zip'});
    await importFile(file, { author:classic.author, classicId:classic.id });
  }catch(error){
    console.error(error);
    toast('고전을 받지 못했어요 — 잠시 뒤 다시 눌러 보세요');
  }finally{
    classicBusy = false;
    if(card) card.classList.remove('busy');
  }
}

function classicCard(classic){
  const card = document.createElement('div');
  card.className = 'bookcard classic';
  card.innerHTML = `<div class="author"></div><div class="bt"></div>
    <div class="get">↓ 무료로 받기 · ${(classic.kb/1024).toFixed(1)}MB</div>`;
  card.querySelector('.author').textContent = classic.author.toUpperCase();
  card.querySelector('.bt').textContent = classic.title;
  card.title = `${classic.blurb} (${classic.year}, 퍼블릭 도메인)`;
  card.onclick = () => importClassic(classic, card);
  return card;
}
