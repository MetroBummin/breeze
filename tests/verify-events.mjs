import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function install(options={}){
  const memory=new Map();
  const calls=[];
  let fetchError=null;
  let storageError=false;
  const localStorage={
    getItem(key){
      if(storageError)throw new Error('storage down');
      return memory.has(key)?memory.get(key):null;
    },
    setItem(key,value){
      if(storageError)throw new Error('storage down');
      memory.set(String(key),String(value));
    },
    removeItem(key){memory.delete(key);},
    key(index){return [...memory.keys()][index]??null;},
    get length(){return memory.size;}
  };
  const context={
    localStorage,URL,URLSearchParams,JSON,Date,Math,Number,String,Object,Array,
    Promise,setTimeout,clearTimeout,crypto,console,
    location:{search:options.search||'',hash:options.hash||'',protocol:'https:'},
    document:{referrer:options.referrer||''},
    BREEZE_CONFIG:{SB_URL:'https://example.supabase.co',SB_KEY:'anon-key'},
    fetch:async(url,init)=>{
      calls.push({url,init});
      if(fetchError)throw fetchError;
      return {ok:options.ok!==false,status:options.ok===false?500:201};
    }
  };
  context.globalThis=context;
  context.window=context;
  if(options.sb)context.sb=options.sb;
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../scripts/core/events.js',import.meta.url),'utf8'),context,{filename:'events.js'});
  return {context,memory,calls,failFetch(error){fetchError=error;},failStorage(){storageError=true;}};
}

test('parses the landing UTM convention and keeps the first touch',()=>{
  const {context,memory}=install();
  const parsed=value=>JSON.parse(JSON.stringify(value));
  assert.deepEqual(parsed(context.parseEventUtm('?utm_source=x&utm_medium=reply&utm_campaign=261026-test&utm_content=t1')),{
    utm_source:'x',utm_medium:'reply',utm_campaign:'261026-test',utm_content:'t1'
  });
  assert.deepEqual(parsed(context.parseEventUtm('utm_source=x&utm_medium=post&utm_campaign=261026-topic&utm_content=bio-slot')),{
    utm_source:'x',utm_medium:'post',utm_campaign:'261026-topic',utm_content:'bio-slot'
  });
  assert.deepEqual(parsed(context.parseEventUtm('?utm_source=<script>&utm_medium=reply%20post&utm_campaign=ok&utm_extra=no')),{
    utm_campaign:'ok'
  });
  context.captureLandingUtm('?utm_source=x&utm_medium=bio&utm_campaign=261026-test&utm_content=t1');
  context.captureLandingUtm('?utm_source=other&utm_medium=post&utm_campaign=later&utm_content=t2');
  assert.deepEqual(JSON.parse(memory.get('breeze.events.utm')),{
    utm_source:'x',utm_medium:'bio',utm_campaign:'261026-test',utm_content:'t1'
  });
});

test('an automated browser does not record',async()=>{
  const {context,calls}=install();
  context.navigator={webdriver:true};
  context.trackEvent('app_open');
  context.trackEvent('first_word_tap');
  await context.eventFlush();
  assert.equal(calls.length,0);
});

test('a failed send and a broken storage do nothing to the caller',async()=>{
  const broken=install();
  broken.failFetch(new Error('offline'));
  assert.doesNotThrow(()=>broken.context.trackEvent('onboarding_start',{replay:false}));
  await broken.context.eventFlush();
  assert.equal(broken.calls.length,1);
  assert.equal(broken.calls[0].init.headers.Prefer,'return=minimal');
  assert.doesNotThrow(()=>broken.context.trackEvent('not-an-event'));

  const storage=install();
  storage.failStorage();
  assert.doesNotThrow(()=>storage.context.captureLandingUtm('?utm_source=x&utm_medium=reply'));
  assert.doesNotThrow(()=>storage.context.trackEvent('app_open'));
  assert.doesNotThrow(()=>storage.context.parseEventUtm('?utm_source=x'));
});

test('batches inserts, dedupes milestones, and attaches the first-touch UTM',async()=>{
  const {context,calls}=install({search:'?utm_source=x&utm_medium=reply&utm_campaign=261026-test&utm_content=t1'});
  context.trackEvent('app_open');
  context.trackEvent('app_open');
  context.trackEvent('first_word_tap');
  context.trackEvent('first_word_tap');
  context.trackEvent('vocab_save',{first:false,word:'secret'});
  context.trackEvent('vocab_save');
  await context.eventFlush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,'https://example.supabase.co/rest/v1/product_events');
  assert.equal(calls[0].init.method,'POST');
  assert.equal(calls[0].init.headers.Prefer,'return=minimal');
  assert.equal(calls[0].init.headers.Authorization,'Bearer anon-key');
  const body=JSON.parse(calls[0].init.body);
  assert.deepEqual(body.map(row=>row.name),['app_open','first_word_tap','vocab_save']);
  for(const row of body){
    assert.equal(row.app_version,'1.9.9');
    assert.equal(row.platform,'web');
    assert.equal(row.onboarding_version,'v1');
    assert.equal(row.utm_source,'x');
    assert.equal(row.utm_medium,'reply');
    assert.equal(row.utm_campaign,'261026-test');
    assert.equal(row.utm_content,'t1');
    assert.equal(row.user_id,undefined);
    assert.match(row.device_id,/^[A-Za-z0-9-]{8,64}$/);
  }
  assert.deepEqual(body[2].props,{first:true});
  assert.equal(JSON.stringify(body).includes('secret'),false);
});

