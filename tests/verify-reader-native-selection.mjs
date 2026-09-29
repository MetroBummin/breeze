import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

// Exercise the actual WKUserScript, not a second implementation of the policy.
// This is a bridge/state regression suite, NOT a UIKit/device gesture test.
const native = readFileSync(process.env.BREEZE_NATIVE_SOURCE ||
  new URL('../ios/App/App/SceneDelegate.swift', import.meta.url), 'utf8');
const match = native.match(/private static let readerSelectionScript = #"""\n([\s\S]*?)\n    """#/);
assert.ok(match, 'Reader must have a native selection policy, not only DOM cleanup');
const script = match[1].replace(/^    /gm, '');

function harness({ reading = false, bodyReady = true, origin = 'breeze://localhost', bridge = true } = {}) {
  const messages = [], observers = [], microtasks = [];
  const target = () => ({
    listeners: new Map(),
    addEventListener(type, fn, options) {
      const entries = this.listeners.get(type) || [];
      entries.push({ fn, once: options?.once });
      this.listeners.set(type, entries);
    },
    emit(type) {
      const entries = this.listeners.get(type) || [];
      this.listeners.set(type, entries.filter(entry => !entry.once));
      for (const { fn } of [...entries]) fn({ type });
    },
  });
  const body = { classList: { contains: name => name === 'reading' && reading } };
  const document = Object.assign(target(), { body: bodyReady ? body : null, activeElement: null });
  const window = target();
  const handler = { postMessage(value) { messages.push(value); } };
  const attachBridge = () => { window.webkit = { messageHandlers: { breezeReaderSelection: handler } }; };
  if (bridge) attachBridge();
  const context = vm.createContext({ document, window, location: new URL(origin),
    queueMicrotask: fn => microtasks.push(fn),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; }
      observe(node, options) { observers.push({ node, options, fn: this.fn }); }
    },
  });
  const run = () => vm.runInContext(script, context);
  const flush = () => { while (microtasks.length) microtasks.shift()(); };
  const focus = element => {
    if (document.activeElement) document.emit('focusout');
    document.activeElement = element;
    if (element) document.emit('focusin');
    flush();
  };
  const classesChanged = () => { for (const observer of observers) observer.fn([]); };
  run();
  return { messages, document, window, handler, observers, run, flush, focus, attachBridge,
    read(value) { reading = value; classesChanged(); },
    classesChanged,
    ready() { document.body = body; document.emit('DOMContentLoaded'); },
  };
}
const control = (tagName = 'INPUT', props = {}) => ({
  tagName, type: 'text', isConnected: true, isContentEditable: false, disabled: false, ...props,
});

test('reading disables native text interaction without waiting for a pointer or selectionchange', () => {
  const h = harness({ reading: true });
  assert.deepEqual(h.messages, [false]);
  assert.equal(h.document.listeners.has('pointerdown'), false);
  assert.equal(h.document.listeners.has('touchstart'), false);
  assert.equal(h.document.listeners.has('selectionchange'), false);
});

test('entry/exit has one native owner, independent of PDF/EPUB/Text and UI class changes', () => {
  const h = harness();
  h.read(true);
  h.classesChanged(); h.classesChanged();
  h.read(false);
  assert.deepEqual(h.messages, [true, false, true]);
  assert.equal(h.observers.length, 1);
  assert.deepEqual(Array.from(h.observers[0].options.attributeFilter), ['class']);
  assert.equal(h.observers[0].options.subtree, undefined);
});

test('every supported text control restores input/cursor/paste policy and blur disables it', () => {
  const h = harness({ reading: true });
  const fields = ['text', 'search', 'email', 'url', 'tel', 'password', 'number']
    .map(type => control('INPUT', { type }));
  fields.push(control('TEXTAREA'), control('DIV', { isContentEditable: true }),
    control('INPUT', { readOnly: true }), control('TEXTAREA', { readOnly: true }));
  for (const field of fields) {
    h.messages.length = 0;
    h.focus(field);
    h.focus(null);
    assert.deepEqual(h.messages, [true, false], `${field.tagName}/${field.type}`);
  }
});

