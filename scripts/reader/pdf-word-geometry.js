/* Pure PDF word-box geometry shared by the original reader and its tests.
   Everything here works in viewport pixels and never touches the DOM. */

function pdfFontAscentRatio(style){
  const rawAscent=Number(style&&style.ascent);
  const rawDescent=Math.abs(Number(style&&style.descent));
  let ratio=Number.isFinite(rawAscent)&&rawAscent>0 ? rawAscent : .8;

  /* Some embedded fonts describe their full design box instead of a normal
     reading line. Charis SIL in Holes is one example: 1.196 / -0.439. Using
     that ascent literally puts the whole hit box above the visible word.
     Only normalize metrics whose combined height is clearly exceptional;
     ordinary PDFs therefore keep their previous position. */
  const metricSpan=ratio+(Number.isFinite(rawDescent) ? rawDescent : 0);
  if(metricSpan>1.25) ratio=ratio/metricSpan;

  return Math.max(.55,Math.min(.95,ratio));
}

function pdfWordBounds(origin,direction,normal,offset,width,ascent,height){
  const baseX=origin.x+direction.x*offset;
  const baseY=origin.y+direction.y*offset;
  const topX=baseX+normal.x*ascent;
  const topY=baseY+normal.y*ascent;
  const endX=topX+direction.x*width;
  const endY=topY+direction.y*width;
  const bottomX=topX-normal.x*height;
  const bottomY=topY-normal.y*height;
  const farX=endX-normal.x*height;
  const farY=endY-normal.y*height;
  return {
    left:Math.min(topX,endX,bottomX,farX),
    top:Math.min(topY,endY,bottomY,farY),
    right:Math.max(topX,endX,bottomX,farX),
    bottom:Math.max(topY,endY,bottomY,farY),
  };
}

/* ---------------------------------------------------------------------------
   A PDF has no words, only positioned text items. Many books hand out one item
   per line, but plenty — Verity among them — hand out one item per glyph:

     "t" x=72   "h" x=76   "e" x=83.2   " " x=89.6   "t" x=93.4 …

   Tokenising each item on its own then turns every single letter into a word,
   so the reader underlines every "h" it has ever saved and a tap looks up the
   letter instead of the word. Items are therefore put back on their shared
   baseline first; only the rebuilt line is tokenised. Word spacing comes from
   the horizontal gaps, exactly like the importer's line rebuilder, because a
   space item's reported width cannot be trusted (Verity reports 0.26pt for a
   gap that measures 3.8pt).
--------------------------------------------------------------------------- */

const PDF_WORD_PATTERN=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;
/* A same-baseline neighbour is part of this line; anything further across is
   another line, and a gap wider than this is another column or a leader dot. */
const PDF_LINE_ACROSS=.35, PDF_LINE_BACK=.6, PDF_LINE_AHEAD=2.5, PDF_SPACE_GAP=.16;

/* `transform` and `width` are already in viewport pixels; `ascentRatio` is what
   pdfFontAscentRatio() resolved for this item's font. */
function pdfTextEntry(transform,text,width,ascentRatio,fontFamily){
  const angle=Math.atan2(transform[1],transform[0]);
  const fontHeight=Math.max(1,Math.hypot(transform[2],transform[3]));
  const ratio=Number(ascentRatio)>0 ? Number(ascentRatio) : .8;
  return {
    text:String(text||''),
    angle,
    direction:{x:Math.cos(angle),y:Math.sin(angle)},
    normal:{x:Math.sin(angle),y:-Math.cos(angle)},
    origin:{x:transform[4],y:transform[5]},
    fontHeight,
    ascent:ratio*fontHeight,
    width:Math.max(0,Number(width)||0),
    fontFamily:fontFamily||'sans-serif',
  };
}

/* Distance from the line's origin: `along` runs with the text, `across` is the
   perpendicular offset that tells two stacked lines apart. */
function pdfEntryOffsets(line,entry){
  const dx=entry.origin.x-line.origin.x;
  const dy=entry.origin.y-line.origin.y;
  return {
    along:dx*line.direction.x+dy*line.direction.y,
    across:dx*line.normal.x+dy*line.normal.y,
  };
}

