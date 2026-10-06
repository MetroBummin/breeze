import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const tokens=read('styles/tokens.css');
const feedback=read('scripts/dictionary/lookup-feedback.js');
const sentence=read('scripts/reader/reader-modes.js');
const light=tokens.slice(tokens.indexOf(':root{'),tokens.indexOf('body.lang-ko{'));
const dark=tokens.slice(tokens.indexOf('body.dark{'));
const before='linear-gradient(108deg,transparent 28%,rgba(171,216,255,.42) 40%,rgba(255,255,255,.68) 49%,rgba(171,216,255,.42) 58%,transparent 70%)';
assert.match(light,/--word-lookup-wash:rgba\(74,151,235,\.22\)/);
assert.match(light,/--word-lookup-sheen:linear-gradient\(108deg,transparent 38%,rgba\(74,151,235,\.18\) 44%,rgba\(74,151,235,\.50\) 49%,rgba\(171,216,255,\.10\) 54%,transparent 60%\)/);
assert.match(dark,/--word-lookup-wash:rgba\(102,170,239,\.24\)/);
assert.ok(dark.includes('--word-lookup-sheen:'+before+';'),'dark gradient is the exact existing palette');
assert.ok(feedback.includes('background-image:var(--breeze-lookup-sheen,'+before+')!important'));
assert.match(feedback,/animation:breeze-word-sheen 1\.65s ease-in-out infinite!important/);
assert.match(feedback,/0%,12%\{background-position:160% 0\}80%,100%\{background-position:-60% 0\}/);
assert.match(feedback,/animation:none!important;background-image:none!important/);
assert.match(feedback,/pendingNode\.style\.removeProperty\('--breeze-lookup-sheen'\)/);
for(const source of [feedback,sentence])assert.match(source,/setProperty\('--breeze-lookup-sheen',(?:palette|getComputedStyle\(document.body\))\.getPropertyValue\('--word-lookup-sheen'\)\)/);
// Conservative alpha-compositing estimate against the actual light paper and
// Reader ink, including the strongest colored crest. Browser evidence checks
// the actual production paint owners separately; this is not a pixel claim.
const rgb=hex=>hex.match(/[\da-f]{2}/gi).map(part=>parseInt(part,16));
const token=name=>light.match(new RegExp(name+':(#[\\da-f]+)','i'))[1];
const luminance=color=>color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
  .reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const paper=rgb(token('--paper')),ink=rgb(token('--ink-body'));
for(const alpha of [.22,1-(1-.22)*(1-.18),1-(1-.22)*(1-.50)]){
  const paint=paper.map((v,i)=>v*(1-alpha)+[74,151,235][i]*alpha);
  const ratio=(luminance(paint)+.05)/(luminance(ink)+.05);
  assert.ok(ratio>=4.5,`light text contrast ${ratio.toFixed(2)} is below 4.5`);
  console.log(`Light blue composite alpha=${alpha.toFixed(3)}, estimated contrast=${ratio.toFixed(2)}:1`);
}
console.log('Light-only palette, exact dark preservation, shared transfer, motion and cleanup checks passed.');
