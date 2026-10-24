/* iOS can set `breezeShareInboxPending` (even to []) while deferred scripts are
   still running. `shared-links.js` then loads before `reader.js`, which defines
   `updateCompletionBadge`. Parsing every script as one program hides that:
   function declarations hoist. This evaluates the share script alone, in the
   same state WebKit is in between deferred scripts (`readyState === 'interactive'`). */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';

const source = readFileSync(new URL('../scripts/library/shared-links.js', import.meta.url), 'utf8');

function boot({inbox, ready = 'interactive', badge = false} = {}){
  const {document, window: dom} = parseHTML('<!doctype html><html><body><div class="view on" id="v-home"></div><div id="casual-rail"></div></body></html>');
  let readyState = ready;
  Object.defineProperty(document, 'readyState', {configurable: true, get: () => readyState});
  const paints = {home: 0, badge: 0};
  const listeners = new Map();
  const sandbox = {
    document,
    URL,
    Map,
    Set,
    paints,
    addEventListener(type, fn){
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn){
      listeners.set(type, (listeners.get(type) || []).filter(listener => listener !== fn));
    },
    dispatchEvent(event){
      for(const fn of listeners.get(event.type) || []) fn(event);
      return true;
    },
  };
  if(inbox !== undefined) sandbox.breezeShareInboxPending = inbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(`function activeAppView(){ return 'home'; }
function renderCasualLibrary(){ paints.home++; }
function renderHome(){ paints.home++; updateCompletionBadge(); }`, sandbox);
  if(badge) sandbox.updateCompletionBadge = () => { paints.badge++; };
  let failure = null;
  try {
    vm.runInContext(source, sandbox, {filename: 'scripts/library/shared-links.js'});
  } catch(error) {
    failure = error;
  }
  return {
    sandbox, document, dom, paints, failure,
    setReady(state){ readyState = state; },
    finishParsing(){
      readyState = 'complete';
      document.dispatchEvent(new dom.Event('DOMContentLoaded'));
    },
  };
}

const ios = boot({inbox: []});
assert.equal(ios.failure, null, ios.failure && ios.failure.message);
assert.equal(ios.paints.home, 0, 'an empty inbox painted Home before reader.js');
assert.equal(typeof ios.sandbox.updateCompletionBadge, 'undefined');
ios.sandbox.dispatchEvent(new ios.dom.CustomEvent('breeze-share-inbox', {detail: []}));
assert.equal(ios.paints.home, 0, 'a share event painted Home before parsing finished');
ios.sandbox.updateCompletionBadge = () => { ios.paints.badge++; };
ios.finishParsing();
assert.equal(ios.paints.home, 1, 'the queued inbox never painted Home');
assert.equal(ios.paints.badge, 1, 'Home paint did not reach updateCompletionBadge');

const web = boot();
assert.equal(web.failure, null, web.failure && web.failure.message);
assert.equal(web.paints.home, 0);
web.sandbox.updateCompletionBadge = () => { web.paints.badge++; };
web.finishParsing();
assert.equal(web.paints.home, 0, 'finishing parsing with no inbox should not repaint');
web.setReady('complete');
web.sandbox.receiveSharedLinks([]);
assert.equal(web.paints.home, 1, 'a share that arrives after startup should paint Home');
assert.equal(web.paints.badge, 1);

const loaded = boot({inbox: [], ready: 'complete', badge: true});
assert.equal(loaded.failure, null, loaded.failure && loaded.failure.message);
assert.equal(loaded.paints.home, 1, 'an inbox delivered after parsing should paint immediately');
assert.equal(loaded.paints.badge, 1);
