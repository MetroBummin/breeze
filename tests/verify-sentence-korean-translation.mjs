// Regression for issue #319: the sentence translation popup showed Simplified
// Chinese instead of Korean. The 'explain' op accepted any non-empty `ko`, so a
// provider answering in Chinese had its text returned and cached.
//
// Runs with NO npm packages:
//   node --experimental-strip-types --test tests/verify-sentence-korean-translation.mjs
// The pure Korean guard lives in server/dict/korean.ts (no imports / no side
// effects), so it is imported directly under --experimental-strip-types. index.ts
// cannot be imported here (it imports jsr:@supabase/supabase-js and runs
// Deno.serve at load), so the opExplain reject/retry behavior is exercised through
// the SAME exported acceptance gate the server wires into ask(), and the wiring
// itself is asserted against the index.ts source.

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isKoreanTranslation, explainAcceptsText, countHangul, countHan} from '../server/dict/korean.ts';

// The exact string reported in #319 (Simplified Chinese, predominantly CJK Han).
const REPORTED_CHINESE='从支点城到英里高城，在高速公路上本是一条直线，他的拾荒工作将在那里进行——但车队所走的路线却是一条蜿蜒曲折的路径，在抵达目的地之前尽可能多地穿过了米德美利坚的各座城市。';
// A faithful Korean translation of the same passage.
const KOREAN='풀크럼 시티에서 마일 하이 시티까지는 고속도로에서 보면 직선이었고 그의 수확 작업이 그곳에서 이루어질 예정이었지만, 행렬이 택한 경로는 목적지에 도착하기 전에 가능한 한 많은 미드메리카 도시를 지나는 구불구불한 길이었다.';

test('the reported Chinese string is rejected and a Korean translation is accepted', () => {
  assert.equal(isKoreanTranslation(REPORTED_CHINESE), false, 'reported Chinese passage must be rejected');
  assert.equal(isKoreanTranslation(KOREAN), true, 'a normal Korean translation must be accepted');
  // The counting primitives underpinning the decision.
  assert.ok(countHan(REPORTED_CHINESE) > 0 && countHangul(REPORTED_CHINESE) === 0, 'reported string is pure Han, no Hangul');
  assert.ok(countHangul(KOREAN) > countHan(KOREAN), 'Korean translation is Hangul-dominant');
});

test('the Korean guard rejects non-Korean and accepts realistic Korean edge cases', () => {
  // Reject: empty, whitespace, Latin-only, pure Chinese sentence.
  for (const bad of ['', '   ', 'This is English.', '12345', '你好世界，今天天气很好。']) {
    assert.equal(isKoreanTranslation(bad), false, `should reject: ${JSON.stringify(bad)}`);
  }
  // Accept: plain Korean; Korean with incidental Hanja; Korean with Latin proper
  // nouns and numbers; Korean jamo/compatibility-jamo content.
  for (const good of [
    '안녕하세요.',
    '그는 서울大에서 공부했다.',            // one Hanja inside Korean (incidental)
    'Fulcrum City에서 2026년에 출발했다.',  // Latin proper noun + digits inside Korean
    'ㄱㄴㄷ 자모도 한글로 셈한다',
  ]) {
    assert.equal(isKoreanTranslation(good), true, `should accept: ${JSON.stringify(good)}`);
  }
  // A few Hanja are allowed, but a block of Han dominating the Hangul is rejected.
  assert.equal(isKoreanTranslation('한자 ' + '漢'.repeat(50)), false, 'Han dominating Hangul must be rejected');
});

test('explainAcceptsText gates provider raw text by Korean-ness', () => {
  assert.equal(explainAcceptsText(JSON.stringify({ko: KOREAN})), true);
  assert.equal(explainAcceptsText(JSON.stringify({ko: REPORTED_CHINESE})), false);
  assert.equal(explainAcceptsText(JSON.stringify({ko: ''})), false);
  // Tolerate a code-fence / prose wrapper around the JSON, like parseJson does.
  assert.equal(explainAcceptsText('```json\n' + JSON.stringify({ko: KOREAN}) + '\n```'), true);
  assert.equal(explainAcceptsText('garbage, no json here'), false);
});

