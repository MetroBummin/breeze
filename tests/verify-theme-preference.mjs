/* 설정의 화면 모드(라이트/다크/시스템)와 리더 Aa 의 다크 스위치가 'breeze.dark'
   한 칸을 함께 씁니다. 여기서는 preferences.js 의 그 부분만 떼어 내 돌려 봅니다. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const preferences = readFileSync(resolve(root, 'scripts/ui/preferences.js'), 'utf8');
const index = readFileSync(resolve(root, 'index.html'), 'utf8');
const start = preferences.indexOf('const SYSTEM_DARK_QUERY');
const end = preferences.indexOf('\napplyDark();\n', start) + '\napplyDark();\n'.length;
assert.ok(start >= 0 && end > start, 'The theme block moved out of scripts/ui/preferences.js');
const themeBlock = preferences.slice(start, end);

function element(dataset = {}){
  const classes = new Set();
  const attrs = {};
  return { dataset, attrs, classes,
    classList:{ toggle:(name, on) => { if(on) classes.add(name); else classes.delete(name); } },
    setAttribute:(name, value) => { attrs[name] = value; } };
}

/** @param {unknown} stored @param {boolean} systemDark */
function boot(stored, systemDark = false){
  const store = stored === undefined ? {} : { 'breeze.dark': stored };
  const listeners = [];
  const query = { matches: systemDark, addEventListener:(_type, fn) => listeners.push(fn) };
  const aa = element();
  const choices = ['light', 'dark', 'system'].map(theme => element({ theme }));
  const context = {
    matchMedia: () => query,
    // scripts/core/state.js 의 load 와 같습니다: 값이 없으면 기본값.
    load:(key, fallback) => { const v = store[key]; return v === null || v === undefined ? fallback : v; },
    save:(key, value) => { store[key] = value; },
    curBook: null,
    document:{
      body: element(), documentElement: element(),
      getElementById: id => id === 'aa-dark' ? aa : null,
      querySelectorAll: () => choices,
    },
  };
  vm.runInNewContext(themeBlock + '\nthis.read = () => ({ themePreference, darkMode });', context);
  const selected = () => choices.filter(c => c.classes.has('on')).map(c => c.dataset.theme);
  return { context, store, query, listeners, aa, selected,
    state: () => context.read(),
    flipSystem(dark){ query.matches = dark; listeners.forEach(fn => fn()); } };
}

test('saved values migrate: true → dark, false → light, nothing saved → system', () => {
  const cases = [[true, 'dark'], [false, 'light'], [undefined, 'system'], [null, 'system'],
    ['system', 'system'], ['light', 'light'], ['dark', 'dark']];
  for(const [stored, expected] of cases){
    const app = boot(stored);
    assert.equal(app.state().themePreference, expected, `stored ${String(stored)}`);
    assert.deepEqual(app.selected(), [expected], `segment for stored ${String(stored)}`);
  }
});

test('system follows prefers-color-scheme at start and when it changes', () => {
  const app = boot(undefined, true);
  assert.equal(app.state().darkMode, true);
  assert.ok(app.context.document.body.classes.has('dark'));
  app.flipSystem(false);
  assert.equal(app.state().darkMode, false);
  assert.ok(!app.context.document.body.classes.has('dark'));
  assert.equal(app.aa.attrs['aria-pressed'], 'false');
  assert.deepEqual(app.store, {}, 'Following the system must not write a choice');
});

test('a fixed choice ignores system changes and keeps the old storage shape', () => {
  const app = boot(undefined, false);
  app.context.setThemePreference('dark');
  assert.equal(app.store['breeze.dark'], true);
  app.flipSystem(false);
  assert.equal(app.state().darkMode, true);
  app.context.setThemePreference('light');
  assert.equal(app.store['breeze.dark'], false);
  app.context.setThemePreference('system');
  assert.equal(app.store['breeze.dark'], 'system');
});

test('the reader Aa toggle and the settings segment stay in sync', () => {
  const app = boot(undefined, false);
  app.context.toggleDark();
  assert.equal(app.state().themePreference, 'dark');
  assert.equal(app.aa.attrs['aria-pressed'], 'true');
  assert.deepEqual(app.selected(), ['dark']);
  app.context.toggleDark();
  assert.deepEqual(app.selected(), ['light']);
  assert.equal(app.store['breeze.dark'], false);
});

test('settings shows one "화면 모드" segment ordered light, dark, system', () => {
  const segment = index.match(/<div class="set-seg" id="set-theme"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(segment, 'index.html lost #set-theme');
  assert.match(segment[0], /aria-label="화면 모드"/);
  const themes = [...segment[1].matchAll(/<button[^>]*data-theme="(\w+)"[^>]*onclick="setThemePreference\('(\w+)'\)"/g)];
  assert.deepEqual(themes.map(m => m[1]), ['light', 'dark', 'system']);
  assert.deepEqual(themes.map(m => m[2]), ['light', 'dark', 'system']);
  const labels = [...segment[1].matchAll(/<svg viewBox="0 0 24 24" aria-hidden="true">[\s\S]*?<\/svg>([^<]+)<\/button>/g)];
  assert.deepEqual(labels.map(m => m[1]), ['라이트', '다크', '시스템'], 'Each choice is an icon and its label');
  assert.match(index, /<b>화면 모드<\/b><\/div>\s*<div class="set-seg" id="set-theme"/);
  const appearance = index.match(/<section id="appearance-settings">[\s\S]*?<\/section>/)[0];
  assert.doesNotMatch(appearance, /다크 모드/, 'The old "다크 모드" settings label is back');
});
