/* The legacy EPUB table remains only so an older cloud record can restore its
   original bundled book. It is deliberately absent from the default shelf. */

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
/* 표지는 EPUB 안에도 들어 있지만(`epubCoverImage`), 이 세 권이 실제로 쓰는
   표지는 파일 밖의 이 한 장입니다.

   이유가 둘입니다. 하나는 권유 카드가 아직 받기 *전*에 뜨는 자리라, 표지
   한 장을 보자고 400KB 짜리 책을 미리 받을 수 없다는 것. 다른 하나가 더
   중요한데 — 구텐베르크가 붙여 둔 표지는 대개 밋밋합니다. 파일 밖에 두면
   `assets/classics/<id>.jpg` 를 갈아 끼우는 것만으로 권유 카드와 서가의
   책이 **함께** 바뀝니다. EPUB 을 다시 만들 일이 없습니다.
   자세한 건 assets/classics/README.md. */
const classicCoverFile = id => `assets/classics/${id}.jpg`;

/* Older classics stay local to the recovery path above and no longer appear as
   recommendations for new or existing users. Existing saved books are untouched. */
function pendingClassics(){
  return [];
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
    await applyClassicCover(classic);
  }catch(error){
    console.error(error);
    toast('고전을 받지 못했어요 — 잠시 뒤 다시 눌러 보세요');
  }finally{
    classicBusy = false;
    if(card) card.classList.remove('busy');
  }
}

/* 방금 받은 고전의 표지를 파일 밖의 한 장으로 덮어씁니다. EPUB 이 데려온
   표지와 열쇠가 같아서(`<책id>|cover`) 그림만 갈립니다.

   실패해도 조용합니다. 그림이 없으면 EPUB 이 데려온 표지가, 그것도 없으면
   지금까지의 글자 표지가 그대로 남습니다 — 책을 받은 일이 표지 한 장 때문에
   실패로 끝나면 안 됩니다. */
async function applyClassicCover(classic){
  try{
    const book = books.find(item => item.classicId === classic.id);
    if(!book) return;
    const response = await fetch(classicCoverFile(classic.id));
    if(!response.ok) return;
    const blob = await response.blob();
    if(!blob.size || !/^image\/(jpeg|png|gif|webp)$/i.test(blob.type)) return;
    const key = book.id + '|cover';
    await imgPut(key, blob);
    book.cover = key;
    await bookPut(book);
    renderAllBookViews();
  }catch(error){ console.warn('고전 표지를 씌우지 못했습니다:', error && error.message); }
}

/* 표지는 책을 받는 순간에만 씌워집니다. 이미 받아 둔 책의 표지 그림을 갈아
   끼우고 바로 보려면 콘솔에서 `refreshClassicCovers()` 한 줄이면 됩니다.
   앱 화면에는 이 문이 없습니다 — 만드는 사람만 쓰는 것이라 단추를 둘 자리가
   아닙니다. */
async function refreshClassicCovers(){
  let done = 0;
  for(const classic of CLASSICS){
    if(!books.some(book => book.classicId === classic.id)) continue;
    await applyClassicCover(classic);
    done++;
  }
  console.info(`받아 둔 고전 ${done}권의 표지를 파일에서 다시 씌웠습니다.`);
  return done;
}

/* Long Reads are local plain-text sources imported through the same file path as
   a user-selected .txt book. No website HTML or article renderer enters Reader. */
const LONG_READS = [
  {
    id:'backroom-homeward-bound', file:'assets/longreads/homewardbound.txt',
    cover:'assets/longreads/covers/backroom-homeward-bound.png', coverPosition:'center top',
    title:'Backroom - Homeward Bound', originalTitle:'Homeward Bound: Chapters 1–2',
    author:'DivineAtlas', sourceUrl:'https://backrooms-wiki.wikidot.com/homewardbound-ch-1',
    sources:[
      {title:'Homeward Bound: Chapter 1',url:'https://backrooms-wiki.wikidot.com/homewardbound-ch-1'},
      {title:'Homeward Bound: Chapter 2',url:'https://backrooms-wiki.wikidot.com/homewardbound-ch-2'},
    ],
    site:'Backrooms Wiki', license:'CC BY-SA 3.0',
    licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',
  },
];
/* These pictures sit above the exact story passage they depict. Match the
   passage text so a saved Text book keeps its original paragraph indices and
   reading position, including copies imported before the pictures shipped. */
