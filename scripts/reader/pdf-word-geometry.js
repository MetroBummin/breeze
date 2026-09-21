/* PDF.js 3.11 glyph advances are the geometry source for both lookup and paint.
   No browser fonts, DOM ranges, or independent text-width measurements.
   This small adapter follows CanvasGraphics' text state (canvas.js in the
   pinned PDF.js release). Keep its operator/position tests when upgrading. */

function pdfMatrix(a,b){
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],
    a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],
    a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}
function pdfPoint(m,x,y){ return {x:m[0]*x+m[2]*y+m[4],y:m[1]*x+m[3]*y+m[5]}; }
function pdfGlyphBounds(matrix,left,bottom,right,top){
  const points=[pdfPoint(matrix,left,bottom),pdfPoint(matrix,right,bottom),
    pdfPoint(matrix,left,top),pdfPoint(matrix,right,top)];
  return {left:Math.min(...points.map(p=>p.x)),top:Math.min(...points.map(p=>p.y)),
    right:Math.max(...points.map(p=>p.x)),bottom:Math.max(...points.map(p=>p.y))};
}
function pdfFontExtents(font){
  if(Number.isFinite(font.ascent)&&Number.isFinite(font.descent)&&font.ascent>font.descent)
    return {top:font.ascent,bottom:font.descent};
  const m=font.fontMatrix||[.001,0,0,.001,0,0];
  if(font.bbox){
    const b=pdfGlyphBounds(m,...font.bbox);
    return {top:b.bottom,bottom:b.top};
  }
  // A font without metrics still has its PDF em square. Never invent widths.
  return {top:1,bottom:0};
}

