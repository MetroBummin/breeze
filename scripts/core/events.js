/* First-party product events. Fire-and-forget: the UI never waits, and a
   failed send is dropped. Rows live in public.product_events for 90 days.
   Prefer: return=minimal so an insert does not ship the row back. */
const BREEZE_APP_VERSION='2.0.0';
// tools/stamp-version.mjs writes the shell build hash here. It is the same
// value as sw.js VERSION. Older rows used the fixed 'v1'.
const BREEZE_ONBOARDING_VERSION='6e784220';
const EVENT_UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_content'];
const EVENT_UTM_KEY='breeze.events.utm';
const EVENT_REF_KEY='breeze.events.ref';
const EVENT_REF_CAP=128;
const EVENT_OPEN_KEY='breeze.events.app-open-day';
const EVENT_ONCE_KEY='breeze.events.once';
const EVENT_SENT_KEY='breeze.events.sent';
const EVENT_DEVICE_CAP=48;
const EVENT_NAMES={
  app_open:1,onboarding_start:1,onboarding_step_complete:1,onboarding_step_skip:1,
  onboarding_choice:1,first_word_tap:1,first_lookup_success:1,vocab_save:1,
  onboarding_closed:1,onboarding_intro_play:1,onboarding_word_pill:1,landing_view:1
};
// Names the server accepted before the onboarding-quality migration. A batch
// that mixes in a newer name is retried without those rows when the check
// constraint still rejects them, so the older events are not dropped.
const EVENT_LEGACY={
  app_open:1,onboarding_start:1,onboarding_step_complete:1,onboarding_step_skip:1,
  onboarding_choice:1,first_word_tap:1,first_lookup_success:1,vocab_save:1
};
const EVENT_OPTIONAL={referrer:1,browser:1,in_app:1};
const EVENT_BROWSERS={chrome:1,safari:1,firefox:1,edge:1,samsung:1,opera:1,other:1};
const EVENT_IN_APP={kakao:1,instagram:1,naver:1};
let eventQueue=[];
let eventTimer=0;
let eventFlushing=false;

