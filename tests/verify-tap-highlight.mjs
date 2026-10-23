import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';

const read = file => readFileSync(new URL(file, import.meta.url), 'utf8');
const base = read('../styles/base.css');
const epub = read('../scripts/reader/epub-original.js');
const home = read('../styles/home.css');
const reader = read('../styles/reader.css');
const shell = read('../styles/home-shell.css');
const chrome = read('../styles/header-controls.css');
const sets = read('../styles/study-sets.css');
const dictionary = read('../styles/dictionary.css');
const wordbook = read('../styles/wordbook.css');
const longreads = read('../scripts/library/longreads.js');

test('tap highlight is cleared on the document, not on one control', () => {
  assert.match(base, /html,\*\s*\{[^}]*-webkit-tap-highlight-color\s*:\s*transparent\s*;/);
  assert.doesNotMatch(base, /html,\*\s*\{[^}]*-webkit-tap-highlight-color\s*:\s*(?!transparent)/);
});

test('pointer taps do not keep a system focus box, and keyboard focus stays visible', () => {
  assert.match(base, /:is\(button,a,\[role="button"\],summary\):focus-visible\{outline-color:var\(--soft\)!important;\}/);
  assert.match(base, /html\[data-input-modality="pointer"\] :focus:not\(input\):not\(textarea\):not\(select\):not\(\[contenteditable="true"\]\)\{outline:none!important;\}/);
});

test('EPUB chapter stylesheets carry the same suppression after publisher CSS', () => {
  assert.match(epub, /html,html \*\{-webkit-tap-highlight-color:transparent!important\}/);
  assert.match(epub, /:focus:not\(:focus-visible\)\{outline:none\}/);
  assert.match(epub, /cssParts\.join\('\\n'\)\+'\\n'\+safety/);
  assert.match(epub, /html,body\{[^}]*touch-action:pan-x pan-y\}html,html \*/);
});

test('longreads do not inject a stylesheet that could bring the highlight back', () => {
  assert.doesNotMatch(longreads, /createElement\(['"]style['"]\)/);
  assert.doesNotMatch(longreads, /-webkit-tap-highlight-color\s*:/);
});

test('existing pressed states stay in place', () => {
  assert.match(shell, /#home-recommend-kind button:active\{opacity:\.72;\}/);
  assert.match(reader, /#readback:active,\s*#aafab:active,\s*#readpill button:active,\s*\.control-glass:active\{background:var\(--chrome-press\);\}/);
  assert.match(chrome, /#home-add,#wordbook-add,#memory-add,#readback[\s\S]*#set-close[\s\S]*:active\{filter:brightness\(\.92\);\}/);
  assert.match(sets, /\.study-sets-home-card:active\{filter:brightness\(\.97\);\}/);
  assert.match(dictionary, /\.word-peek-action:active\{opacity:\.68;\}/);
  assert.match(wordbook, /#wordbook-review:focus-visible\{outline:2px solid var\(--sentence-glass-muted\)/);
  assert.match(home, /\.book-ocr-cover \.book-ocr-hit:active\{opacity:\.72;\}/);
  assert.doesNotMatch(home, /\.bookcard:active\{/);
  assert.doesNotMatch(home, /\.home-regular-tile:active\{/);
});