function pdfLineFits(line,entry){
  if(Math.abs(line.angle-entry.angle)>.02) return false;
  const height=Math.max(line.fontHeight,entry.fontHeight);
  const {along,across}=pdfEntryOffsets(line,entry);
  if(Math.abs(across)>height*PDF_LINE_ACROSS) return false;
  return along>line.cursor-height*PDF_LINE_BACK && along<line.cursor+height*PDF_LINE_AHEAD;
}

function pdfStartLine(entry){
  return {angle:entry.angle,origin:entry.origin,direction:entry.direction,normal:entry.normal,
          fontHeight:entry.fontHeight,cursor:0,text:'',chars:[]};
}

function pdfAppendEntry(line,entry,measureText){
  const {along}=pdfEntryOffsets(line,entry);
  const height=Math.max(line.fontHeight,entry.fontHeight);
  if(line.text && along-line.cursor>Math.max(height*PDF_SPACE_GAP,.4)
      && !/\s$/.test(line.text) && !/^\s/.test(entry.text)){
    line.text+=' ';
    line.chars.push({start:line.cursor,end:along,ascent:entry.ascent,height:entry.fontHeight});
  }
  const measured=Math.max(0,measureText(entry.text,entry));
  /* pdf.js occasionally reports a zero width. The measured width is already in
     the item's own pixel size, so it is a usable stand-in for the advance. */
  const advance=entry.width>0 ? entry.width : measured;
  const unit=entry.width>0&&measured>0 ? entry.width/measured : 1;
  let previous=0;
  for(let index=0; index<entry.text.length; index++){
    const through=Math.max(previous,measureText(entry.text.slice(0,index+1),entry));
    line.chars.push({start:along+previous*unit,end:along+through*unit,
                     ascent:entry.ascent,height:entry.fontHeight});
    previous=through;
  }
  line.text+=entry.text;
  line.cursor=along+advance;
  line.fontHeight=Math.max(line.fontHeight,entry.fontHeight);
}

function pdfTextLines(entries,measureText){
  const measure=typeof measureText==='function' ? measureText : (value=>value.length);
  const lines=[];
  let line=null;
  for(const entry of entries||[]){
    /* Whitespace-only items carry no glyph and an unreliable width; the gap
       they leave behind is what actually separates the words. */
    if(!entry || !entry.text || !entry.text.trim()) continue;
    if(!line || !pdfLineFits(line,entry)){ line=pdfStartLine(entry); lines.push(line); }
    pdfAppendEntry(line,entry,measure);
  }
  return lines;
}

/* Word boxes are stored as page-size ratios so they survive a width change
   (the dictionary panel opening, a rotation) without being recomputed. */
function pdfLineWordBoxes(lines,pageWidth,pageHeight){
  const boxes=[];
  let text='';
  (lines||[]).forEach(line=>{
    if(text) text+=' ';
    const base=text.length;
    text+=line.text;
    PDF_WORD_PATTERN.lastIndex=0;
    let match;
    while((match=PDF_WORD_PATTERN.exec(line.text))){
      const span=line.chars.slice(match.index,match.index+match[0].length);
      if(!span.length) continue;
      const first=span[0], last=span[span.length-1];
      const ascent=span.reduce((max,item)=>Math.max(max,item.ascent),0);
      const height=span.reduce((max,item)=>Math.max(max,item.height),0);
      const bounds=pdfWordBounds(line.origin,line.direction,line.normal,
        first.start,Math.max(1,last.end-first.start),ascent,height);
      const left=Math.max(0,Math.min(pageWidth,bounds.left));
      const top=Math.max(0,Math.min(pageHeight,bounds.top));
      const right=Math.max(left,Math.min(pageWidth,bounds.right));
      const bottom=Math.max(top,Math.min(pageHeight,bounds.bottom));
      boxes.push({
        word:match[0],
        x:left/pageWidth,
        y:top/pageHeight,
        w:Math.max(1,right-left)/pageWidth,
        h:Math.max(1,bottom-top)/pageHeight,
        /* Character offset of this very occurrence inside `text`. Repeated
           words therefore keep their own sentence instead of the first one. */
        offset:base+match.index,
      });
    }
  });
  return {boxes,text};
}

function pdfPageWords(entries,measureText,pageWidth,pageHeight){
  return pdfLineWordBoxes(pdfTextLines(entries,measureText),pageWidth,pageHeight);
}
