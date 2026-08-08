/* ================= 원본 형식 표 =================
   PDF와 EPUB은 여덟 가지 일을 각자의 방식으로 합니다. 예전에는 그 일을
   부르는 자리마다 `kind==='pdf' ? … : …` 를 적었고, 스물네 군데였습니다.
   분기를 하나씩 고치는 대신 표를 하나 둡니다.

   세 번째 형식을 붙일 때 손댈 곳은 여기 한 줄과 그 형식의 파일뿐입니다.
   부르는 쪽은 형식을 몰라도 됩니다.

   pdf-original.js 와 epub-original.js 가 먼저 실행되어야 하므로
   index.html 에서 그 뒤에 놓입니다. */

const ORIGINAL_FORMATS = {
  pdf: {
    open:               openOriginalPdf,
    captureAnchor:      capturePdfAnchor,
    restoreAnchor:      restorePdfAnchor,
    anchorFromProgress: pdfAnchorFromProgress,
    progress:           pdfSourceProgress,
    sentenceBridge:     pdfSentenceBridge,
    restoreSentence:    restorePdfSentence,
    refreshSavedWords:  refreshPdfSavedWords,
  },
  epub: {
    open:               openOriginalEpub,
    captureAnchor:      captureEpubAnchor,
    restoreAnchor:      restoreEpubAnchor,
    anchorFromProgress: epubAnchorFromProgress,
    progress:           epubSourceProgress,
    sentenceBridge:     epubSentenceBridge,
    restoreSentence:    restoreEpubSentence,
    refreshSavedWords:  refreshEpubSavedWords,
  },
};

/* 이 책을 원본으로 열 수 있는가. 붙여넣은 글과 TXT에는 원본이 영영 없으므로
   전환 버튼을 아예 내지 않습니다. */
function bookSupportsOriginal(book){
  if(!book) return false;
  const kind = book.kind || (book.original && book.original.kind) || '';
  if(kind) return !!ORIGINAL_FORMATS[kind];
  // 형식을 저장하지 않던 시절의 책: 원본 좌표 지도가 있으면 PDF·EPUB입니다.
  return !!(book.sourceMap && book.sourceMap.length);
}
