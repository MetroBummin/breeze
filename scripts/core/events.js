/* First-party product events. Fire-and-forget: the UI never waits, and a
   failed send is dropped. Rows live in public.product_events for 90 days.
   Prefer: return=minimal so an insert does not ship the row back. */
const BREEZE_APP_VERSION='1.9.9';
const BREEZE_ONBOARDING_VERSION='v1';
const EVENT_UTM_KEYS=['utm_source','utm_medium','utm_campaign','utm_content'];
const EVENT_TOUCH_KEYS=EVENT_UTM_KEYS.concat('referrer_host');
const EVENT_UTM_KEY='breeze.events.utm';
const EVENT_OPEN_KEY='breeze.events.app-open-day';
const EVENT_ONCE_KEY='breeze.events.once';
const EVENT_SENT_KEY='breeze.events.sent';
const EVENT_DEVICE_CAP=48;
const EVENT_NAMES={
  app_open:1,onboarding_start:1,onboarding_step_complete:1,onboarding_step_skip:1,
  onboarding_choice:1,first_word_tap:1,first_lookup_success:1,vocab_save:1
};
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
/* Host name only, lowercased, no path or query. Anything else is dropped. */
function eventCleanHost(raw){
  const host=String(raw||'').trim().toLowerCase().replace(/^www\./,'').slice(0,253);
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/.test(host)?host:'';
}
function eventOwnHost(){
  try{return eventCleanHost(typeof location!=='undefined'&&location?location.hostname:'');}catch(e){return '';}
}
/* The landing page forwards the visitor's external referrer as ref_host,
   because the app itself only sees the landing page as its referrer. */
