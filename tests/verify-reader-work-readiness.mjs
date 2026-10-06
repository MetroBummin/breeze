import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {test} from 'node:test';
const source=readFileSync(process.env.BREEZE_READER_WORK_TEST||new URL('./verify-reader-work-browser.mjs',import.meta.url),'utf8');
const match=source.match(/const previewHandle=await page\.waitForFunction\(\(\)=>\{([\s\S]*?)\},null,\{timeout:10000\}\);/);
assert.ok(match,'owned preview readiness predicate must exist');
function ready(width,height,strip){
 return vm.runInNewContext('(function(){'+match[1]+'})()',{
  Math,document:{querySelector:()=>({getBoundingClientRect:()=>({width,height})}),
   getElementById:()=>({getBoundingClientRect:()=>({width:strip})})}
 });
}
test('connected old EPUB paper must not satisfy new viewport readiness',()=>{
 assert.equal(ready(105,148.484375,153),false);
});
test('settled page geometry satisfies the unchanged acceptance dimensions',()=>{
 const result=ready(145,145*Math.SQRT2,153);assert.ok(result);assert.equal(result.width,145);
});
test('zero size and incorrect aspect ratio remain unready',()=>{
 assert.equal(ready(0,0,153),false);assert.equal(ready(145,145,153),false);
});
