/* Korean display titles for the 고전 row and its preview. Display only: the
   catalog `title`, saved book titles, file names and title-based lookups such
   as classicForMeta stay English. Unknown ids keep their English title. */
const CLASSIC_KOREAN_TITLES = {
  'pride-and-prejudice':'오만과 편견',
  'alice-in-wonderland':'이상한 나라의 앨리스',
  'sherlock-holmes-a-study-in-scarlet':'주홍색 연구',
  'sherlock-holmes-the-sign-of-the-four':'네 개의 서명',
  'sherlock-holmes-scandal-in-bohemia':'보헤미아 왕국의 스캔들',
  'sherlock-holmes-red-headed-league':'빨간 머리 연맹',
  'sherlock-holmes-speckled-band':'얼룩 끈',
  'sherlock-holmes-final-problem':'마지막 사건',
  'sherlock-holmes-hound-of-the-baskervilles':'바스커빌 가의 개',
  'sherlock-holmes-the-valley-of-fear':'공포의 계곡',
  'the-great-gatsby':'위대한 개츠비',
  'frankenstein':'프랑켄슈타인',
  'great-expectations':'위대한 유산',
  'little-women':'작은 아씨들',
  'odyssey':'오디세이아',
};
function classicDisplayTitle(read){
  return read&&Object.prototype.hasOwnProperty.call(CLASSIC_KOREAN_TITLES,read.id)
    ? CLASSIC_KOREAN_TITLES[read.id] : String(read&&read.title||'');
}
