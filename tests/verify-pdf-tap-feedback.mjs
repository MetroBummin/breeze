import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const css=readFileSync(new URL('../styles/reader.css',import.meta.url),'utf8');
const declarations=selector=>[...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .filter(([,selectors])=>selectors.replace(/\/\*[\s\S]*?\*\//g,'').trim()===selector)
  .map(([,_,body])=>body).join('\n');

test('the PDF paper owns transparent native tap feedback, including its inherited canvas',()=>{
  const paper=declarations('.pdf-source-page');
  assert.match(paper,/cursor\s*:\s*pointer\s*;/,'Preserve the mouse affordance');
  assert.match(paper,/-webkit-tap-highlight-color\s*:\s*transparent\s*;/,
    'A full-page pointer target must not ask Chromium to paint a page-sized tap highlight');
});

test('text words and EPUB input surfaces keep the same tap feedback contract',()=>{
  for(const selector of ['.w','.epub-touch-skin']){
    assert.match(declarations(selector),/-webkit-tap-highlight-color\s*:\s*transparent\s*;/,selector);
  }
});
