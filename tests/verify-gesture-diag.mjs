/* 문장 손짓 진단은 기본이 꺼져 있고, 켜져도 고리가 2,000줄을 넘기지 않는다. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext, Script} from 'node:vm';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'scripts/reader/gesture-diag.js'), 'utf8');
const script = new Script(source, {filename: 'scripts/reader/gesture-diag.js'});

assert.doesNotMatch(source, /\bfetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b|\bWebSocket\b/,
  'The diagnostic must not upload');
assert.match(source, /진단 로그 복사/);
assert.match(source, /로그 지우기/);
assert.match(source, /breeze\.diag\.gesture/);

function boot(store, preset){
  const clock = {t: 5_000_000};
  const buttonListeners = [];
  const documentListeners = [];
  let created = 0;
  const modal = {hidden: true};
  const backdrop = {on: false};
  const button = {
    dataset: {},
    addEventListener(type, fn){ buttonListeners.push({type, fn}); },
  };
  const scroller = {scrollTop: 40, addEventListener(){}};
  const card = {
    scrollTop: 0,
    addEventListener(){},
    getBoundingClientRect(){ return {width: 360, height: 180}; },
  };
  const document = {
    readyState: 'complete',
    getElementById(id){
      if(id === 'settings-version') return button;
      if(id === 'reader-scroll') return scroller;
      if(id === 'p-sentence') return card;
      if(id === 'sentence-modal') return modal;
      return null;
    },
    addEventListener(type){ documentListeners.push(type); },
    querySelector(){ return null; },
    createElement(){
      created += 1;
      return {
        style: {},
        children: [],
        textContent: '',
        value: '',
        hidden: false,
        setAttribute(){},
        appendChild(child){ this.children.push(child); return child; },
        addEventListener(){},
      };
    },
    body: {
      classList: {contains(name){ return name === 'sentence-result-anchored' && backdrop.on; }},
      appendChild(){},
    },
  };
  const sandbox = {
    document,
    localStorage: {
      getItem(key){ return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem(key, value){ store[key] = String(value); },
      removeItem(key){ delete store[key]; },
    },
    performance: {now(){ return clock.t / 10; }},
    matchMedia(query){ return {matches: query.indexOf('fine') !== -1}; },
    requestAnimationFrame(){},
    navigator: {},
    location: {reload(){ sandbox.__reloads += 1; }},
    innerWidth: 820,
    innerHeight: 1180,
    Date: {now(){ return clock.t; }},
    setTimeout(){},
    clearTimeout(){},
    console,
    __reloads: 0,
    __modal: modal,
    __backdrop: backdrop,
  };
  sandbox.window = sandbox;
  if(preset) Object.assign(sandbox, preset);
  createContext(sandbox);
  script.runInContext(sandbox);
  return {sandbox, buttonListeners, documentListeners, created: () => created, clock, modal, backdrop};
}

function tap(session, times, gap){
  const handler = session.buttonListeners.find(item => item.type === 'click').fn;
  let prevented = 0;
  for(let i = 0; i < times; i++){
    if(gap) session.clock.t += gap;
    handler({preventDefault(){ prevented += 1; }});
  }
  return prevented;
}

const offStore = {};
const off = boot(offStore);
assert.equal(off.sandbox.gestureDiagEnabled(), false, 'diag is on without the flag');
assert.equal(typeof off.sandbox.gestureDiagNote, 'undefined', 'the ring exists while diag is off');
assert.equal(off.created(), 0, 'the copy panel is built while diag is off');
assert.deepEqual(off.documentListeners.filter(type => type.startsWith('pointer') || type.startsWith('touch')), [],
  'pointer or touch listeners attach while diag is off');
assert.equal(tap(off, 6), 0);
assert.equal(offStore['breeze.diag.gesture'], undefined);
assert.equal(off.sandbox.__reloads, 0);
assert.equal(tap(off, 1), 1);
assert.equal(offStore['breeze.diag.gesture'], '1');
assert.equal(off.sandbox.__reloads, 1);

const slowStore = {};
const slow = boot(slowStore);
tap(slow, 6);
tap(slow, 1, 2501);
assert.equal(slowStore['breeze.diag.gesture'], undefined, 'a gap above 2.5s starts the seven taps over');
tap(slow, 6);
assert.equal(slowStore['breeze.diag.gesture'], '1');

const secret = 'SECRET SENTENCE TEXT';
let opened = 0;
let closed = 0;
let preventedClick = 0;
const on = boot({'breeze.diag.gesture': '1'}, {
  openSentence(text){
    opened += 1;
    assert.equal(text, secret);
  },
  closeSentence(){
    closed += 1;
    onModal.hidden = true;
    onBackdrop.on = false;
  },
  clickGesture(event){
    preventedClick += 1;
    event.preventDefault();
  },
});
const onModal = on.modal;
const onBackdrop = on.backdrop;
onModal.hidden = false;
onBackdrop.on = true;
assert.equal(on.sandbox.gestureDiagEnabled(), true);
assert.equal(on.sandbox.gestureDiagCap, 2000);
assert.ok(on.documentListeners.includes('pointerdown'));
assert.ok(on.documentListeners.includes('pointercancel'));
assert.ok(on.documentListeners.includes('touchstart'));
assert.ok(on.documentListeners.includes('touchcancel'));
assert.ok(on.created() > 0);
on.sandbox.openSentence(secret, {peekTarget: {}});
assert.equal(opened, 1);
on.sandbox.closeSentence();
assert.equal(closed, 1);
const event = {defaultPrevented: false, preventDefault(){ this.defaultPrevented = true; }};
on.sandbox.clickGesture(event);
assert.equal(preventedClick, 1);
const text = on.sandbox.gestureDiagText();
assert.match(text, /open [^\n]* n=20 peek=1/);
assert.match(text, /close [^\n]* hidden=1 [^\n]* backdrop=0/);
assert.match(text, /click [^\n]* prevented=1/);
assert.equal(text.includes(secret), false, 'sentence text was copied into the log');
assert.match(text, /env .* fine=1/);

for(let i = 0; i < 2050; i++) on.sandbox.gestureDiagNote('row', {i});
const rows = on.sandbox.gestureDiagText().split('\n');
assert.equal(rows.length, 2000, 'the ring grew past 2,000 lines');
assert.match(rows[0], /(?:^| )i=50(?: |$)/);
assert.match(rows[1999], /(?:^| )i=2049(?: |$)/);
assert.doesNotMatch(rows[0], /^env /);

const disableStore = {'breeze.diag.gesture': '1'};
const disabling = boot(disableStore);
tap(disabling, 7);
assert.equal(disabling.sandbox.__reloads, 1);
assert.equal(disableStore['breeze.diag.gesture'], undefined);

console.log('Gesture diagnostic stays off and caps its ring.');