const HOMEWARD_ILLUSTRATIONS = [
  {before:'I sat stunned as the police', file:'assets/longreads/illustrations/homeward-01-police-search.jpg', alt:'경찰이 수색하는 집에서 결혼반지를 쥔 제임스'},
  {before:'My attention was immediately drawn to the walls', file:'assets/longreads/illustrations/homeward-02-studio.jpg', alt:'그림과 실종자 사진, 붉은 실로 가득한 미아의 작업실'},
  {before:"I thought about her sister's disappearance", file:'assets/longreads/illustrations/homeward-03-laptop.jpg', alt:'미아의 노트북 화면에 보이는 노란 방 사진'},
  {before:'As the dilapidated structure came into view', file:'assets/longreads/illustrations/homeward-04-mill.jpg', alt:'밤의 낡은 제분소 앞에 세워진 미아의 빨간 차'},
  {before:'The invasive stench of mildew', file:'assets/longreads/illustrations/homeward-05-backrooms.jpg', alt:'형광등 아래 축축한 카펫이 끝없이 이어지는 노란 공간'},
  {before:'The pitch-black night sky loomed', file:'assets/longreads/illustrations/homeward-06-rooftop.jpg', alt:'오렌지색 가로등 아래 얼굴 없는 사람을 내려다보는 두 여성'},
  {before:"Okay, it's not that gross.", file:'assets/longreads/illustrations/homeward-07-canteen.jpg', alt:'노란 복도에 놓인 찌그러진 물통'},
  {before:'What in the glorious name', file:'assets/longreads/illustrations/homeward-08-room.jpg', alt:'낡은 복도 옆 작은 방의 매트리스와 탐정의 물통'},
  {before:'Two M.E.G. operatives stood', file:'assets/longreads/illustrations/homeward-09-hotel.jpg', alt:'마호가니 문 너머 붉은 카펫에 모인 얼굴 없는 무리'},
  {before:'It was another flickering wall.', file:'assets/longreads/illustrations/homeward-10-wall.jpg', alt:'노란 복도 끝에서 불안정하게 깜빡이는 벽'},
];
function longReadIllustrationBefore(book,text){
  if(book.longReadId!=='backroom-homeward-bound') return null;
  return HOMEWARD_ILLUSTRATIONS.find(image=>String(text||'').startsWith(image.before))||null;
}
const longReadAttribution = read => ({
  title:read.originalTitle, author:read.author, sourceName:read.site,
  sourceUrl:read.sourceUrl, sources:read.sources,
  license:read.license, licenseUrl:read.licenseUrl,
});
/* Upgrade the bundled Chapter 1 copy in place. The first 61 paragraph indices
   stay identical, so saved Text anchors and lookup context remain meaningful. */
async function upgradeHomewardLongRead(){
  const read=LONG_READS[0];
  const book=books.find(item=>item.longReadId===read.id);
  if(!book||book.kind!=='txt'||book.paras.length!==61)return;
  const response=await fetch(read.file);
  if(!response.ok)return;
  const text=await response.text();
  const combined=parseTXT(text,{preserveParagraphs:true});
  if(combined.length!==107||!book.paras.every((paragraph,index)=>paragraph===combined[index]))return;
  const oldLength=book.paras.length;
  book.paras=combined;
  book.formatting=null;
  book.fingerprint=bookContentFingerprint(combined);
  book.originalTitle=read.originalTitle;
  book.attribution=longReadAttribution(read);
  const position=positions[book.id];
  if(position){
    const oldIndex=position.pi==null?(position.p||0)*(oldLength-1):position.pi;
    position.p=Math.max(0,Math.min(1,oldIndex/(combined.length-1)));
    positions[book.id]=position;
    save(LS_POS,positions);
  }
  await bookPut(book);
}
function pendingLongReads(){
  const owned=new Set(books.map(book=>book.longReadId).filter(Boolean));
  return LONG_READS.filter(read=>!owned.has(read.id));
}

let longReadBusy=false;
async function importLongRead(read,card){
  if(longReadBusy)return;
  longReadBusy=true;
  if(card)card.classList.add('busy');
  try{
    const response=await fetch(read.file);
    if(!response.ok)throw new Error('HTTP '+response.status);
    const text=await response.text();
    if(text.trim().length<100)throw new Error('Text book is empty');
    const file=new File([text],`${read.id}.txt`,{type:'text/plain'});
    await importFile(file,{
      title:read.title, author:read.author, longReadId:read.id,
      originalTitle:read.originalTitle, sourceUrl:read.sourceUrl, site:read.site,
      attribution:longReadAttribution(read), coverPosition:read.coverPosition,
    },{preserveParagraphs:true});
    await applyLongReadCover(read);
  }catch(error){
    console.error(error);
    toast('긴 글을 준비하지 못했어요 — 잠시 뒤 다시 눌러 보세요');
  }finally{
    longReadBusy=false;
    if(card)card.classList.remove('busy');
  }
}
async function applyLongReadCover(read){
  try{
    const book=books.find(item=>item.longReadId===read.id);
    if(!book)return;
    const response=await fetch(read.cover);
    if(!response.ok)return;
    const blob=await response.blob();
    if(!blob.size||!/^image\/(jpeg|png|gif|webp)$/i.test(blob.type))return;
    const key=book.id+'|cover';
    await imgPut(key,blob);
    book.cover=key;book.coverPosition=read.coverPosition;
    await bookPut(book);renderAllBookViews();
  }catch(error){console.warn('긴 글 표지를 씌우지 못했습니다:',error&&error.message);}
}
function longReadCard(read){
  const card=el('div','bookcard classic longread');
  card.dataset.longreadId=read.id;
  card.innerHTML=`<img class="cover" alt="" hidden>
    <div class="author"></div><div class="bt"></div>
    <div class="get">↓ Breeze Text로 읽기</div>`;
  fillCard(card,{'.author':'BACKROOMS TALE SERIES','.bt':read.title});
  const image=card.querySelector('.cover');
  image.onload=()=>{image.hidden=false;card.classList.add('has-cover');};
  image.style.objectPosition=read.coverPosition;
  image.src=read.cover;
  card.title=`${read.originalTitle} · ${read.author} · Backrooms Wiki`;
  card.onclick=()=>importLongRead(read,card);
  return card;
}
