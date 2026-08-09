/* ================= 무료 고전 =================
   프로젝트 구텐베르크의 퍼블릭 도메인 EPUB을 앱과 함께 배포합니다. 파일도
   DRM도 없이 "무엇을 읽지"에 바로 답하는 세 권입니다.

   다섯 권이었던 것을 셋으로 줄였습니다. 고르는 일 자체가 일이 되면 아무것도
   안 고르고 나가고, 어차피 첫 책은 한 권입니다. 셋은 쉬움(앨리스) · 아름다움
   (개츠비) · 이야기(오디세이아)로 서로 다른 이유에서 골랐습니다.

   눌렀을 때 하는 일은 사용자가 같은 파일을 끌어다 놓은 것과 완전히
   같습니다 — 받아서 `importFile()`에 넘깁니다. 그래서 `원본`과 `글자`
   모드, 단어장, 동기화가 전부 저절로 따라옵니다. 별도 경로가 없습니다. */

const CLASSICS = [
  { id:'alice-in-wonderland', title:"Alice's Adventures in Wonderland",
    author:'Lewis Carroll', year:1865, kb:136,
    blurb:'가장 짧고 가장 쉽습니다. 첫 원서로 자주 고르는 책.' },
  { id:'the-great-gatsby', title:'The Great Gatsby',
    author:'F. Scott Fitzgerald', year:1925, kb:180,
    blurb:'문장이 아름답기로 이름난 미국 소설. 5만 단어 남짓.' },
  { id:'odyssey', title:'The Odyssey',
    author:'Homer', year:-700, kb:435,
    blurb:'서양 이야기의 출발점. 새뮤얼 버틀러의 산문 번역이라 운문보다 훨씬 읽기 쉽습니다.' },
];

const classicFile = id => `assets/classics/${id}.epub`;
/* 표지는 EPUB 안에 이미 들어 있고, 받고 나면 반입기가 거기서 꺼내 씁니다
   (`epubCoverImage`). 하지만 권유 카드는 아직 받기 *전*에 뜨는 자리라,
   표지 한 장을 보자고 400KB 짜리 책을 미리 받을 수는 없습니다. 그래서 같은
   그림을 파일 밖에도 한 장 꺼내 두었습니다 — 세 장 합쳐 230KB 입니다. */
const classicCoverFile = id => `assets/classics/${id}.jpg`;

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
  const card = el('div', 'bookcard classic');
  card.innerHTML = `<img class="cover" alt="" hidden>
    <div class="author"></div><div class="bt"></div>
    <div class="get">↓ 무료로 받기 · ${(classic.kb/1024).toFixed(1)}MB</div>`;
  fillCard(card, {'.author': classic.author.toUpperCase(), '.bt': classic.title});
  /* 표지가 뜨고 나서야 카드가 표지 카드로 바뀝니다. 미리 바꿔 두면 파일이
     없을 때 흰 글씨가 빈 카드 위에 남습니다. */
  const image = card.querySelector('.cover');
  image.onload = () => { image.hidden = false; card.classList.add('has-cover'); };
  image.src = classicCoverFile(classic.id);
  /* 호메로스는 기원전이라 그냥 찍으면 "-700년"이 됩니다. */
  const year = classic.year < 0 ? `기원전 ${-classic.year}년경` : `${classic.year}`;
  card.title = `${classic.blurb} (${year}, 퍼블릭 도메인)`;
  card.onclick = () => importClassic(classic, card);
  return card;
}