// A faithful stand-in for index.ts ask()'s sequential provider loop: try each
// provider in order; a thrown provider error OR a rejected `accept(text)` advances
// to the next provider; return the first accepted answer; if none is accepted,
// throw (retryable). This mirrors the real control flow and uses the REAL
// explainAcceptsText gate, so deleting the Korean guard makes these asserts fail.
async function askLoop(providers, {accept}) {
  let lastError = new Error('server_not_configured');
  for (const provider of providers) {
    let out;
    try { out = await provider(); }
    catch (error) { lastError = error; continue; }
    if (accept && !accept(out.text)) { lastError = new Error('sentence_not_korean'); continue; }
    return out;
  }
  throw lastError;
}

test('opExplain path: a Chinese answer from the primary is rejected and the other provider is used', async () => {
  const calls = [];
  const deepseek = async () => { calls.push('openrouter'); return {text: JSON.stringify({ko: REPORTED_CHINESE}), provider: 'openrouter'}; };
  const gemini = async () => { calls.push('gemini'); return {text: JSON.stringify({ko: KOREAN}), provider: 'gemini'}; };
  const out = await askLoop([deepseek, gemini], {accept: explainAcceptsText});
  assert.deepEqual(calls, ['openrouter', 'gemini'], 'non-Korean primary must advance to the fallback provider');
  assert.equal(out.provider, 'gemini');
  assert.equal(JSON.parse(out.text).ko, KOREAN);
});

test('opExplain path: when every provider returns Chinese the result is a retryable error, never the Chinese text', async () => {
  const deepseek = async () => ({text: JSON.stringify({ko: REPORTED_CHINESE}), provider: 'openrouter'});
  const gemini = async () => ({text: JSON.stringify({ko: '另一个中文句子，完全没有韩文。'}), provider: 'gemini'});
  await assert.rejects(() => askLoop([deepseek, gemini], {accept: explainAcceptsText}), /sentence_not_korean/);
});

test('the guard is load-bearing: without it the Chinese primary would be accepted and returned', async () => {
  // Demonstrates the pre-fix behavior to prove the test fails if validation is removed.
  const deepseek = async () => ({text: JSON.stringify({ko: REPORTED_CHINESE}), provider: 'openrouter'});
  const withoutGuard = await askLoop([deepseek], {accept: undefined});
  assert.equal(JSON.parse(withoutGuard.text).ko, REPORTED_CHINESE, 'no guard => Chinese slips through (this is what the fix prevents)');
});

// The wiring in index.ts: opExplain must pass the Korean acceptance gate to ask(),
// and ask() must advance to the next provider when accept() rejects an answer.
test('index.ts wires the Korean acceptance gate into the explain ask() call and advances providers on rejection', () => {
  const src = readFileSync(new URL('../server/dict/index.ts', import.meta.url), 'utf8');
  assert.match(src, /accept:explainAcceptsText/, 'opExplain must pass explainAcceptsText to ask()');
  assert.match(src, /import \{ isKoreanTranslation, explainAcceptsText \} from "\.\/korean\.ts"/);
  assert.match(src, /if\(input\.accept&&!input\.accept\(out\.text\)\)throw new Error\("sentence_not_korean"\)/,
    'ask() must treat a rejected answer as a provider failure so the loop advances');
  // opExplain also keeps a post-parse guard before returning.
  assert.match(src, /if\(!isKoreanTranslation\(ko\)\)throw new Error\("sentence_not_korean"\)/);
  // The prompt must pin Korean-only output and forbid Chinese.
  assert.match(src, /반드시 한국어\(한글\)로만 작성하세요/);
  assert.match(src, /중국어/);
});
