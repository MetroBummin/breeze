/* Experiment only. The reader still uses bridgeSentences in
   scripts/reader/mode-bridge.js. Nothing here is wired into the app. */

import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadProductionSentences(){
  const context = {};
  new Script(readFileSync(resolve(root, 'scripts/importers/ligatures.js'), 'utf8')).runInNewContext(context);
  new Script(readFileSync(resolve(root, 'scripts/reader/mode-bridge.js'), 'utf8')).runInNewContext(context);
  return context.bridgeSentences;
}

const productionSentences = loadProductionSentences();

/** A — the rule that saves an example today. */
export function ruleA(text){
  return productionSentences(text).map(part => ({
    start: part.start,
    end: part.end,
    text: part.text,
  }));
}

const CIRCLED = /[\u2460-\u2473\u24B6-\u24CF\u24D0-\u24E9\u2776-\u277F\u2780-\u2789\u24F5-\u24FE\u3251-\u325F\u32B1-\u32BF]/;
const CLOSER = /["'”’»)\]\}»」』]/;
const ALWAYS_ABBREV = new Set(`dr mr mrs ms miss st jr sr prof rev hon esq gen col lt sgt capt gov sen rep mt ft ave rd blvd inc ltd co corp dept univ etc eg ie vs am pm cf al ed phd md ba ma dc`.split(' '));
const DIGIT_ABBREV = new Set('no fig vol pp ch sec eq ref refs nos'.split(' '));
/* Short words that really can be a whole sentence, so the length safeguard
   must not swallow them. "No" is here too: "No. 4" is handled earlier as a
   number label, and "No. He left." is a real sentence. */
const SHORT_SENTENCE = new Set('yes no oh ah hi ok okay wow hey go stop wait help look well why who how now so bye see run sit come did let can may'.split(' '));

export function normalizeExample(value){
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function nextToken(text, index){
  let at = index;
  while (at < text.length && (text[at] === ' ' || text[at] === '\t')) at++;
  if (text[at] === '\n' && text[at + 1] !== '\n'){
    at++;
    while (at < text.length && (text[at] === ' ' || text[at] === '\t')) at++;
  }
  if (at >= text.length || text[at] === '\n') return { at, token: '', char: text[at] || '' };
  let end = at;
  if (/[A-Za-z0-9]/.test(text[end])){
    while (end < text.length && /[A-Za-z0-9'’-]/u.test(text[end])) end++;
  } else end = at + 1;
  return { at, token: text.slice(at, end), char: text[at] };
}

function wordBefore(text, dot){
  let at = dot - 1;
  while (at >= 0 && /[A-Za-z]/.test(text[at])) at--;
  return { word: text.slice(at + 1, dot), at: at + 1 };
}

function isInitialism(text, dot){
  let start = dot;
  while (start > 0 && /[A-Za-z.]/.test(text[start - 1])) start--;
  let end = dot + 1;
  while (end < text.length && /[A-Za-z.]/.test(text[end])) end++;
  return /^(?:[A-Za-z]{1,3}\.){2,}[A-Za-z]{0,3}\.?$/.test(text.slice(start, end));
}

function isSingleInitial(text, dot){
  const { word, at } = wordBefore(text, dot);
  if (!/^[A-Za-z]$/.test(word) || /\d/.test(text[at - 1] || '')) return false;
  return nextToken(text, dot + 1).token !== '';
}

function isAbbrevPeriod(text, dot){
  if (isInitialism(text, dot)) return true;
  const { word, at } = wordBefore(text, dot);
  if (!word || /\d/.test(text[at - 1] || '')) return false;
  const lower = word.toLowerCase();
  if (DIGIT_ABBREV.has(lower)) return /^\d/.test(nextToken(text, dot + 1).token);
  return ALWAYS_ABBREV.has(lower);
}

function isAmbiguousShort(text, sentenceStart, dot){
  const { word } = wordBefore(text, dot);
  if (!/^[A-Z][A-Za-z]{0,3}$/.test(word)) return false;
  if (SHORT_SENTENCE.has(word.toLowerCase())) return false;
  const next = nextToken(text, dot + 1);
  if (!next.token || !/^[A-Z]/.test(next.char)) return false;
  const words = text.slice(sentenceStart, dot).match(/[A-Za-z]+/g) || [];
  return words.length < 3;
}

function lineStart(text, index){
  let at = index;
  while (at > 0 && (text[at - 1] === ' ' || text[at - 1] === '\t')) at--;
  return at === 0 || text[at - 1] === '\n';
}

/* Option marker length, not including the space before the body.
   Numbered markers are recognized after any whitespace because a PDF page
   joins visual lines with spaces, so "1." is often not at a line start.
   Circled marks and (A)/A) in the middle of a line count only when the
   body starts with a capital, so a grammar blank like "people ① exist"
   stays inside the sentence. */
export function optionMarkerLength(text, index, mode){
  if (index > 0 && !/\s/.test(text[index - 1])) return 0;
  const slice = text.slice(index);
  let len = 0;
  let kind = '';
  const number = /^(\d{1,2}[.)．])/.exec(slice);
  const paren = /^(?:[(（][A-Za-z][)）]|[A-Za-z][)）]|[(（]\d{1,2}[)）])/.exec(slice);
  if (number){ len = number[1].length; kind = 'num'; }
  else if (paren){ len = paren[0].length; kind = 'paren'; }
  else if (slice[0] && CIRCLED.test(slice[0])){ len = 1; kind = 'circled'; }
  else return 0;
  let body = index + len;
  while (text[body] === ' ' || text[body] === '\t') body++;
  const char = text[body] || '';
  if (kind === 'num' && !/[A-Za-z]/.test(char)) return 0;
  if (mode === 'C' && !/[A-Z]/.test(char)) return 0;
  // A lowercase circled mark inside a line is a grammar blank, not a choice.
  // (A) and A) still start a choice, because that is how the choice is written.
  if (mode === 'B' && kind === 'circled' && !lineStart(text, index) && !/[A-Z]/.test(char)) return 0;
  return len;
}

function boundaryAt(text, index, sentenceStart, mode){
  const char = text[index];
  const bang = char === '!' || char === '?' || char === '！' || char === '？';
  if (!bang && char !== '.' && char !== '…' && char !== '．') return null;
  if (char === '.' || char === '．' || char === '…'){
    let after = index;
    if (char === '…') after = index + 1;
    else while (after < text.length && (text[after] === '.' || text[after] === '．')) after++;
    const ellipsis = char === '…' || after > index + 1;
    if (!ellipsis && index > 0 && /\d/.test(text[index - 1]) && /\d/.test(text[index + 1] || ''))
      return { kind: 'skip', next: index + 1 };
    if (mode === 'B' && ellipsis) return { kind: 'skip', next: after };
    if (mode === 'B' && !ellipsis && (isAbbrevPeriod(text, index) || isSingleInitial(text, index))) return { kind: 'skip', next: index + 1 };
    if (mode === 'B' && !ellipsis && isAmbiguousShort(text, sentenceStart, index)) return { kind: 'skip', next: index + 1 };
    let end = mode === 'B' && !ellipsis ? index + 1 : after;
    while (end < text.length && CLOSER.test(text[end])) end++;
    if (mode === 'B' && !ellipsis) return { kind: 'end', end };
    const next = nextToken(text, end);
    if (!next.token || /[A-Z]/.test(next.char)) return { kind: 'end', end };
    return { kind: 'skip', next: after };
  }
  let end = index + 1;
  while (end < text.length && CLOSER.test(text[end])) end++;
  if (mode === 'B') return { kind: 'end', end };
  const next = nextToken(text, end);
  if (!next.token || /[A-Z]/.test(next.char)) return { kind: 'end', end };
  return { kind: 'skip', next: end };
}

function skipGap(text, index){
  let at = index;
  while (at < text.length && (text[at] === ' ' || text[at] === '\t')) at++;
  if (text[at] === '\n' && text[at + 1] !== '\n'){
    at++;
    while (at < text.length && (text[at] === ' ' || text[at] === '\t')) at++;
  }
  return at;
}

function segment(text, mode){
  const source = String(text || '');
  const spans = [];
  let start = 0;
  let index = 0;
  const close = at => {
    let from = start;
    let to = at;
    while (from < to && /\s/.test(source[from])) from++;
    while (to > from && /\s/.test(source[to - 1])) to--;
    if (to > from && /[A-Za-z0-9]/.test(source.slice(from, to)))
      spans.push({ start: from, end: to, text: source.slice(from, to) });
    start = at;
  };
  while (index < source.length){
    if (source[index] === '\n' && source[index + 1] === '\n'){
      close(index);
      while (source[index] === '\n') index++;
      start = index;
      continue;
    }
    const marker = optionMarkerLength(source, index, mode);
    if (marker > 0){
      if (index > start) close(index);
      start = index;
      index += marker;
      continue;
    }
    const decision = boundaryAt(source, index, start, mode);
    if (decision?.kind === 'end'){
      close(decision.end);
      index = skipGap(source, decision.end);
      start = index;
      continue;
    }
    if (decision?.kind === 'skip'){
      index = decision.next;
      continue;
    }
    index++;
  }
  if (start < source.length) close(source.length);
  return spans;
}

/** B — abbreviation list, option markers, minimum length on ambiguous splits. */
export function ruleB(text){
  return segment(text, 'B');
}

/** C — no abbreviation list. A capital after a stop starts a sentence. */
export function ruleC(text){
  return segment(text, 'C');
}

export const RULES = [
  { id: 'A', name: '지금 규칙', fn: ruleA },
  { id: 'B', name: '약어 목록 규칙', fn: ruleB },
  { id: 'C', name: '대문자 규칙', fn: ruleC },
];

export function spanAt(parts, offset){
  return parts.find(part => offset >= part.start && offset < part.end) || null;
}
