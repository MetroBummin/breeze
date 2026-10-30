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
    location:{search:options.search||'',hostname:options.hostname||'breeze.io.kr',protocol:'https:'},
    document:{referrer:options.referrer||''},
    BREEZE_CONFIG:{SB_URL:'https://example.supabase.co',SB_KEY:'anon-key'},
    fetch:async(url,init)=>{
      calls.push({url,init});
      if(fetchError)throw fetchError;
      const status=options.status?options.status(init,calls.length):(options.ok===false?500:201);
      return {ok:status>=200&&status<300,status};
    }
  };
  context.globalThis=context;
  context.window=context;
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

test('stores the first external referrer host with the UTM, never the landing page itself',()=>{
  const parsed=value=>JSON.parse(JSON.stringify(value));
  const external=install({referrer:'https://www.google.com/search?q=secret'});
  assert.deepEqual(parsed(external.context.captureLandingUtm()),{referrer_host:'google.com'});
  assert.equal(JSON.stringify(parsed(external.context.captureLandingUtm('?utm_source=later'))).includes('later'),false);
  const own=install({search:'?utm_source=x',referrer:'https://breeze.io.kr/landing/'});
  assert.deepEqual(parsed(own.context.captureLandingUtm()),{utm_source:'x'});
  const forwarded=install({search:'?utm_source=threads&ref_host=www.threads.net',referrer:'https://breeze.io.kr/landing/'});
  assert.deepEqual(parsed(forwarded.context.captureLandingUtm()),{utm_source:'threads',referrer_host:'threads.net'});
  const junk=install({search:'?ref_host=https://evil.example/path',referrer:'not a url'});
  assert.deepEqual(parsed(junk.context.captureLandingUtm()),{});
});

function signIn(memory,{expiresIn=3600,token='user-token'}={}){
  memory.set('sb-example-auth-token',JSON.stringify({access_token:token,expires_at:Math.floor(Date.now()/1000)+expiresIn,user:{id:'44444444-4444-4444-8444-444444444444'}}));
}

test('a signed-in reader sends the access token so the database sets user_id',async()=>{
  const {context,memory,calls}=install();
  signIn(memory);
  context.trackEvent('app_open');
  await context.eventFlush();
  assert.equal(calls[0].init.headers.Authorization,'Bearer user-token');
  assert.equal(JSON.parse(calls[0].init.body)[0].user_id,undefined,'the client must not claim a user id');
});

test('an expired stored token waits for the SDK session instead of sending anon',async()=>{
  const {context,memory,calls}=install();
  signIn(memory,{expiresIn:-60,token:'stale'});
  let asked=0;
  context.trackEvent('app_open');
  setTimeout(()=>{context.sb={auth:{getSession:async()=>{asked++;return {data:{session:{access_token:'refreshed',expires_at:Math.floor(Date.now()/1000)+3600}}};}}};},200);
  await context.eventFlush();
  assert.equal(asked,1);
  assert.equal(calls[0].init.headers.Authorization,'Bearer refreshed');
});

test('an anonymous device never waits for a session',async()=>{
  const {context,calls}=install();
  const started=Date.now();
  context.trackEvent('app_open');
  await context.eventFlush();
  assert.ok(Date.now()-started<500);
  assert.equal(calls[0].init.headers.Authorization,'Bearer anon-key');
});

test('a rejected token resends as anonymous, and a missing column resends without referrer_host',async()=>{
  const rejected=install({status:init=>init.headers.Authorization==='Bearer user-token'?401:201});
  signIn(rejected.memory);
  rejected.context.trackEvent('app_open');
  await rejected.context.eventFlush();
  assert.deepEqual(rejected.calls.map(c=>c.init.headers.Authorization),['Bearer user-token','Bearer anon-key']);
  assert.equal(rejected.context.eventSentToday(),1);

  const old=install({referrer:'https://t.co/x',status:init=>init.body.includes('referrer_host')?400:201});
  old.context.trackEvent('app_open');
  await old.context.eventFlush();
  assert.equal(old.calls.length,2);
  assert.equal(JSON.parse(old.calls[0].init.body)[0].referrer_host,'t.co');
  assert.equal(JSON.parse(old.calls[1].init.body)[0].referrer_host,undefined);
  assert.equal(old.context.eventSentToday(),1);
});

test('the landing page forwards UTM and the external referrer to the app links only',()=>{
  const source=readFileSync(new URL('../landing/landing.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('function lpForwardTouch'),source.indexOf('(function lpForwardLinks'));
  const run=(search,referrer)=>vm.runInNewContext(fn+';lpForwardTouch(search,referrer)',{URL,URLSearchParams,location:{hostname:'breeze.io.kr'},search,referrer});
  assert.equal(run('?utm_source=x&utm_medium=reply&utm_campaign=261030-a&utm_content=t1&other=1','https://www.threads.net/@breeze'),
    'utm_source=x&utm_medium=reply&utm_campaign=261030-a&utm_content=t1&ref_host=threads.net');
  assert.equal(run('','https://breeze.io.kr/'),'');
  assert.equal(run('?utm_source=<b>',''),'');
  assert.match(source,/a\.lp-cta-web\[href="\.\.\/"\]/);
});