function eventStoreGet(key){
  try{return JSON.parse(localStorage.getItem(key)||'null');}catch(e){return null;}
}
function eventStoreSet(key,value){
  try{localStorage.setItem(key,JSON.stringify(value));return true;}catch(e){return false;}
}
function eventLocalDay(){
  const now=new Date();
  const month=String(now.getMonth()+1).padStart(2,'0');
  const day=String(now.getDate()).padStart(2,'0');
  return now.getFullYear()+'-'+month+'-'+day;
}
function eventSentToday(){
  const sent=eventStoreGet(EVENT_SENT_KEY);
  return sent&&sent.day===eventLocalDay()&&typeof sent.n==='number'?sent.n:0;
}
function eventNoteSent(count){
  eventStoreSet(EVENT_SENT_KEY,{day:eventLocalDay(),n:eventSentToday()+count});
}
function parseEventUtm(search){
  const out={};
  try{
    const text=String(search||'');
    const params=new URLSearchParams(text.charAt(0)==='?'?text:'?'+text);
    for(let i=0;i<EVENT_UTM_KEYS.length;i++){
      const key=EVENT_UTM_KEYS[i];
      const raw=params.get(key);
      if(!raw)continue;
      const value=raw.trim().slice(0,64);
      if(/^[A-Za-z0-9._~-]{1,64}$/.test(value))out[key]=value;
    }
  }catch(e){}
  return out;
}
function sanitizeReferrer(raw){
  // Keep only a short origin/host form. We never store the path or query of a
  // referrer, which could carry PII; the CHECK on product_events.referrer uses
  // the same character class and 128-char cap.
  try{
    const text=String(raw||'').trim();
    if(!text)return '';
    let origin='';
    try{
      const u=new URL(text);
      // Keep only web origins. A non-http scheme or an unparseable referrer is
      // dropped rather than salvaged, so no odd app-scheme value is stored.
      if(u.protocol==='https:'||u.protocol==='http:')origin=u.protocol+'//'+u.host;
    }catch(e){origin='';}
    origin=String(origin||'');
    // Reject (do not truncate) anything past the cap: a sliced host is a bogus
    // value, and the CHECK on product_events.referrer caps at 128 too.
    if(origin.length>EVENT_REF_CAP)return '';
    return /^[A-Za-z0-9._:/~-]{1,128}$/.test(origin)?origin:'';
  }catch(e){return '';}
}
// First-touch acquisition capture. captureLandingUtm() runs once at module load
// (in the app shell), reading utm_* and a sanitized document.referrer and
// pinning them immutably in localStorage. The channels differ by surface:
//   * web app: the landing query string is on location.search.
//   * hash routing / some webviews: params survive only after '#', so we fall
//     back to location.hash when the search is empty.
//   * native Capacitor / Toss webviews: these open the app shell without the
//     landing query string at all, so location.search/hash are usually empty;
//     document.referrer is the only acquisition signal that may be present.
// Precedence is search, then hash, then referrer. We never fabricate values: if
// none are present, nothing is stored and the fields stay empty as before.
function captureLandingUtm(search){
  try{
    const existing=eventStoreGet(EVENT_UTM_KEY);
    let haveUtm=false;
    if(existing&&typeof existing==='object'&&!Array.isArray(existing)){
      for(let i=0;i<EVENT_UTM_KEYS.length;i++)if(typeof existing[EVENT_UTM_KEYS[i]]==='string'){haveUtm=true;break;}
    }
    let parsed=haveUtm?existing:null;
    if(!haveUtm){
      let source=search;
      if(source==null){
        try{source=typeof location!=='undefined'&&location?location.search:'';}catch(e){source='';}
      }
      parsed=parseEventUtm(source);
      if(!Object.keys(parsed).length){
        // Hash-based routing / webviews sometimes carry utm after '#'.
        let hash='';
        try{hash=search==null&&typeof location!=='undefined'&&location?String(location.hash||''):'';}catch(e){hash='';}
        if(hash){
          const hashQuery=hash.indexOf('?')>=0?hash.slice(hash.indexOf('?')):hash.replace(/^#/,'');
          parsed=parseEventUtm(hashQuery);
        }
      }
      if(Object.keys(parsed).length)eventStoreSet(EVENT_UTM_KEY,parsed);
    }
    captureLandingReferrer();
    return parsed||{};
  }catch(e){return {};}
}
function captureLandingReferrer(){
  try{
    const existing=eventStoreGet(EVENT_REF_KEY);
    if(typeof existing==='string')return existing;
    let raw='';
    try{raw=typeof document!=='undefined'&&document?String(document.referrer||''):'';}catch(e){raw='';}
    const ref=sanitizeReferrer(raw);
    if(ref)eventStoreSet(EVENT_REF_KEY,ref);
    return ref;
  }catch(e){return '';}
}
function eventDeviceId(){
  let id='';
  try{id=typeof load==='function'?load('breeze.device',''):'';}catch(e){id='';}
  if(typeof id!=='string'||!/^[A-Za-z0-9-]{8,64}$/.test(id)){
    try{
      id=(globalThis.crypto&&typeof crypto.randomUUID==='function')
        ?crypto.randomUUID()
        :'d'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);
    }catch(e){id='d'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);}
    try{
      if(typeof save==='function')save('breeze.device',id);
      else localStorage.setItem('breeze.device',JSON.stringify(id));
    }catch(e){}
  }
  return id;
}
function carryAppSearch(href, search){
  const target=String(href||'');
  const query=String(search||'');
  if(!query||query==='?')return target;
  if(target!=='../'&&target!=='/')return target;
  if(target.indexOf('?')>=0)return target;
  return target+query;
}
function eventUserAgent(){
  try{return typeof navigator!=='undefined'&&navigator?String(navigator.userAgent||''):'';}catch(e){return '';}
}
function eventInApp(ua){
  const text=String(ua||'');
  if(/KAKAOTALK/i.test(text))return 'kakao';
  if(/Instagram/i.test(text))return 'instagram';
  if(/NAVER/i.test(text))return 'naver';
  return '';
}
function eventBrowserFamily(ua){
  const text=String(ua||'');
  if(!text)return '';
  if(/Edg\/|EdgA\/|EdgiOS\//.test(text))return 'edge';
  if(/SamsungBrowser\//.test(text))return 'samsung';
  if(/Firefox\/|FxiOS\//.test(text))return 'firefox';
  if(/OPR\/|Opera\//.test(text))return 'opera';
  if(/Chrome\/|CriOS\/|Chromium\//.test(text))return 'chrome';
  if(/Safari\//.test(text))return 'safari';
  return 'other';
}
function eventPlatform(){
  try{
    const cap=globalThis.Capacitor;
    if(cap&&typeof cap.getPlatform==='function'){
      const name=cap.getPlatform();
      if(name==='ios'||name==='android')return name;
    }
    if(typeof location!=='undefined'&&location&&location.protocol==='breeze:')return 'ios';
  }catch(e){}
  return 'web';
}
function eventProps(name,props){
  props=props&&typeof props==='object'?props:{};
  if(name==='onboarding_start')return {replay:!!props.replay};
  if(name==='onboarding_step_complete'||name==='onboarding_step_skip'){
    const step=String(props.step||'').slice(0,24);
    if(!/^[a-z0-9_-]{1,24}$/.test(step))return null;
    const ms=Math.max(0,Math.min(3600000,Math.round(Number(props.ms)||0)));
    return {step:step,ms:ms};
  }
  if(name==='onboarding_choice'){
    const choice=String(props.choice||'').slice(0,24);
    if(!/^[a-z0-9_-]{1,24}$/.test(choice))return null;
    return {choice:choice};
  }
  if(name==='onboarding_closed'){
    const step=String(props.step||'').slice(0,24);
    if(!/^[a-z0-9_-]{1,24}$/.test(step))return null;
    const reason=String(props.reason||'').slice(0,24);
    if(!/^(?:esc|back|hidden|pagehide|dismiss)$/.test(reason))return null;
    const ms=Math.max(0,Math.min(3600000,Math.round(Number(props.ms)||0)));
    return {step:step,ms:ms,reason:reason};
  }
  if(name==='vocab_save')return {first:true};
  if(name==='onboarding_intro_play'||name==='onboarding_word_pill'||name==='landing_view')return {};
  return {};
}
function eventMarkOnce(name){
  const once=eventStoreGet(EVENT_ONCE_KEY);
  const flags=once&&typeof once==='object'?once:{};
  if(flags[name])return false;
  flags[name]=1;
  eventStoreSet(EVENT_ONCE_KEY,flags);
  return true;
}
function eventStoredToken(){
  try{
    const config=globalThis.BREEZE_CONFIG||{};
    const url=typeof config.SB_URL==='string'?config.SB_URL:'';
    if(!url)return '';
    const ref=new URL(url).hostname.split('.')[0];
    const parsed=JSON.parse(localStorage.getItem('sb-'+ref+'-auth-token')||'null');
    const token=parsed&&typeof parsed.access_token==='string'?parsed.access_token:'';
    if(!token)return '';
    if(typeof parsed.expires_at==='number'&&parsed.expires_at*1000<Date.now()+15000)return '';
    return token;
  }catch(e){return '';}
}
// A token getSession() already resolved. pagehide cannot await getSession, and
// the stored sb-*-auth-token is often missing on iOS, so the unload path
// keeps the token this page has already seen.
let eventLiveToken='';
// Bearer token for the events insert. Prefer the live Supabase client session
// (the same source as scripts/library/book-cloud.js) so a signed-in reader's
// JWT reaches the server and the product_events trigger sets user_id =
// auth.uid(). The raw localStorage 'sb-<ref>-auth-token' is only a fallback for
// when the live client is unavailable; it is stale or absent on iOS often
// enough that relying on it alone left user_id null. Logged-out readers resolve
// to no token here and fall back to the anon key in eventFlush.
async function eventAccessToken(){
  try{
    // sync.js declares `let sb`, a script-scope global that is not a window
    // property, so read the shared binding directly instead of window.sb.
    const client=typeof sb!=='undefined'?sb:null;
    const getSession=client&&client.auth&&typeof client.auth.getSession==='function'?client.auth.getSession.bind(client.auth):null;
    if(getSession){
      const result=await getSession();
      const token=result&&result.data&&result.data.session&&typeof result.data.session.access_token==='string'
        ?result.data.session.access_token:'';
      if(token){eventLiveToken=token;return token;}
      eventLiveToken='';
    }
  }catch(e){}
  const stored=eventStoredToken();
  if(stored)eventLiveToken=stored;
  return stored;
}
function eventRow(name,props){
  const cleaned=eventProps(name,props);
  if(!cleaned)return null;
  const device=eventDeviceId();
  if(!/^[A-Za-z0-9-]{8,64}$/.test(device))return null;
  const row={
    name:name,
    device_id:device,
    app_version:BREEZE_APP_VERSION,
    platform:eventPlatform(),
    onboarding_version:BREEZE_ONBOARDING_VERSION,
    props:cleaned
  };
  const utm=captureLandingUtm();
  for(let i=0;i<EVENT_UTM_KEYS.length;i++){
    const key=EVENT_UTM_KEYS[i];
    if(utm&&typeof utm[key]==='string')row[key]=utm[key];
  }
  const ref=eventStoreGet(EVENT_REF_KEY);
  if(typeof ref==='string'&&ref)row.referrer=ref;
  const ua=eventUserAgent();
  const browser=eventBrowserFamily(ua);
  const inApp=eventInApp(ua);
  if(EVENT_BROWSERS[browser])row.browser=browser;
  if(EVENT_IN_APP[inApp])row.in_app=inApp;
  return row;
}
function eventFlushSoon(delay){
  try{
    clearTimeout(eventTimer);
    eventTimer=setTimeout(()=>{eventTimer=0;eventFlush();},delay);
  }catch(e){eventFlush();}
}
function eventConfig(){
  let url='',key='';
  try{
    const config=globalThis.BREEZE_CONFIG||{};
    url=typeof config.SB_URL==='string'?config.SB_URL:(typeof SB_URL==='string'?SB_URL:'');
    key=typeof config.SB_KEY==='string'?config.SB_KEY:(typeof SB_KEY==='string'?SB_KEY:'');
  }catch(e){return null;}
  if(!url||!key||typeof fetch!=='function')return null;
  return {url:url.replace(/\/$/,''),key:key};
}
// Optional columns and new event names ship before their migration is applied.
// This page remembers what the server rejected so a later batch still inserts.
// 'unknown' until a send answers, 'extended' once a new event name is accepted,
// 'legacy' once the name check rejects one.
let eventNamesReady='unknown';
const eventMissingColumns={};
const eventOptionalOk={};
function eventStripRow(row,unload){
  const copy={};
  for(const key in row){
    if(eventMissingColumns[key])continue;
    if(unload&&EVENT_OPTIONAL[key]&&!eventOptionalOk[key])continue;
    copy[key]=row[key];
  }
  return copy;
}
function eventPrepare(batch,unload){
  const rows=[];
  for(let i=0;i<batch.length;i++){
    if(eventNamesReady==='legacy'&&!EVENT_LEGACY[batch[i].name])continue;
    rows.push(eventStripRow(batch[i],unload));
  }
  return rows;
}
function eventUnloadGroups(batch){
  if(eventNamesReady==='extended')return [eventPrepare(batch,true)];
  const legacy=[],novel=[];
  for(let i=0;i<batch.length;i++){
    const row=eventStripRow(batch[i],true);
    if(EVENT_LEGACY[batch[i].name])legacy.push(row);
    else if(eventNamesReady!=='legacy')novel.push(row);
  }
  const groups=[];
  if(legacy.length)groups.push(legacy);
  if(novel.length)groups.push(novel);
  return groups;
}
function eventNoteAccepted(rows){
  for(let i=0;i<rows.length;i++){
    for(const key in EVENT_OPTIONAL){
      if(Object.prototype.hasOwnProperty.call(rows[i],key))eventOptionalOk[key]=1;
    }
    if(!EVENT_LEGACY[rows[i].name])eventNamesReady='extended';
  }
}
// PostgREST answers an unknown insert column with 400 and code PGRST204
// ("Could not find the 'referrer' column of 'product_events' in the schema
// cache"). Postgres itself would say 42703. A name the check constraint does
// not list yet is 23514 product_events_name_chk. Anything else is not retried.
function eventSchemaMiss(response){
  if(!response||response.status!==400||typeof response.json!=='function')return Promise.resolve(null);
  return Promise.resolve().then(()=>response.json()).then(body=>{
    const code=body&&typeof body.code==='string'?body.code:'';
    const text=body?String(body.message||'')+' '+String(body.details||''):'';
    if(code==='23514'&&/product_events_name_chk/.test(text))return {legacy:true};
    if(code!=='PGRST204'&&code!=='42703')return null;
    const quoted=text.match(/'([A-Za-z0-9_]+)' column/)||text.match(/"([A-Za-z0-9_]+)"/);
    return quoted?{column:quoted[1]}:null;
  }).catch(()=>null);
}
function eventDispatch(url,key,token,batch){
  return fetch(url+'/rest/v1/product_events',{
    method:'POST',
    keepalive:true,
    headers:{
      'Content-Type':'application/json',
      apikey:key,
      Authorization:'Bearer '+(token||key),
      Prefer:'return=minimal'
    },
    body:JSON.stringify(batch)
  });
}
// eventFlush() normally resolves the bearer via the async getSession()-preferred
// eventAccessToken() so a signed-in reader's JWT reaches the server. On the
// pagehide/unload path we cannot afford to await a microtask: the event loop may
// never resume to dispatch the keepalive fetch, dropping the final queued event
// (commonly app_open). Passing unload=true takes a synchronous fast path that
// uses the token already resolved this page (else the stored token, else the
// anon key) and fires the fetch in the same tick.
function eventFlush(unload){
  if(!eventQueue.length)return Promise.resolve();
  // An in-flight flush already took its batch. pagehide must still send whatever
  // was queued after that, or the close event is left behind when the page dies.
  if(eventFlushing&&!unload)return Promise.resolve();
  const batch=eventQueue.splice(0,8);
  const cfg=eventConfig();
  if(!cfg)return Promise.resolve();
  if(unload){
    try{
      const token=eventLiveToken||eventStoredToken();
      const groups=eventUnloadGroups(batch);
      let result=Promise.resolve();
      for(let i=0;i<groups.length;i++){
        if(!groups[i].length)continue;
        const pending=eventDispatch(cfg.url,cfg.key,token,groups[i]);
        result=pending&&typeof pending.then==='function'?pending.then(()=>{},()=>{}):result;
      }
      if(groups.length)eventNoteSent(batch.length);
      return result;
    }catch(e){return Promise.resolve();}
  }
  eventFlushing=true;
  // Only the internal flush awaits the async token lookup; trackEvent() stays
  // fire-and-forget so callers never block on getSession().
  let sent=eventPrepare(batch,false);
  let tries=0;
  let token='';
  let skipped=false;
  const send=()=>eventDispatch(cfg.url,cfg.key,token,sent);
  const attempt=()=>{
    if(!sent.length){skipped=true;return Promise.resolve(null);}
    return send().then(response=>{
      if(!response||response.ok||tries>=2)return response;
      return eventSchemaMiss(response).then(miss=>{
        if(!miss)return response;
        tries++;
        if(miss.column)eventMissingColumns[miss.column]=1;
        if(miss.legacy)eventNamesReady='legacy';
        const next=eventPrepare(batch,false);
        if(!next.length){skipped=true;return response;}
        if(JSON.stringify(next)===JSON.stringify(sent))return response;
        sent=next;
        return attempt();
      });
    });
  };
  return Promise.resolve().then(()=>eventAccessToken()).then(value=>{
    token=value;
    return attempt();
  }).then(response=>{
    eventFlushing=false;
    if(!skipped&&response&&response.ok){
      eventNoteAccepted(sent);
      eventNoteSent(sent.length);
    }
    if((skipped||(response&&response.ok))&&eventQueue.length)return eventFlush();
  }).catch(()=>{eventFlushing=false;});
}
function trackEvent(name,props){
  try{
    // Playwright and other automated browsers set this. Real readers do not.
    if(typeof navigator!=='undefined'&&navigator.webdriver)return;
    if(!EVENT_NAMES[name]||eventSentToday()>=EVENT_DEVICE_CAP)return;
    if(name==='app_open'){
      const day=eventLocalDay();
      if(eventStoreGet(EVENT_OPEN_KEY)===day)return;
      eventStoreSet(EVENT_OPEN_KEY,day);
      props=null;
    }else if(name==='first_word_tap'||name==='first_lookup_success'||name==='vocab_save'){
      if(!eventMarkOnce(name))return;
      props=name==='vocab_save'?{first:true}:null;
    }
    const row=eventRow(name,props||{});
    if(!row)return;
    eventQueue.push(row);
    if(eventQueue.length>20)eventQueue.splice(0,eventQueue.length-20);
    eventFlushSoon(eventQueue.length>=8?0:700);
  }catch(e){}
}
try{captureLandingUtm();}catch(e){}
try{
  if(typeof window!=='undefined'&&window.addEventListener){
    window.addEventListener('pagehide',()=>{try{eventFlush(true);}catch(e){}});
    // Defer scripts, including sync.js, have finished by load, so sb exists
    // and a quick pagehide can still attach the signed-in user.
    window.addEventListener('load',()=>{try{eventAccessToken();}catch(e){}});
  }
}catch(e){}