test('captures first-touch UTM from the hash when the search is empty',async()=>{
  const {context,memory,calls}=install({
    hash:'#/app?utm_source=toss&utm_medium=webview&utm_campaign=261030-x&utm_content=c1'
  });
  context.captureLandingUtm();
  assert.deepEqual(JSON.parse(memory.get('breeze.events.utm')),{
    utm_source:'toss',utm_medium:'webview',utm_campaign:'261030-x',utm_content:'c1'
  });
  context.trackEvent('app_open');
  await context.eventFlush();
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body[0].utm_source,'toss');
  assert.equal(body[0].utm_medium,'webview');
});

test('captures a sanitized first-touch referrer, immutably, and attaches it',async()=>{
  const {context,memory,calls}=install({referrer:'https://www.google.com/search?q=secret+query'});
  context.captureLandingUtm();
  // Only the origin survives; the query/path that could carry PII is dropped.
  assert.equal(JSON.parse(memory.get('breeze.events.ref')),'https://www.google.com');
  // First touch is immutable: a later referrer does not overwrite it.
  context.document.referrer='https://evil.example.com';
  context.captureLandingUtm();
  assert.equal(JSON.parse(memory.get('breeze.events.ref')),'https://www.google.com');
  context.trackEvent('app_open');
  await context.eventFlush();
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body[0].referrer,'https://www.google.com');
});

test('drops an over-long or unsanitary referrer rather than storing it',()=>{
  const long='https://'+'a'.repeat(200)+'.example.com';
  const {context,memory}=install({referrer:long});
  context.captureLandingUtm();
  assert.equal(memory.has('breeze.events.ref'),false);

  const bad=install({referrer:'android-app://com.sneaky app/with spaces'});
  bad.context.captureLandingUtm();
  assert.equal(bad.memory.has('breeze.events.ref'),false);
});

test('a signed-in session sends the session JWT, not the anon key',async()=>{
  const sb={auth:{getSession:async()=>({data:{session:{access_token:'signed-in-jwt'}}})}};
  const {context,calls}=install({sb});
  context.trackEvent('app_open');
  await context.eventFlush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.headers.Authorization,'Bearer signed-in-jwt');
  assert.equal(calls[0].init.headers.apikey,'anon-key');
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body[0].user_id,undefined);
});

test('a logged-out reader still inserts with the anon key and no user_id',async()=>{
  const {context,calls}=install();
  context.trackEvent('app_open');
  await context.eventFlush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].init.headers.Authorization,'Bearer anon-key');
  const body=JSON.parse(calls[0].init.body);
  assert.equal(body[0].user_id,undefined);
  assert.equal(body[0].referrer,undefined);
});

test('the app wires each funnel event through the logger',()=>{
  const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
  const index=read('index.html');
  assert.match(index,/scripts\/core\/events\.js/);
  assert.match(read('scripts/main.js'),/trackEvent\('app_open'\)/);
  const onboarding=read('scripts/ui/onboarding.js');
  assert.match(onboarding,/trackEvent\('onboarding_start',\{replay:!!replay\}\)/);
  assert.match(onboarding,/trackEvent\('onboarding_step_complete'/);
  assert.match(onboarding,/trackEvent\('onboarding_step_skip'/);
  assert.match(onboarding,/trackEvent\('onboarding_choice',\{choice:'import'\}\)/);
  const dictionary=read('scripts/dictionary/dictionary.js');
  assert.match(dictionary,/trackEvent\('first_word_tap'\)/);
  assert.match(dictionary,/trackEvent\('first_lookup_success'\)/);
  const applyLook=dictionary.slice(dictionary.indexOf('function applyLook'),dictionary.indexOf('/* A failed first lookup'));
  assert.match(applyLook,/trackEvent\('first_lookup_success'\)/);
  const detected=dictionary.slice(dictionary.indexOf('function saveDetectedExpression'),dictionary.indexOf('async function loadCachedLook'));
  assert.match(detected,/trackEvent\('first_lookup_success'\)/);
  assert.match(dictionary,/trackEvent\('vocab_save',\{first:true\}\)/);
});
