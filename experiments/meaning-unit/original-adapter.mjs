import {normalizeMapped} from './core.mjs';

const reject = reason => { throw new Error('unsupported_grouping:' + reason); };
const labelPattern = /^\s*(?:([A-E])\)|([①②③④⑤]))\s+/u;
const labelIndex = text => {
  const match = text.match(labelPattern);
  return match ? (match[1] ? match[1].charCodeAt(0) - 65 : '①②③④⑤'.indexOf(match[2])) : null;
};
const boundsOf = line => {
  const chars = line.chars.filter(Boolean);
  if (!chars.length) reject('missing_glyphs');
  return {left:Math.min(...chars.map(c=>c.left)),right:Math.max(...chars.map(c=>c.right)),
    top:Math.min(...chars.map(c=>c.top)),bottom:Math.max(...chars.map(c=>c.bottom))};
};

// Consumes pdfTextLines(entries, identity): ORIGINAL decoded Unicode and actual
// operator glyph cells. No word-box/example text or supplied choice spans.
// Deliberately limited: horizontal, one/two columns, one A..C/D/E or ①..③/④/⑤
// choice group per column, clear gutter, tightly spaced wrapped continuations.
export function originalChoiceBlocks({lines,page,width,height}) {
  if (!Array.isArray(lines) || !lines.length || !Number.isSafeInteger(page) || page<1 ||
      !Number.isFinite(width) || !Number.isFinite(height) || width<=0 || height<=0) reject('bad_page');
  const rows=lines.filter(l=>l.text?.trim()).map((line,index)=>{
    if (typeof line.text!=='string' || !Array.isArray(line.chars) || line.chars.length!==line.text.length ||
        !Number.isFinite(line.angle) || Math.abs(line.angle)>.02 || !Number.isFinite(line.fontHeight) || line.fontHeight<=0) reject('orientation_or_mapping');
    const marker=line.text.match(labelPattern);
    if(marker && /(?:[A-E]\)|[①②③④⑤])\s/u.test(line.text.slice(marker[0].length))) reject('same_line_choices');
    const bounds=boundsOf(line);
    if (![bounds.left,bounds.right,bounds.top,bounds.bottom].every(Number.isFinite) || bounds.left<0 || bounds.top<0 ||
        bounds.right>width || bounds.bottom>height || bounds.right<=bounds.left || bounds.bottom<=bounds.top) reject('bounds');
    let previous=null;
    for(let i=0;i<line.text.length;i++) {
      const cell=line.chars[i];
      if (/\S/u.test(line.text[i])&&!cell) reject('missing_character_geometry');
      if(cell) {
        if(![cell.left,cell.right,cell.top,cell.bottom].every(Number.isFinite)||cell.right<=cell.left||cell.bottom<=cell.top) reject('invalid_cell');
        if(previous&&cell!==previous&&cell.left<previous.left-line.fontHeight*.1) reject('nonmonotonic_glyph_order');
        previous=cell;
      }
    }
    return {...line,index,bounds,label:labelIndex(line.text)};
  });
  const labels=rows.filter(r=>r.label!==null).sort((a,b)=>a.bounds.left-b.bounds.left);
  if (!labels.length) reject('no_choice_labels');
  const columns=[];
  for(const row of labels) {
    let column=columns.find(c=>Math.abs(c.left-row.bounds.left)<=Math.min(c.fontHeight,row.fontHeight));
    if (!column) { column={left:row.bounds.left,fontHeight:row.fontHeight,labels:[]};columns.push(column); }
    column.labels.push(row);
  }
  if(columns.length>2) reject('column_count');
  const assigned=columns.map(()=>[]);
  for(const row of rows) {
    const candidates=columns.map((c,i)=>({c,i})).filter(({c})=>row.bounds.left>=c.left-c.fontHeight*.5);
    const owner=candidates.at(-1);
    if(!owner) reject('unaligned_text');
    const next=columns[owner.i+1];
    if(next&&row.bounds.right>=next.left-next.fontHeight) reject('unclear_gutter');
    assigned[owner.i].push(row);
  }
  const blocks=[],glyphs=[],sourceMap=[];
  const append=(column,kind,label,group)=>{
    const id=`p${page}:c${column}:${kind}:${label}`,text=group.map(r=>r.text).join('\n');
    blocks.push({id,text,page,column,kind});
    let offset=0;
    for(const row of group) {
      for(let i=0;i<row.text.length;) {
        const cell=row.chars[i];let end=i+1;
        // Expanded Unicode from one PDF glyph shares the same object/cell.
        while(end<row.text.length && cell && row.chars[end]===cell) end++;
        sourceMap.push({blockId:id,start:offset+i,end:offset+end,lineIndex:row.index,lineStart:i,lineEnd:end});
        if(cell) glyphs.push({blockId:id,page,column,start:offset+i,end:offset+end,
          x:cell.left,y:cell.top,width:cell.right-cell.left,height:cell.bottom-cell.top,lineIndex:row.index});
        i=end;
      }
      offset+=row.text.length+1;
    }
  };
  for(let column=0;column<columns.length;column++) {
    const ordered=assigned[column].sort((a,b)=>a.bounds.top-b.bounds.top||a.bounds.left-b.bounds.left);
    const choices=ordered.filter(r=>r.label!==null);
    if(choices.length<3||choices.length>5||choices.some((r,i)=>r.label!==i)) reject('noncontiguous_or_multiple_groups');
    let group=[],current=null;
    for(const row of ordered) {
      if(row.label!==null) {
        if(group.length) append(column,current===null?'context':'choice',current??'header',group);
        current=row.label;group=[row];
      } else {
        const previous=group.at(-1);
        if(current!==null && (!previous || row.bounds.top-previous.bounds.top>Math.max(row.fontHeight,previous.fontHeight)*2.4 ||
            row.bounds.left-columns[column].left>row.fontHeight*4 || /^\s*\d+[.)]\s/u.test(row.text))) reject('uncertain_continuation');
        group.push(row);
      }
    }
    if(group.length) {
      if(current!==null&&group.at(-1).bounds.bottom>height-group.at(-1).fontHeight*2) reject('page_edge_continuation');
      append(column,current===null?'context':'choice',current??'header',group);
    }
  }
  return {blocks,glyphs,sourceMap,normalization:blocks.map(b=>({blockId:b.id,...normalizeMapped(b.text)}))};
}

// A coordinate hits one ORIGINAL indivisible glyph; its enclosing raw lexical
// interval identifies the occurrence. Repeated spelling is never a locator.
export function originalTapInput(documentId,revision,extracted,{x,y}) {
  const hits=extracted.glyphs.filter(g=>x>=g.x&&x<g.x+g.width&&y>=g.y&&y<g.y+g.height);
  if(hits.length!==1) reject('ambiguous_or_missing_tap');
  const hit=hits[0],block=extracted.blocks.find(b=>b.id===hit.blockId);
  if(block.kind!=='choice') reject('tap_outside_choice');
  const tokens=[...block.text.matchAll(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu)];
  const token=tokens.find(t=>t.index<=hit.start&&t.index+t[0].length>=hit.end);
  if(!token) reject('tap_not_lexical');
  return {documentId,revision,targetLanguage:'ko',
    // Keep neighbors from the same column; never flatten other-column choices
    // into the selectable target or implicit sentence continuation.
    blocks:extracted.blocks.filter(b=>b.column===block.column),
    tap:{blockId:block.id,start:token.index,end:token.index+token[0].length}};
}