function pdfOperatorEntries(operatorList,fonts,viewport,ops,isVisible=group=>true){
  const identity=[1,0,0,1,0,0];
  let state={ctm:viewport.transform,textMatrix:identity,font:null,fontSize:0,
    direction:1,hScale:1,charSpacing:0,wordSpacing:0,leading:0,rise:0,
    x:0,y:0,lineX:0,lineY:0,mask:false};
  const stack=[],visibility=[true],entries=[];
  const save=()=>stack.push({...state});
  const restore=()=>{ if(stack.length) state=stack.pop(); };
  const setFont=(id,size)=>{
    state.font=fonts.get(id);state.fontSize=Math.abs(size);state.direction=size<0?-1:1;
  };
  const move=(x,y)=>{state.x=state.lineX+=x;state.y=state.lineY+=y;};
  const show=glyphs=>{
    const s=state,font=s.font,size=s.fontSize;
    if(!font||!size) return;
    const fm=font.fontMatrix||[.001,0,0,.001,0,0],extents=pdfFontExtents(font);
    const hScale=s.hScale*s.direction,vertical=font.vertical&&!font.isType3Font;
    let matrix=pdfMatrix(s.ctm,s.textMatrix);
    matrix=pdfMatrix(matrix,[1,0,0,1,s.x,s.y+(font.isType3Font?0:s.rise)]);
    matrix=pdfMatrix(matrix,[hScale,0,0,s.direction,0,0]);
    const origin=pdfPoint(matrix,0,0);
    const axis=vertical ? {x:-matrix[2],y:-matrix[3]} : {x:matrix[0],y:matrix[1]};
    const axisLength=Math.hypot(axis.x,axis.y);
    if(!axisLength) return;
    const direction={x:axis.x/axisLength,y:axis.y/axisLength};
    const entry={text:'',chars:[],origin,direction,normal:{x:direction.y,y:-direction.x},
      angle:Math.atan2(direction.y,direction.x),fontHeight:Math.hypot(matrix[2],matrix[3])*size,width:0};
    let advance=0,pendingGap=0;
    for(const glyph of glyphs){
      if(typeof glyph==='number'){
        const gap=(vertical?1:-1)*glyph*size/1000;
        advance+=gap;pendingGap+=gap;continue;
      }
      // TJ may express a word separator without a Unicode space. Keep that
      // separator in the lookup text without assigning it any glyph rectangle.
      if(pendingGap>size*PDF_SPACE_GAP&&entry.text&&!/\s$/.test(entry.text)&&!/^\s/.test(glyph.unicode||'')){
        entry.text+=' ';entry.chars.push(null);
      }
      pendingGap=0;
      const spacing=(glyph.isSpace?s.wordSpacing:0)+s.charSpacing;
      let width=glyph.width*size*fm[0],left=advance,baseline=0,step;
      if(vertical){
        const vm=glyph.vmetric||font.defaultVMetrics;
        if(!vm) continue;
        left=-(glyph.vmetric?vm[1]:glyph.width/2)*size*fm[0];
        baseline=-(advance+vm[2]*size*fm[0]);
        step=-vm[0]*size*fm[0]-spacing*s.direction;
      }else if(font.isType3Font){
        width=pdfPoint(fm,glyph.width,0).x*size;
        step=width+spacing;
      }else step=width+spacing*s.direction;
      const bounds=pdfGlyphBounds(matrix,left,baseline+extents.bottom*size,
        left+width,baseline+extents.top*size);
      // A Unicode ligature may expand to several characters. Each character
      // retains the same indivisible glyph geometry, never a guessed fraction.
      const text=glyph.unicode||'';
      for(let i=0;i<text.length;i++) entry.chars.push(bounds);
      entry.text+=text;
      advance+=step;
    }
    entry.width=advance*axisLength;
    if(vertical) s.y-=advance;
    else s.x+=advance*hScale;
    // Invisible text may be the OCR layer of a scan, so it remains searchable.
    // Soft-mask/hidden optional-content text is not page content.
    if(entry.text&&!s.mask&&visibility[visibility.length-1]) entries.push(entry);
  };
  for(let i=0;i<operatorList.fnArray.length;i++){
    const op=operatorList.fnArray[i],a=operatorList.argsArray[i]||[];
    switch(op){
      case ops.save: save();break;
      case ops.restore: restore();break;
      case ops.transform: state.ctm=pdfMatrix(state.ctm,a);break;
      case ops.beginText:
        state.textMatrix=identity;state.x=state.y=state.lineX=state.lineY=0;break;
      case ops.setFont: setFont(a[0],a[1]);break;
      case ops.setCharSpacing: state.charSpacing=a[0];break;
      case ops.setWordSpacing: state.wordSpacing=a[0];break;
      case ops.setHScale: state.hScale=a[0]/100;break;
      case ops.setLeading: state.leading=-a[0];break;
      case ops.setTextRise: state.rise=a[0];break;
      case ops.moveText: move(a[0],a[1]);break;
      case ops.setLeadingMoveText: state.leading=a[1];move(a[0],a[1]);break;
      case ops.setTextMatrix:
        state.textMatrix=a;state.x=state.y=state.lineX=state.lineY=0;break;
      case ops.nextLine: move(0,state.leading);break;
      case ops.showText: show(a[0]);break;
      case ops.nextLineShowText: move(0,state.leading);show(a[0]);break;
      case ops.nextLineSetSpacingShowText:
        state.wordSpacing=a[0];state.charSpacing=a[1];move(0,state.leading);show(a[2]);break;
      case ops.setGState:
        for(const [key,value] of a[0]) if(key==='Font') setFont(value[0],value[1]);
        break;
      case ops.paintFormXObjectBegin:
        save();if(a[0]) state.ctm=pdfMatrix(state.ctm,a[0]);break;
      case ops.paintFormXObjectEnd: restore();break;
      case ops.beginGroup:
        // The group matrix bounds its offscreen canvas; its content keeps the
        // incoming CTM (CanvasGraphics.beginGroup), with Form applying its own.
        save();state.mask=state.mask||!!a[0].smask;break;
      case ops.endGroup: restore();break;
      case ops.beginMarkedContent: visibility.push(visibility[visibility.length-1]);break;
      case ops.beginMarkedContentProps:
        visibility.push(visibility[visibility.length-1]&&(a[0]!=='OC'||isVisible(a[1])));break;
      case ops.endMarkedContent: if(visibility.length>1) visibility.pop();break;
    }
  }
  return entries;
}

