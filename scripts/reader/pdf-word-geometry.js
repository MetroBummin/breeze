/* Pure PDF word-box geometry shared by the original reader and its tests. */

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