test('editor-to-editor focus does not briefly turn typing off', () => {
  const h = harness({ reading: true });
  h.focus(control());
  h.focus(control('TEXTAREA'));
  assert.deepEqual(h.messages, [false, true]);
  h.focus(null);
  assert.deepEqual(h.messages, [false, true, false]);
});

test('reader buttons, sliders, disabled/detached fields and contenteditable=false are not editors', () => {
  const h = harness({ reading: true });
  for (const element of [control('BUTTON'), control('INPUT', { type: 'range' }),
    control('INPUT', { type: 'checkbox' }), control('INPUT', { type: 'button' }),
    control('INPUT', { disabled: true }), control('TEXTAREA', { disabled: true }),
    control('INPUT', { isConnected: false }), control('DIV', { contentEditable: 'false' }),
    control('IFRAME')]) h.focus(element);
  assert.deepEqual(h.messages, [false]);
});

test('cold document attaches the body observer when ready; reinjection never duplicates it', () => {
  const h = harness({ reading: true, bodyReady: false });
  assert.equal(h.observers.length, 0);
  h.ready();
  assert.deepEqual(h.messages, [false]);
  const listeners = [...h.document.listeners].map(([name, entries]) => [name, entries.length]);
  h.run(); h.run();
  assert.equal(h.observers.length, 1);
  assert.deepEqual([...h.document.listeners].map(([name, entries]) => [name, entries.length]), listeners);
  assert.deepEqual(h.messages, [false, false, false]);
});

test('pageshow, visibility and native resume resend even if the last web state was identical', () => {
  const h = harness({ reading: true });
  h.window.emit('pageshow');
  h.document.emit('visibilitychange');
  h.run();
  assert.deepEqual(h.messages, [false, false, false, false]);
  h.read(false);
  h.window.emit('pageshow');
  assert.deepEqual(h.messages.slice(-2), [true, true]);
});

test('late bridge and failed postMessage can recover on next state event', () => {
  const h = harness({ reading: true, bridge: false });
  assert.deepEqual(h.messages, []);
  h.attachBridge(); h.classesChanged();
  assert.deepEqual(h.messages, [false]);
  const post = h.handler.postMessage;
  h.handler.postMessage = () => { throw new Error('bridge unavailable'); };
  h.read(false);
  h.handler.postMessage = post;
  h.classesChanged();
  assert.deepEqual(h.messages, [false, true]);
});

test('external documents never install the app policy or send a native message', () => {
  for (const origin of ['https://example.com', 'breeze://untrusted', 'https://localhost']) {
    const h = harness({ reading: true, origin });
    assert.deepEqual(h.messages, []);
    assert.equal(h.observers.length, 0);
    assert.equal(h.document.listeners.size, 0);
  }
});

test('native integration uses the public preference in the trusted main frame on iPhone AND iPad', () => {
  const install = native.indexOf('add(self, name: Self.readerSelectionHandler)');
  assert.ok(install > native.indexOf('override func capacitorDidLoad()'));
  assert.ok(install < native.indexOf('let inkPad ='), 'must not be iPad/ink-only');
  assert.match(native, /WKUserScript\(source: Self\.readerSelectionScript, injectionTime: \.atDocumentStart, forMainFrameOnly: true\)/);
  const receive = native.match(/if message.name == Self.readerSelectionHandler \{([\s\S]*?)\n        if message.name == "breezeInkScope"/)[1];
  for (const guard of ['message.frameInfo.isMainFrame', 'message.frameInfo.securityOrigin.protocol == "breeze"',
    'message.frameInfo.securityOrigin.host == "localhost"', 'message.body as? Bool', '#available(iOS 14.5, *)']) {
    assert.ok(receive.includes(guard), `missing bridge guard: ${guard}`);
  }
  assert.match(receive, /preferences\.isTextInteractionEnabled != enabled[\s\S]*preferences\.isTextInteractionEnabled = enabled/);
  assert.match(native, /func sceneDidBecomeActive[\s\S]*refreshReaderSelectionPolicy\(\)/);
  assert.doesNotMatch(script, /preventDefault|stopPropagation|setInterval|setTimeout|user-select|caretRangeFromPoint/);
});
