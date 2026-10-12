import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Exercise the real reader acceptance contract, without loading the app.
const context = vm.createContext({openDb:()=>()=>{}, document:{addEventListener(){}}, window:{}});
const acceptWords = vm.runInContext(readFileSync(new URL('../../scripts/reader/pdf-ocr.js', import.meta.url), 'utf8') + '\nBreezePdfOcr.boxesFromWords;', context);
export const tokens = text => String(text).normalize('NFKC').toLowerCase().match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
function distance(a,b) {
  let previous = Array.from({length:b.length+1}, (_,i)=>i);
  for(let i=0;i<a.length;i++) {
    const current = [i+1];
    for(let j=0;j<b.length;j++) current.push(Math.min(current[j]+1, previous[j+1]+1, previous[j]+(a[i]===b[j]?0:1)));
    previous=current;
  }
  return previous[b.length];
}
export function textMetrics(expected, actual) {
  const truth=tokens(expected), observed=tokens(actual);
  assert.ok(truth.length<=1000 && observed.length<=4000, 'token scoring bound exceeded');
  const a=Array.from(truth.join(' ')), b=Array.from(observed.join(' '));
  assert.ok(a.length<=10000 && b.length<=30000, 'character scoring bound exceeded');
  const wordEdits=distance(truth,observed), characterEdits=distance(a,b);
  // Unique anchors avoid inventing an occurrence match for repeated words.
  const anchors=truth.filter(t=>truth.filter(x=>x===t).length===1 && observed.filter(x=>x===t).length===1);
  let pairs=0, inversions=0;
  for(let i=0;i<anchors.length;i++) for(let j=i+1;j<anchors.length;j++) {
    pairs++; if(observed.indexOf(anchors[i])>observed.indexOf(anchors[j])) inversions++;
  }
  return {expectedWords:truth.length, observedWords:observed.length, wordEdits, characterEdits,
    wer:truth.length?wordEdits/truth.length:null, cer:a.length?characterEdits/a.length:null,
    blankHallucinatedWords:truth.length?null:observed.length,
    readingOrder:{uniqueAnchors:anchors.length, comparablePairs:pairs, inversions,
      agreement:pairs?1-inversions/pairs:null, limitation:'Repeated/missing tokens excluded; emitted order, not sentence reconstruction'}};
}

// Preserve grounding as blocks. Neither documented dialect establishes word
// boxes, coordinate units, confidence, or line IDs suitable for Breeze tapping.
export function parseUnlimited(raw) {
  assert.equal(typeof raw,'string');
  assert.ok(raw.length<=200000, 'model output scoring bound exceeded');
  const blocks=[];
  let text=raw.replace(/<\|det\|>([\s\S]*?)<\|\/det\|>/g, (_,payload)=>{
    blocks.push({payload, granularity:'unverified-block', coordinateUnits:'unverified'});
    return '\n';
  }).replace(/<\|\/?ref\|>/g,'').replace(/<\|[^>]*\|>/g,'');
  text=text.replace(/^\s*#{1,6}\s+/gm,'').replace(/[*_`]/g,'').trim();
  return {text, blocks, words:[], coordinateSuitability:'unverified; grounding blocks are never split into word rectangles'};
}
export function geometryMetrics(expected, words) {
  const accepted=Array.from(acceptWords(words));
  const used=new Set(); let correct=0, ambiguous=0, iouSum=0;
  for(const box of accepted) {
    const cx=box.x+box.w/2, cy=box.y+box.h/2;
    // No tolerance: test the center of the drawn word against tap rectangles.
    const hits=expected.map((t,i)=>({t,i})).filter(({t})=>{
      const tx=t.x+t.w/2, ty=t.y+t.h/2;
      return tx>=box.x && tx<=box.x+box.w && ty>=box.y && ty<=box.y+box.h;
    });
    if(hits.length!==1) { if(hits.length>1) ambiguous++; continue; }
    const {t,i}=hits[0];
    if(used.has(i) || tokens(t.word).join(' ')!==tokens(box.word).join(' ')) continue;
    // A broad paragraph rectangle cannot pass solely by containing one word.
    if(cx<t.x-.01 || cx>t.x+t.w+.01 || cy<t.y-.01 || cy>t.y+t.h+.01) continue;
    const intersection=Math.max(0,Math.min(box.x+box.w,t.x+t.w)-Math.max(box.x,t.x))*Math.max(0,Math.min(box.y+box.h,t.y+t.h)-Math.max(box.y,t.y));
    const iou=intersection/(box.w*box.h+t.w*t.h-intersection);
    if(iou<.25) continue;
    used.add(i); correct++; iouSum+=iou;
  }
  return {submitted:words.length, readerAccepted:accepted.length, correctUnambiguousTaps:correct,
    ambiguousRectangles:ambiguous, missed:expected.length-correct,
    precision:accepted.length?correct/accepted.length:null, recall:expected.length?correct/expected.length:null,
    meanMatchedIoU:correct?iouSum/correct:null,
    criterion:'Exact word; unique expected center in tap box; emitted center within ink bounds +1% page; IoU >=0.25. Synthetic diagnostic, not device acceptance.'};
}
export function score(sample, result) {
  assert.equal(result.error,null, `failed case ${sample.id}`);
  assert.ok(Number.isFinite(result.milliseconds) && result.milliseconds>=0, 'missing measured timing');
  const parsed=result.rawText===undefined?null:parseUnlimited(result.rawText);
  const words=result.words || [];
  return {id:sample.id, kind:sample.kind,
    text:textMetrics(sample.expected.map(w=>w.word).join(' '), parsed?.text ?? words.map(w=>w.word).join(' ')),
    coordinates:parsed ? {status:parsed.coordinateSuitability, groundingBlocks:parsed.blocks.length,
      wordTapMetrics:null} : {status:'native word contract', wordTapMetrics:geometryMetrics(sample.expected,words)},
    milliseconds:result.milliseconds, residentBytes:result.residentBytes??null, pssKiB:result.pssKiB??null,
    clientResidentBytes:result.clientResidentBytes??null};
}
