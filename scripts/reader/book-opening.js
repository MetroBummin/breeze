/* A book opening is presentation, not a new copy of the text.
   Paragraphs, lookup indices and saved positions stay as imported.
   The story renderer used to paint every source line on its own, so a
   title-page dedication stayed as separate lines on the same card as the
   epigraph, and the author was printed again under a source line that
   already named them. Printed verse indent stays as published. */

function composeBookOpening(blocks){
  if(!Array.isArray(blocks)) return blocks;
  const chapterAt=blocks.findIndex(block=>block&&(block.bookRole==='chapter'||block.bookRole==='section'));
  const end=chapterAt<0?blocks.length:chapterAt;
  for(let index=0; index<end; index++){
    const block=blocks[index];
    if(!block||block.bookRole!=='inscription') continue;
    const previous=index>0?blocks[index-1]:null;
    block.openingDedication=true;
    block.openingDedicationLead=!previous||!previous.openingDedication;
  }
  for(let index=0; index<end; index++){
    const block=blocks[index];
    if(!block) continue;
    const previous=index>0?blocks[index-1]:null;
    if(block.bookRole==='verse'){
      if(previous&&previous.bookRole!=='verse') block.before='page';
    }else if(block.bookRole==='signature'&&previous&&previous.bookRole==='verse'){
      block.openingAttribution=true;
    }
  }
  return blocks;
}

/* True when the opening already shows this author, so the source line
   should keep the site and the original link without repeating the name. */
function openingRepeatsAuthor(info){
  const author=String(info&&info.author||'').trim();
  if(!author) return false;
  if(info.byline) return true;
  const last=author.split(/\s+/).pop();
  return (info.front||[]).some(paragraph=>{
    const text=String(paragraph||'');
    return text.includes(author)||(!!last&&/\bby\b/.test(text)&&text.includes(last));
  });
}