const PDF_WORD_PATTERN=/[A-Za-z](?:[A-Za-z'’\-]*[A-Za-z])?/g;
// These thresholds reconstruct reading order/word separators only. They never
// adjust a glyph's geometry or distribute a run's width among its characters.
const PDF_LINE_ACROSS=.35, PDF_LINE_BACK=.6, PDF_LINE_AHEAD=2.5, PDF_SPACE_GAP=.16;
function pdfEntryOffsets(line,entry){
  const dx=entry.origin.x-line.origin.x,dy=entry.origin.y-line.origin.y;
  return {along:dx*line.direction.x+dy*line.direction.y,
    across:dx*line.normal.x+dy*line.normal.y};
}
function pdfLineFits(line,entry){
  if(Math.abs(line.angle-entry.angle)>.02) return false;
  const height=Math.max(line.fontHeight,entry.fontHeight),{along,across}=pdfEntryOffsets(line,entry);
  return Math.abs(across)<=height*PDF_LINE_ACROSS&&
    along>line.cursor-height*PDF_LINE_BACK&&along<line.cursor+height*PDF_LINE_AHEAD;
}
function pdfTextLines(entries,normalizeText=value=>value){
  const lines=[];
  let line=null;
  for(const entry of entries){
    if(!entry.text) continue;
    if(!line||!pdfLineFits(line,entry)){
      line={...entry,text:'',chars:[],cursor:0};lines.push(line);
    }
    const {along}=pdfEntryOffsets(line,entry);
    if(line.text&&along-line.cursor>Math.max(line.fontHeight,entry.fontHeight)*PDF_SPACE_GAP
        &&!/\s$/.test(line.text)&&!/^\s/.test(entry.text)){
      line.text+=' ';line.chars.push(null);
    }
    line.text+=entry.text;
    for(const char of entry.chars) line.chars.push(char);
    line.cursor=along+entry.width;
    line.fontHeight=Math.max(line.fontHeight,entry.fontHeight);
  }
  for(const line of lines){
    const chars=[];
    for(let i=0;i<line.text.length;i++){
      for(let j=0;j<normalizeText(line.text[i]).length;j++) chars.push(line.chars[i]);
    }
    line.text=normalizeText(line.text);line.chars=chars;
  }
  return lines;
}
function pdfLineWordBoxes(lines,pageWidth,pageHeight){
  const boxes=[];
  let text='';
  lines.forEach((line,lineIndex)=>{
    if(text) text+=' ';
    const base=text.length;text+=line.text;
    PDF_WORD_PATTERN.lastIndex=0;
    let match;
    while((match=PDF_WORD_PATTERN.exec(line.text))){
      const span=line.chars.slice(match.index,match.index+match[0].length).filter(Boolean);
      if(!span.length) continue;
      const left=Math.max(0,Math.min(pageWidth,...span.map(b=>b.left)));
      const top=Math.max(0,Math.min(pageHeight,...span.map(b=>b.top)));
      const right=Math.max(left,Math.min(pageWidth,Math.max(...span.map(b=>b.right))));
      const bottom=Math.max(top,Math.min(pageHeight,Math.max(...span.map(b=>b.bottom))));
      if(right<=left||bottom<=top) continue;
      boxes.push({word:match[0],x:left/pageWidth,y:top/pageHeight,
        w:(right-left)/pageWidth,h:(bottom-top)/pageHeight,line:lineIndex,
        offset:base+match.index});
    }
  });
  return {boxes,text};
}
function pdfPageWords(entries,pageWidth,pageHeight,normalizeText=value=>value){
  return pdfLineWordBoxes(pdfTextLines(entries,normalizeText),pageWidth,pageHeight);
}