function parseEventReferrer(search,referrer){
  let host='';
  try{
    const text=String(search||'');
    host=eventCleanHost(new URLSearchParams(text.charAt(0)==='?'?text:'?'+text).get('ref_host'));
  }catch(e){host='';}
  if(!host){
    try{host=referrer?eventCleanHost(new URL(String(referrer)).hostname):'';}catch(e){host='';}
  }
  const own=eventOwnHost();
  if(!host||(own&&(host===own||host.endsWith('.'+own))))return '';
  return host;
}
function captureLandingUtm(search,referrer){
  try{
    const existing=eventStoreGet(EVENT_UTM_KEY);
    if(existing&&typeof existing==='object'&&!Array.isArray(existing)){
      for(let i=0;i<EVENT_TOUCH_KEYS.length;i++)if(typeof existing[EVENT_TOUCH_KEYS[i]]==='string')return existing;
    }
    let source=search;
    if(source==null){
      try{source=typeof location!=='undefined'&&location?location.search:'';}catch(e){source='';}
    }
    let from=referrer;
    if(from==null){
      try{from=typeof document!=='undefined'&&document?document.referrer:'';}catch(e){from='';}
    }
    const parsed=parseEventUtm(source);
    const host=parseEventReferrer(source,from);
    if(host)parsed.referrer_host=host;
    if(Object.keys(parsed).length)eventStoreSet(EVENT_UTM_KEY,parsed);
    return parsed;
  }catch(e){return {};}
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
  if(name==='vocab_save')return {first:true};
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
function eventAuthRecord(){
  try{
    const config=globalThis.BREEZE_CONFIG||{};
    const url=typeof config.SB_URL==='string'?config.SB_URL:'';
    if(!url)return null;
    const ref=new URL(url).hostname.split('.')[0];
    const parsed=JSON.parse(localStorage.getItem('sb-'+ref+'-auth-token')||'null');
    return parsed&&typeof parsed==='object'?parsed:null;
  }catch(e){return null;}
}
function eventFreshToken(record){
  const token=record&&typeof record.access_token==='string'?record.access_token:'';
  if(!token)return '';
  if(typeof record.expires_at==='number'&&record.expires_at*1000<Date.now()+15000)return '';
  return token;
}
function eventAccessToken(){return eventFreshToken(eventAuthRecord());}
function eventAuthClient(){
  try{
    const client=typeof sb!=='undefined'?sb:null;
    return client&&client.auth&&typeof client.auth.getSession==='function'?client:null;
  }catch(e){return null;}
}
const EVENT_AUTH_WAIT_MS=3000;
/* A signed-in reader's stored access token is usually expired when the app
   opens (it lasts an hour), and app_open fires before supabase-js refreshes it.
   Sending the anon key then records user_id = null. So when this device has a
   stored session but no fresh token, wait briefly for the SDK's own session.
   An anonymous device has no stored session and never waits. */
function eventAuthToken(){
  const record=eventAuthRecord();
  const fresh=eventFreshToken(record);
  if(fresh||!record||!record.user)return Promise.resolve(fresh);
  const until=Date.now()+EVENT_AUTH_WAIT_MS;
  return new Promise(resolve=>{
    let done=false;
    const finish=value=>{if(!done){done=true;resolve(typeof value==='string'?value:'');}};
    setTimeout(()=>finish(eventAccessToken()),EVENT_AUTH_WAIT_MS);
    const attempt=()=>{
      if(done)return;
      const client=eventAuthClient();
      if(!client){
        if(Date.now()<until)setTimeout(attempt,150);
        return;
      }
      Promise.resolve().then(()=>client.auth.getSession()).then(result=>{
        const session=result&&result.data&&result.data.session;
        finish(eventFreshToken(session)||eventAccessToken());
      }).catch(()=>finish(eventAccessToken()));
    };
    attempt();
  });
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
  for(let i=0;i<EVENT_TOUCH_KEYS.length;i++){
    const key=EVENT_TOUCH_KEYS[i];
    if(utm&&typeof utm[key]==='string')row[key]=utm[key];
  }
  return row;
}
function eventFlushSoon(delay){
  try{
    clearTimeout(eventTimer);
    eventTimer=setTimeout(()=>{eventTimer=0;eventFlush();},delay);
  }catch(e){eventFlush();}
}
function eventFlush(){
  if(eventFlushing||!eventQueue.length)return Promise.resolve();
  const batch=eventQueue.splice(0,8);
  let url='',key='';
  try{
    const config=globalThis.BREEZE_CONFIG||{};
    url=typeof config.SB_URL==='string'?config.SB_URL:(typeof SB_URL==='string'?SB_URL:'');
    key=typeof config.SB_KEY==='string'?config.SB_KEY:(typeof SB_KEY==='string'?SB_KEY:'');
  }catch(e){return Promise.resolve();}
  if(!url||!key||typeof fetch!=='function')return Promise.resolve();
  eventFlushing=true;
  const endpoint=url.replace(/\/$/,'')+'/rest/v1/product_events';
  const send=(rows,token)=>fetch(endpoint,{
    method:'POST',
    keepalive:true,
    headers:{
      'Content-Type':'application/json',
      apikey:key,
      Authorization:'Bearer '+(token||key),
      Prefer:'return=minimal'
    },
    body:JSON.stringify(rows)
  });
  let rows=batch;
  return eventAuthToken().catch(()=>'').then(token=>send(rows,token).then(response=>{
    if(response&&response.ok)return response;
    const status=response&&response.status;
    // A rejected user token still records the rows, as anonymous.
    if(token&&status===401)return send(rows,'');
    // A database without the referrer_host column rejects the whole batch.
    if(status===400&&rows.some(row=>'referrer_host' in row)){
      rows=rows.map(row=>{const copy=Object.assign({},row);delete copy.referrer_host;return copy;});
      return send(rows,token);
    }
    return response;
  })).then(response=>{
    eventFlushing=false;
    if(response&&response.ok){
      eventNoteSent(batch.length);
      if(eventQueue.length)return eventFlush();
    }
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
    window.addEventListener('pagehide',()=>{try{eventFlush();}catch(e){}});
  }
}catch(e){}
