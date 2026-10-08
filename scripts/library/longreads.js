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
    dormant:true, // Retain saved-copy rendering/attribution; omit new recommendations.
    cover:'assets/longreads/covers/backroom-homeward-bound.png', coverPosition:'center top',
    title:'Backroom - Homeward Bound', originalTitle:'Homeward Bound: Chapters 1–2',
    author:'DivineAtlas', sourceUrl:'https://backrooms-wiki.wikidot.com/homewardbound-ch-1',
    sources:[
      {title:'Homeward Bound: Chapter 1',url:'https://backrooms-wiki.wikidot.com/homewardbound-ch-1'},
      {title:'Homeward Bound: Chapter 2',url:'https://backrooms-wiki.wikidot.com/homewardbound-ch-2'},
    ],
    site:'Backrooms Wiki', license:'CC BY-SA 3.0',
    licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/',
    series:'BACKROOMS TALE SERIES',
    hook:'아내가 사라진 뒤, 제임스는 사진과 붉은 실로 뒤덮인 작업실에서 단서를 찾습니다. 노트북 속 낯선 노란 방은 그를 어디로 데려갈까요?',
    edition:'English original · Chapters 1–2', wordCount:4035,
  },
  {
    id:'sherlock-holmes-speckled-band', file:'assets/longreads/speckled-band.txt',
    cover:'assets/longreads/covers/speckled-band.webp', coverPosition:'center top',
    title:'The Adventure of the Speckled Band',
    originalTitle:'The Adventure of the Speckled Band (1892)',
    author:'Arthur Conan Doyle',
    sourceUrl:'https://www.gutenberg.org/ebooks/1661', site:'Project Gutenberg',
    license:'Original: public domain in the USA',
    licenseUrl:'https://www.gutenberg.org/ebooks/1661',
    series:'SHERLOCK HOLMES · LIGHTLY MODERNIZED',
    hook:'결혼을 앞둔 줄리아에게 밤마다 들려오던 낮은 휘파람. 2년 뒤, 같은 방에서 그 소리를 들은 쌍둥이 자매 헬렌 스토너가 이른 아침 베이커가를 찾아옵니다.',
    edition:'Lightly modernized English edition', wordCount:9804,
    sha256:'9b9b230612dc39e67f18e86d1c71d4146adce8a677a15444938d619396ff50e2',
    editionNote:'Lightly modernized English edition. Adapted from Arthur Conan Doyle’s “The Adventure of the Speckled Band,” in The Adventures of Sherlock Holmes (1892). Source text: Project Gutenberg, eBook #1661. Language lightly modernized for Breeze; this is not Doyle’s verbatim text. The story, paragraph order, period setting and clues are preserved.',
    glossary:'Period terms: dog-cart — a light horse-drawn carriage; trap — a light carriage; half-pay — reduced pay for an officer not on active service. Historical money, objects and the story’s account of animal behaviour are retained.',
  },
  {
    "id": "sherlock-holmes-scandal-in-bohemia",
    "file": "assets/longreads/scandal-in-bohemia.txt",
    "cover": "assets/longreads/covers/scandal-in-bohemia.webp",
    "coverPosition": "center top",
    "title": "A Scandal in Bohemia",
    "originalTitle": "A Scandal in Bohemia (1891)",
    "author": "Arthur Conan Doyle",
    "sourceUrl": "https://www.gutenberg.org/ebooks/1661",
    "site": "Project Gutenberg",
    "license": "Original: public domain in the USA",
    "licenseUrl": "https://www.gutenberg.org/ebooks/1661",
    "series": "SHERLOCK HOLMES · LIGHTLY MODERNIZED",
    "hook": "가면을 쓴 의뢰인이 되찾으려는 사진 한 장. 몇 번을 뒤져도 찾지 못한 사진을 홈즈는 어떻게 찾아낼까?",
    "edition": "Lightly modernized English edition",
    "wordCount": 8522,
    "sha256": "ec92ace7eccf6e9b93cadbba6be46ef6d19bb27c0d183a44b094219c62e3b50e",
    "editionNote": "Lightly modernized English edition. Adapted from Arthur Conan Doyle’s “A Scandal in Bohemia,” in The Adventures of Sherlock Holmes (1892). Source text: Project Gutenberg, eBook #1661. Language lightly modernized for Breeze; this is not Doyle’s verbatim text. The story, paragraph order, period setting and clues are preserved.",
    "glossary": "Period terms: brougham and hansom — horse-drawn carriages; gasogene — a device for making carbonated water; ostler — a stable worker. Historical money, objects, names and clue-bearing language are retained."
  },
  {
    "id": "sherlock-holmes-red-headed-league",
    "file": "assets/longreads/red-headed-league.txt",
    "cover": "assets/longreads/covers/red-headed-league.webp",
    "coverPosition": "center top",
    "title": "The Red-Headed League",
    "originalTitle": "The Red-Headed League (1891)",
    "author": "Arthur Conan Doyle",
    "sourceUrl": "https://www.gutenberg.org/ebooks/1661",
    "site": "Project Gutenberg",
    "license": "Original: public domain in the USA",
    "licenseUrl": "https://www.gutenberg.org/ebooks/1661",
    "series": "SHERLOCK HOLMES · LIGHTLY MODERNIZED",
    "hook": "붉은 머리라는 이유만으로, 백과사전을 베끼면 주급 4파운드. 이렇게 좋은 일자리에는 왜 자리를 비워선 안 된다는 조건이 붙었을까?",
    "edition": "Lightly modernized English edition",
    "wordCount": 9106,
    "sha256": "0fbd9ec3d94403182d7b441c1d7456ac967b487fc1878218cb0322ffd736278c",
    "editionNote": "Lightly modernized English edition. Adapted from Arthur Conan Doyle’s “The Red-Headed League,” in The Adventures of Sherlock Holmes (1892). Source text: Project Gutenberg, eBook #1661. Language lightly modernized for Breeze; this is not Doyle’s verbatim text. The story, paragraph order, period setting and clues are preserved.",
    "glossary": "Period terms: hansom — a horse-drawn cab; derbies — slang for handcuffs; napoleon — a historical French gold coin. Historical money, dates, objects and the source’s chronology are retained."
  },
  {
    "id": "sherlock-holmes-final-problem",
    "file": "assets/longreads/final-problem.txt",
    "cover": "assets/longreads/covers/final-problem.webp",
    "coverPosition": "center top",
    "title": "The Final Problem",
    "originalTitle": "The Final Problem (1893)",
    "author": "Arthur Conan Doyle",
    "sourceUrl": "https://www.gutenberg.org/ebooks/834",
    "site": "Project Gutenberg",
    "license": "Original: public domain in the USA",
    "licenseUrl": "https://www.gutenberg.org/ebooks/834",
    "series": "SHERLOCK HOLMES · LIGHTLY MODERNIZED",
    "hook": "런던에서 홈즈를 위협하는 보이지 않는 손. 왓슨과 함께 유럽으로 떠난 그는 모리아티의 추적을 벗어날 수 있을까요?",
    "edition": "Lightly modernized English edition",
    "wordCount": 7150,
    "sha256": "9d1f3c4140d80894937695add3b1ca60e6054ac03bbd081d4dedc55733556b90",
    "editionNote": "Lightly modernized English edition. Adapted from Arthur Conan Doyle’s “The Final Problem” (1893). Complete story. Source text: Project Gutenberg, eBook #834. Language lightly modernized for Breeze; this is not Doyle’s verbatim text. The story, paragraph order, period setting and clues are preserved.",
    "glossary": "Historical money, objects, dates, names and clue-bearing language are retained."
  },
  {
    "id": "sherlock-holmes-hound-of-the-baskervilles",
    "file": "assets/longreads/hound-of-the-baskervilles.txt",
    "cover": "assets/longreads/covers/hound-of-the-baskervilles.webp",
    "coverPosition": "center top",
    "title": "The Hound of the Baskervilles",
    "originalTitle": "The Hound of the Baskervilles (1902)",
    "author": "Arthur Conan Doyle",
    "sourceUrl": "https://www.gutenberg.org/ebooks/2852",
    "site": "Project Gutenberg",
    "license": "Original: public domain in the USA",
    "licenseUrl": "https://www.gutenberg.org/ebooks/2852",
    "series": "SHERLOCK HOLMES · LIGHTLY MODERNIZED",
    "hook": "황야의 오래된 저택과 가문에 전해 내려오는 무서운 전설. 새 상속인을 지키기 위해 왓슨은 바스커빌 홀로 향합니다.",
    "edition": "Lightly modernized English edition",
    "wordCount": 59266,
    "sha256": "19906dcd8bd6e3127bfd6676361901199dd10ba6bf3077963e6de2768d08b2c4",
    "editionNote": "Lightly modernized English edition. Adapted from Arthur Conan Doyle’s “The Hound of the Baskervilles” (1902). Complete fifteen-chapter novel with original frontmatter. Source text: Project Gutenberg, eBook #2852. Language lightly modernized for Breeze; this is not Doyle’s verbatim text. The story, paragraph order, period setting and clues are preserved.",
    "glossary": "Historical money, objects, dates, names and clue-bearing language are retained."
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
/* Approved Holmes scenes appear only after their verified canonical passage.
   The reader decorates existing blocks; saved text, lookup indices and progress
   are never rewritten. Edited/mismatched copies omit an unresolved picture. */
const HOLMES_ILLUSTRATIONS = {
  "sherlock-holmes-speckled-band": [
    {
      "id": "speckled-band-01",
      "before": "\"Very sorry to wake you, Watson,\" said he, \"but it's the common lot this morning. Mrs. Hudson was woken, she did the same to",
      "after": "It was early in April in the year '83 that I woke one morning to find Sherlock Holmes standing, fully",
      "paragraph": 2,
      "file": "assets/longreads/illustrations/speckled-band-01.webp",
      "alt": "Holmes wakes Watson at dawn",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-02",
      "before": "\"You must not fear,\" said he soothingly, bending forward and patting her forearm. \"We shall soon set matters right, I have no doubt. You",
      "after": "\"It is fear, Mr. Holmes. It is terror.\" She raised her veil as she spoke, and we could see that",
      "paragraph": 11,
      "file": "assets/longreads/illustrations/speckled-band-02.webp",
      "alt": "Helen Stoner beside the Baker Street fire",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-03",
      "before": "\"See that you keep yourself out of my grip,\" he snarled, and hurling the twisted poker into the fireplace he strode out of the",
      "after": "\"I will go when I have had my say. Don't you dare to meddle with my affairs. I know that",
      "paragraph": 110,
      "file": "assets/longreads/illustrations/speckled-band-03.webp",
      "alt": "Roylott bends the fireplace poker",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-04",
      "before": "\"Stoke Moran?\" said he.",
      "after": "A heavily timbered park stretched up in a gentle slope, thickening into a grove at the highest point. From amid",
      "paragraph": 118,
      "file": "assets/longreads/illustrations/speckled-band-04.webp",
      "alt": "Arrival at the decaying Stoke Moran estate",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-05",
      "before": "A small side door led into the whitewashed corridor from which the three bedrooms opened. Holmes refused to examine the third chamber, so we",
      "after": "Miss Stoner did so, and Holmes, after a careful examination through the open window, endeavoured in every way to force",
      "paragraph": 140,
      "file": "assets/longreads/illustrations/speckled-band-05.webp",
      "alt": "Holmes examines the bedroom shutters",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-06",
      "before": "\"How very absurd! I never noticed that before.\"",
      "after": "\"No, it is not even attached to a wire. This is very interesting. You can see now that it is",
      "paragraph": 151,
      "file": "assets/longreads/illustrations/speckled-band-06.webp",
      "alt": "Dummy bell rope and small ventilator",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-07",
      "before": "\"No; we don't keep a cat. But there is a cheetah and a baboon.\"",
      "after": "\"Well, look at this!\" He took up a small saucer of milk which stood on the top of it.",
      "paragraph": 165,
      "file": "assets/longreads/illustrations/speckled-band-07.webp",
      "alt": "Milk saucer on the iron safe",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-08",
      "before": "How shall I ever forget that dreadful vigil? I could not hear a sound, not even the drawing of a breath, and yet I",
      "after": "Holmes had brought up a long thin cane, and this he placed upon the bed beside him. By it he",
      "paragraph": 233,
      "file": "assets/longreads/illustrations/speckled-band-08.webp",
      "alt": "Cane, matches and candle before the night vigil",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-09",
      "before": "\"What can it mean?\" I gasped.",
      "after": "But I saw nothing. At the moment when Holmes struck the light I heard a low, clear whistle, but the",
      "paragraph": 238,
      "file": "assets/longreads/illustrations/speckled-band-09.webp",
      "alt": "A terrible cry breaks the darkness",
      "width": 1400,
      "height": 700
    },
    {
      "id": "speckled-band-10",
      "before": "\"The band! the speckled band!\" whispered Holmes.",
      "after": "It was a singular sight which met our eyes. On the table stood a dark-lantern with the shutter half open,",
      "paragraph": 242,
      "file": "assets/longreads/illustrations/speckled-band-10.webp",
      "alt": "Roylott in his chair and the revealed band",
      "width": 1400,
      "height": 700
    }
  ],
  "sherlock-holmes-scandal-in-bohemia": [
    {
      "id": "scandal-in-bohemia-01",
      "before": "His manner was not effusive. It seldom was; but he was glad, I think, to see me. With hardly a word spoken, but with",
      "after": "One night—it was on the twentieth of March, 1888—I was returning from a journey to a patient (for I had",
      "paragraph": 4,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-01.webp",
      "alt": "Watson sees Holmes pacing through Baker Street windows",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-02",
      "before": "“This is indeed a mystery,” I remarked. “What do you imagine that it means?”",
      "after": "“There will call upon you tonight, at a quarter to eight o’clock,” it said, “a gentleman who desires to consult",
      "paragraph": 23,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-02.webp",
      "alt": "The mysterious appointment letter",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-03",
      "before": "“You had my note?” he asked with a deep harsh voice and a strongly marked German accent. “I told you that I would call.”",
      "after": "A man entered who could hardly have been less than six feet six inches in height, with the chest and",
      "paragraph": 43,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-03.webp",
      "alt": "The masked royal visitor enters",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-04",
      "before": "“And what of Irene Adler?” I asked.",
      "after": "“I then lounged down the street and found, as I expected, that there was a mews in a lane which",
      "paragraph": 130,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-04.webp",
      "alt": "Holmes disguised as a groom in the mews",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-05",
      "before": "“This is a very unexpected turn of affairs,” said I; “and what then?”",
      "after": "“I was half-dragged up to the altar, and before I knew where I was I found myself mumbling responses which",
      "paragraph": 144,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-05.webp",
      "alt": "Holmes unexpectedly witnesses the wedding",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-06",
      "before": "It was a quarter past six when we left Baker Street, and it still wanted ten minutes to the hour when we found ourselves",
      "after": "He disappeared into his bedroom and returned in a few minutes in the character of an amiable and simple-minded Nonconformist",
      "paragraph": 173,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-06.webp",
      "alt": "Holmes returns dressed as a clergyman",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-07",
      "before": "“Is the poor gentleman much hurt?” she asked.",
      "after": "As he spoke the gleam of the sidelights of a carriage came round the curve of the avenue. It was",
      "paragraph": 188,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-07.webp",
      "alt": "Irene steps out of her carriage at Briony Lodge",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-08",
      "before": "“You did it very nicely, Doctor,” he remarked. “Nothing could have been better. It is all right.”",
      "after": "Holmes had sat up upon the couch, and I saw him motion like a man who is in need of",
      "paragraph": 196,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-08.webp",
      "alt": "Smoke rises at the open drawing-room window",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-09",
      "before": "“MY DEAR MR. SHERLOCK HOLMES,—You really did it very well. You took me in completely. Until after the alarm of fire, I had not",
      "after": "“We shall see.” He pushed past the servant and rushed into the drawing-room, followed by the King and myself. The",
      "paragraph": 245,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-09.webp",
      "alt": "The abandoned room and letter by the bell pull",
      "width": 1400,
      "height": 700
    },
    {
      "id": "scandal-in-bohemia-10",
      "before": "And that was how a great scandal threatened to affect the kingdom of Bohemia, and how the best plans of Mr. Sherlock Holmes were",
      "after": "“I thank your Majesty. Then there is no more to be done in the matter. I have the honour to",
      "paragraph": 260,
      "file": "assets/longreads/illustrations/scandal-in-bohemia-10.webp",
      "alt": "Holmes leaves carrying the portrait",
      "width": 1400,
      "height": 700
    }
  ],
  "sherlock-holmes-red-headed-league": [
    {
      "id": "red-headed-league-01",
      "before": "“You could not possibly have come at a better time, my dear Watson,” he said cordially.",
      "after": "I had called upon my friend, Mr. Sherlock Holmes, one day in the autumn of last year and found him",
      "paragraph": 1,
      "file": "assets/longreads/illustrations/red-headed-league-01.webp",
      "alt": "Red-haired Jabez Wilson consults Holmes",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-02",
      "before": "“What on earth does this mean?” I exclaimed after I had twice read over the extraordinary announcement.",
      "after": "“TO THE RED-HEADED LEAGUE: On account of the bequest of the late Ezekiah Hopkins, of Lebanon, Pennsylvania, U.S.A., there is",
      "paragraph": 29,
      "file": "assets/longreads/illustrations/red-headed-league-02.webp",
      "alt": "The extraordinary newspaper advertisement",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-03",
      "before": "“Your experience has been a most entertaining one,” remarked Holmes as his client paused and refreshed his memory with a huge pinch of snuff.",
      "after": "“I never hope to see such a sight as that again, Mr. Holmes. From north, south, east, and west every",
      "paragraph": 57,
      "file": "assets/longreads/illustrations/red-headed-league-03.webp",
      "alt": "A crowd of red-haired applicants outside the office",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-04",
      "before": "“‘Certainly,’ I answered.",
      "after": "“‘Is to copy out the Encyclopædia Britannica. There is the first volume of it in that cupboard. You must find",
      "paragraph": 83,
      "file": "assets/longreads/illustrations/red-headed-league-04.webp",
      "alt": "Wilson copies the encyclopedia at the office desk",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-05",
      "before": "He held up a piece of white cardboard about the size of a sheet of note-paper. It read in this fashion:",
      "after": "“Yes, sir. And no later than this morning. I went to my work as usual at ten o’clock, but the",
      "paragraph": 91,
      "file": "assets/longreads/illustrations/red-headed-league-05.webp",
      "alt": "Wilson finds the closed office and dissolution notice",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-06",
      "before": "“Thank you,” said Holmes, “I only wished to ask you how you would go from here to the Strand.”",
      "after": "We travelled by the Underground as far as Aldersgate; and a short walk took us to Saxe-Coburg Square, the scene",
      "paragraph": 141,
      "file": "assets/longreads/illustrations/red-headed-league-06.webp",
      "alt": "Holmes taps the pavement outside the pawnshop",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-07",
      "before": "“You want to go home, no doubt, Doctor,” he remarked as we emerged.",
      "after": "My friend was an enthusiastic musician, being himself not only a very capable performer but a composer of no ordinary",
      "paragraph": 155,
      "file": "assets/longreads/illustrations/red-headed-league-07.webp",
      "alt": "Holmes listens to music in the concert hall",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-08",
      "before": "“You are not very vulnerable from above,” Holmes remarked as he held up the lantern and gazed about him.",
      "after": "We had reached the same crowded thoroughfare in which we had found ourselves in the morning. Our cabs were dismissed,",
      "paragraph": 177,
      "file": "assets/longreads/illustrations/red-headed-league-08.webp",
      "alt": "The investigators descend into the bank cellar",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-09",
      "before": "“It’s all clear,” he whispered. “Have you the chisel and the bags? Great Scott! Jump, Archie, jump, and I’ll swing for it!”",
      "after": "Its disappearance, however, was but momentary. With a rending, tearing sound, one of the broad, white stones turned over upon",
      "paragraph": 195,
      "file": "assets/longreads/illustrations/red-headed-league-09.webp",
      "alt": "A hand and face emerge through the stone floor",
      "width": 1400,
      "height": 700
    },
    {
      "id": "red-headed-league-10",
      "before": "“So I see,” the other answered with the utmost coolness. “I fancy that my pal is all right, though I see you have got",
      "after": "“It’s no use, John Clay,” said Holmes blandly. “You have no chance at all.”",
      "paragraph": 198,
      "file": "assets/longreads/illustrations/red-headed-league-10.webp",
      "alt": "Holmes arrests John Clay at the tunnel opening",
      "width": 1400,
      "height": 700
    }
  ],
  "sherlock-holmes-final-problem": [
    {
      "id": "final-problem-01",
      "before": "“You are afraid of something?” I asked.",
      "after": "The only light in the room came from the lamp upon the table at which I had been reading. Holmes",
      "paragraph": 4,
      "file": "assets/longreads/illustrations/final-problem-01.webp",
      "alt": "Holmes closes the consulting-room shutters",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-02",
      "before": "“The fact is that upon his entrance I had instantly recognised the extreme personal danger in which I lay. The only conceivable escape for",
      "after": "“My nerves are fairly proof, Watson, but I must confess to a start when I saw the very man who",
      "paragraph": 27,
      "file": "assets/longreads/illustrations/final-problem-02.webp",
      "alt": "Moriarty confronts Holmes in his rooms",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-03",
      "before": "I had often admired my friend’s courage, but never more than now, as he sat quietly checking off a series of incidents which must",
      "after": "“My dear Watson, Professor Moriarty is not a man who lets the grass grow under his feet. I went out",
      "paragraph": 48,
      "file": "assets/longreads/illustrations/final-problem-03.webp",
      "alt": "Holmes jumps clear of the fast two-horse van",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-04",
      "before": "So far all had gone admirably. My luggage was waiting for me, and I had no difficulty in finding the carriage which Holmes had",
      "after": "In the morning I obeyed Holmes’s injunctions to the letter. A hansom was procured with such precaution as would prevent",
      "paragraph": 59,
      "file": "assets/longreads/illustrations/final-problem-04.webp",
      "alt": "Watson boards the brougham after crossing Lowther Arcade",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-05",
      "before": "“My dear Watson,” said a voice, “you have not even condescended to say good-morning.”",
      "after": "So far all had gone admirably. My luggage was waiting for me, and I had no difficulty in finding the",
      "paragraph": 60,
      "file": "assets/longreads/illustrations/final-problem-05.webp",
      "alt": "Watson and the disguised Italian priest in the reserved carriage",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-06",
      "before": "“There he goes,” said Holmes, as we watched the carriage swing and rock over the points. “There are limits, you see, to our friend’s",
      "after": "Far away, from among the Kentish woods there rose a thin spray of smoke. A minute later a carriage and",
      "paragraph": 95,
      "file": "assets/longreads/illustrations/final-problem-06.webp",
      "alt": "The fugitives watch the special train pass Canterbury",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-07",
      "before": "And yet for all his watchfulness he was never depressed. On the contrary, I can never recollect having seen him in such exuberant spirits.",
      "after": "Once, I remember, as we passed over the Gemmi, and walked along the border of the melancholy Daubensee, a large",
      "paragraph": 106,
      "file": "assets/longreads/illustrations/final-problem-07.webp",
      "alt": "A falling rock crashes into the Daubensee",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-08",
      "before": "The path has been cut half-way round the fall to afford a complete view, but it ends abruptly, and the traveler has to return",
      "after": "It was on the 3rd of May that we reached the little village of Meiringen, where we put up at",
      "paragraph": 109,
      "file": "assets/longreads/illustrations/final-problem-08.webp",
      "alt": "Holmes and Watson contemplate Reichenbach Falls",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-09",
      "before": "The appeal was one which could not be ignored. It was impossible to refuse the request of a fellow-countrywoman dying in a strange land.",
      "after": "The path has been cut half-way round the fall to afford a complete view, but it ends abruptly, and the",
      "paragraph": 110,
      "file": "assets/longreads/illustrations/final-problem-09.webp",
      "alt": "A Swiss messenger brings Watson the hotel letter",
      "width": 1400,
      "height": 700
    },
    {
      "id": "final-problem-10",
      "before": "“My dear Watson,” he said, “I write these few lines through the courtesy of Mr. Moriarty, who awaits my convenience for the final discussion",
      "after": "I stood for a minute or two to collect myself, for I was dazed with the horror of the thing.",
      "paragraph": 120,
      "file": "assets/longreads/illustrations/final-problem-10.webp",
      "alt": "Watson discovers the cigarette case and farewell note",
      "width": 1400,
      "height": 700
    }
  ],
  "sherlock-holmes-hound-of-the-baskervilles": [
    {
      "id": "hound-of-the-baskervilles-01",
      "before": "“Well, Watson, what do you make of it?”",
      "after": "Mr. Sherlock Holmes, who was usually very late in the mornings, save upon those not infrequent occasions when he was",
      "paragraph": 12,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-01.webp",
      "alt": "Watson studies the visitor’s walking stick",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-02",
      "before": "“Of the origin of the Hound of the Baskervilles there have been many statements, yet as I come in a direct line from Hugo",
      "after": "Holmes leaned back in his chair, placed his finger-tips together, and closed his eyes, with an air of resignation. Dr.",
      "paragraph": 82,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-02.webp",
      "alt": "Mortimer reads the old family manuscript",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-03",
      "before": "“This is Sir Henry Baskerville,” said Dr. Mortimer.",
      "after": "Our breakfast table was cleared early, and Holmes waited in his dressing-gown for the promised interview. Our clients were punctual",
      "paragraph": 239,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-03.webp",
      "alt": "Sir Henry arrives at Baker Street",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-04",
      "before": "“There now!” said Holmes bitterly as he emerged panting and white with vexation from the tide of vehicles. “Was ever such bad luck and",
      "after": "“There’s our man, Watson! Come along! We’ll have a good look at him, if we can do no more.” At",
      "paragraph": 315,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-04.webp",
      "alt": "The black-bearded watcher escapes in the cab",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-05",
      "before": "“Welcome, Sir Henry! Welcome to Baskerville Hall!”",
      "after": "The avenue opened into a broad expanse of turf, and the house lay before us. In the fading light I",
      "paragraph": 520,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-05.webp",
      "alt": "First view of Baskerville Hall at dusk",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-06",
      "before": "“You will, I am sure, excuse my presumption, Dr. Watson,” said he as he came panting up to where I stood. “Here on the",
      "after": "It seemed hopeless to pursue the inquiry any farther, but it was clear that in spite of Holmes’s ruse we",
      "paragraph": 560,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-06.webp",
      "alt": "Stapleton meets Watson carrying his butterfly net",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-07",
      "before": "Chapter 9. The Light upon the Moor [Second Report of Dr. Watson]",
      "after": "Barrymore was crouching at the window with the candle held against the glass. His profile was half turned towards me,",
      "paragraph": 685,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-07.webp",
      "alt": "Barrymore signals into the night from the window",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-08",
      "before": "I wished to go in that direction and to search the tor, but it was some distance away. The baronet’s nerves were still quivering",
      "after": "And it was at this moment that there occurred a most strange and unexpected thing. We had risen from our",
      "paragraph": 800,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-08.webp",
      "alt": "An anonymous silhouette stands on the moonlit tor",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-09",
      "before": "With long bounds the huge black creature was leaping down the track, following hard upon the footsteps of our friend. So paralyzed were we",
      "after": "“Hist!” cried Holmes, and I heard the sharp click of a cocking pistol. “Look out! It’s coming!” There was a",
      "paragraph": 1267,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-09.webp",
      "alt": "The huge dark hound bursts from the fog",
      "width": 1400,
      "height": 700
    },
    {
      "id": "hound-of-the-baskervilles-10",
      "before": "“The whole course of events,” said Holmes, “from the point of view of the man who called himself Stapleton was simple and direct, although",
      "after": "It was the end of November, and Holmes and I sat, upon a raw and foggy night, on either side",
      "paragraph": 1305,
      "file": "assets/longreads/illustrations/hound-of-the-baskervilles-10.webp",
      "alt": "Holmes and Watson discuss the case by the Baker Street fire",
      "width": 1400,
      "height": 700
    }
  ]
};
function longReadIllustrationBefore(book,text,paragraph){
  if(book.longReadId==='backroom-homeward-bound')
    return HOMEWARD_ILLUSTRATIONS.find(image=>String(text||'').startsWith(image.before))||null;
  return (HOLMES_ILLUSTRATIONS[book.longReadId]||[]).find(image=>
    image.paragraph===paragraph && String(text||'').startsWith(image.before) &&
    String(book.paras[paragraph-1]||'').startsWith(image.after))||null;
}
/* Source-led roles change presentation only, including the long Chapter 9 title.
   Exact source blocks guard user-edited copies; no invented subtitles or blocks. */
const HOLMES_HOUND_CHAPTERS = {
  "10": "Chapter 1. Mr. Sherlock Holmes",
  "69": "Chapter 2. The Curse of the Baskervilles",
  "110": "Chapter 3. The Problem",
  "237": "Chapter 4. Sir Henry Baskerville",
  "346": "Chapter 5. Three Broken Threads",
  "476": "Chapter 6. Baskerville Hall",
  "541": "Chapter 7. The Stapletons of Merripit House",
  "659": "Chapter 8. First Report of Dr. Watson",
  "685": "Chapter 9. The Light upon the Moor [Second Report of Dr. Watson]",
  "801": "Chapter 10. Extract from the Diary of Dr. Watson",
  "880": "Chapter 11. The Man on the Tor",
  "982": "Chapter 12. Death on the Moor",
  "1122": "Chapter 13. Fixing the Nets",
  "1234": "Chapter 14. The Hound of the Baskervilles",
  "1303": "Chapter 15. A Retrospection"
};
const HOLMES_HOUND_FRONTMATTER = {
  "0": {
    "text": "THE HOUND OF THE BASKERVILLES",
    "role": "title"
  },
  "1": {
    "text": "Another Adventure of Sherlock Holmes by A. Conan Doyle",
    "role": "subtitle"
  },
  "2": {
    "text": "My dear Robinson,",
    "role": "dedication"
  },
  "3": {
    "text": "It was to your account of a West-Country legend that this tale owes its inception. For this and for your help in the details all thanks.",
    "role": "dedication"
  },
  "4": {
    "text": "Yours most truly,",
    "role": "signature"
  },
  "5": {
    "text": "A. Conan Doyle.",
    "role": "signature"
  },
  "6": {
    "text": "Hindhead,",
    "role": "signature"
  },
  "7": {
    "text": "Haslemere.",
    "role": "signature"
  },
  "8": {
    "text": "Contents",
    "role": "contents-heading"
  },
  "9": {
    "text": "Chapter 1 Mr. Sherlock Holmes Chapter 2 The Curse of the Baskervilles Chapter 3 The Problem Chapter 4 Sir Henry Baskerville Chapter 5 Three Broken Threads Chapter 6 Baskerville Hall Chapter 7 The Stapletons of Merripit House Chapter 8 First Report of Dr. Watson Chapter 9 The Light upon the Moor [Second Report of Dr. Watson] Chapter 10 Extract from the Diary of Dr. Watson Chapter 11 The Man on the Tor Chapter 12 Death on the Moor Chapter 13 Fixing the Nets Chapter 14 The Hound of the Baskervilles Chapter 15 A Retrospection",
    "role": "contents"
  }
};
function longReadBlockRole(book,block){
  if(book.longReadId==='sherlock-holmes-hound-of-the-baskervilles'){
    if(HOLMES_HOUND_CHAPTERS[block.f]===block.t)return 'chapter';
    const front=HOLMES_HOUND_FRONTMATTER[block.f];
    if(front?.text===block.t)return front.role;
    if(block.t==='THE END'&&block.f===book.paras.length-1)return 'end';
  }
  if(book.longReadId==='sherlock-holmes-scandal-in-bohemia'&&/^(I|II|III)\.$/.test(block.t))return 'section';
  return '';
}
const longReadAttribution = read => ({
  title:read.originalTitle, author:read.author, sourceName:read.site,
  sourceUrl:read.sourceUrl, sources:read.sources,
  license:read.license, licenseUrl:read.licenseUrl,
  editionNote:read.editionNote, glossary:read.glossary,
});
/* The legacy extension is optional preparation for the selected book, never a
   launch dependency. A durable checkpoint keeps its old text anchor recoverable
   if termination falls between the IndexedDB commit and local position write. */
function restoreHomewardUpgradePosition(book){
  const checkpoint=book.homewardUpgradePosition;
  if(!checkpoint||book.paras.length!==107)return;
  if(JSON.stringify(positions[book.id])!==JSON.stringify(checkpoint.before))return;
  positions[book.id]={...checkpoint.after};
  save(LS_POS,positions);
}
async function upgradeHomewardLongRead(book,alive=()=>true,signal){
  const read=LONG_READS.find(item=>item.id==='backroom-homeward-bound');
  if(!read||!book||book.longReadId!==read.id||book.kind!=='txt'||!alive())return;
  if(books.find(item=>item.id===book.id)!==book)return;
  // Do not replace a source already on screen, even if opened again by a caller.
  if(curBook===book&&activeAppView()==='read')return;
  restoreHomewardUpgradePosition(book);
  if(book.paras.length!==61)return;
  const source=JSON.stringify(book),position=JSON.stringify(positions[book.id]);
  const accountEpoch=typeof syncSessionEpoch==='number'?syncSessionEpoch:null;
  const unchanged=()=>books.find(item=>item.id===book.id)===book
    &&(typeof syncSessionEpoch!=='number'||syncSessionEpoch===accountEpoch)
    &&JSON.stringify(book)===source&&JSON.stringify(positions[book.id])===position
    &&!(curBook===book&&activeAppView()==='read');
  const current=()=>alive()&&!signal?.aborted&&unchanged();
  const controller=new AbortController(),cancel=()=>controller.abort();
  const timer=setTimeout(cancel,3000);
  signal?.addEventListener('abort',cancel,{once:true});
  try{
    const response=await fetch(read.file,{signal:controller.signal});
    if(!response.ok||!current())return;
    const combined=parseTXT(await response.text(),{preserveParagraphs:true});
    if(!current()||controller.signal.aborted||combined.length!==107
        ||!book.paras.every((paragraph,index)=>paragraph===combined[index]))return;
    const upgraded={...book,paras:combined,formatting:null,
      fingerprint:bookContentFingerprint(combined),originalTitle:read.originalTitle,
      attribution:longReadAttribution(read)};
    const before=positions[book.id];
    if(before){
      const oldIndex=before.pi==null?(before.p||0)*(book.paras.length-1):before.pi;
      upgraded.homewardUpgradePosition={before:{...before},after:{...before,
        p:Math.max(0,Math.min(1,oldIndex/(combined.length-1)))}};
    }
    const db=await idb();
    if(!current()||controller.signal.aborted)return;
    const committed=await localTransaction(db,'books','readwrite',(tx,done)=>{
      const store=tx.objectStore('books'),request=store.get(book.id);
      request.onsuccess=()=>{
        // A concurrent delete, edit or replacement owns the stored record.
        if(!current()||controller.signal.aborted||JSON.stringify(request.result)!==source){done(false);return;}
        store.put(upgraded,book.id);done(true);
      };
    });
    // Navigation can cancel presentation after the transaction has committed.
    // Reflect that durable result only in unchanged, inactive local memory; a
    // changed account, replacement or already visible Reader remains untouched.
    if(!committed||!unchanged())return;
    Object.assign(book,upgraded);
    restoreHomewardUpgradePosition(book);
  }catch(error){
    // Offline, timeout or failed persistence keeps the local chapter readable.
    if(error?.name!=='AbortError')console.warn('Local Homeward edition retained:',error);
  }finally{
    clearTimeout(timer);signal?.removeEventListener('abort',cancel);
  }
}
function pendingLongReads(){
  const owned=new Set(books.map(book=>book.longReadId).filter(Boolean));
  return LONG_READS.filter(read=>!read.dormant&&!owned.has(read.id));
}

let longReadBusy=false;
async function importLongRead(read,card,options={}){
  if(longReadBusy)return;
  const owned=books.find(book=>book.longReadId===read.id);
  if(owned){
    if(!owned.cover)await applyLongReadCover(read,options);
    return owned;
  }
  longReadBusy=true;
  if(card)card.classList.add('busy');
  try{
    // Reuse the worker's versioned-asset verification before it caches bytes.
    const fileUrl=read.sha256?`${read.file}?v=${read.sha256.slice(0,8)}`:read.file;
    const response=await fetch(fileUrl,{signal:options.signal});
    if(!response.ok)throw new Error('HTTP '+response.status);
    const text=await response.text();
    if(text.trim().length<100)throw new Error('Text book is empty');
    if(read.sha256){
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
      const hash=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
      if(hash!==read.sha256)throw new Error('Text book is incomplete or has changed');
    }
    if(options.signal?.aborted)return null;
    const file=new File([text],`${read.id}.txt`,{type:'text/plain'});
    const imported=await importFile(file,{
      title:read.title, author:read.author, longReadId:read.id,
      originalTitle:read.originalTitle, sourceUrl:read.sourceUrl, site:read.site,
      attribution:longReadAttribution(read), coverPosition:read.coverPosition,
    },{preserveParagraphs:true,signal:options.signal});
    await applyLongReadCover(read,options);
    return imported&&books.find(book=>book.id===imported.bookId)||null;
  }catch(error){
    if(options.signal?.aborted)return null;
    console.error(error);
    toast('긴 글을 준비하지 못했어요 — 잠시 뒤 다시 눌러 보세요');
    return null;
  }finally{
    longReadBusy=false;
    if(card)card.classList.remove('busy');
  }
}
async function applyLongReadCover(read,options={}){
  if(!read.cover)return;
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);
  const abort=()=>controller.abort();
  if(options.signal?.aborted)controller.abort();
  options.signal?.addEventListener('abort',abort,{once:true});
  try{
    const book=books.find(item=>item.longReadId===read.id);
    if(!book||(options.onlyMissing&&book.cover))return;
    const response=await fetch(read.cover,{signal:controller.signal});
    if(!response.ok)return;
    const blob=await response.blob();
    if(!blob.size||!/^image\/(jpeg|png|gif|webp)$/i.test(blob.type))return;
    // A saved book may be deleted or receive a custom cover while fetching.
    if(!books.includes(book)||(options.onlyMissing&&book.cover))return;
    const key=book.id+(options.onlyMissing?'|bundled-cover':'|cover');
    await imgPut(key,blob);
    if(!books.includes(book)||(options.onlyMissing&&book.cover))return;
    book.cover=key;book.coverPosition=read.coverPosition;
    await bookPut(book);renderAllBookViews();
  }catch(error){console.warn('긴 글 표지를 씌우지 못했습니다:',error&&error.message);}
  finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',abort);}
}
async function restoreMissingLongReadCovers(){
  for(const read of LONG_READS){
    if(read.cover&&books.some(book=>book.longReadId===read.id&&!book.cover))
      await applyLongReadCover(read,{onlyMissing:true});
  }
}
function longReadCard(read){
  const card=el('div','bookcard classic longread');
  card.dataset.longreadId=read.id;
  card.innerHTML=`<img class="cover" alt="" hidden>
    <div class="author"></div><div class="bt"></div>
    <div class="get">미리보기</div>`;
  fillCard(card,{'.author':read.series,'.bt':read.title});
  const image=card.querySelector('.cover');
  image.onload=()=>{image.hidden=false;card.classList.add('has-cover');};
  image.style.objectPosition=read.coverPosition;
  if(read.cover)image.src=read.cover;
  card.title=`${read.originalTitle} · ${read.author} · ${read.series}`;
  accessibleLibraryCard(card,read.title);
  card.onclick=()=>openLongReadPreviewOrReader(read);
  return card;
}
