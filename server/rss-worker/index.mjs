/* Fixed public RSS transport. No arbitrary URL, credentials, HTML parsing,
 * Supabase access, book relay bindings or background loops. */
import {FEEDS} from '../rss-quality/feeds.mjs';
export const MAX_BYTES=3000000,TTL=600,TIMEOUT_MS=8000;
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, OPTIONS','X-Content-Type-Options':'nosniff'};
const error=(status,message)=>new Response(JSON.stringify({error:message}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
// Add aliases only after a live publisher redirect has been reviewed.
export const REDIRECT_ALIASES={};
function destination(raw,current,feed,aliases){
 const u=new URL(raw,current),original=new URL(feed.url);
 if(u.protocol!=='https:'||u.hostname!==original.hostname||u.port||u.username||u.password)throw Error('redirect');
 u.hash='';if(u.href!==original.href&&!aliases.includes(u.href))throw Error('redirect');return u;
}
async function bounded(body){
 if(!body)throw Error('empty');const reader=body.getReader(),chunks=[];let total=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;total+=value.byteLength;if(total>MAX_BYTES)throw Error('size');chunks.push(value);}}
 catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 if(!total)throw Error('empty');const bytes=new Uint8Array(total);let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}return bytes;
}
export function createWorker({fetcher=fetch,cacheProvider=()=>caches.default,aliases=REDIRECT_ALIASES}={}){
 return {async fetch(request,_env,ctx){
  const u=new URL(request.url);
  if(u.pathname==='/health'&&request.method==='GET')return new Response('rss-transport-v1',{headers:{...cors,'Cache-Control':'no-store'}});
  const m=u.pathname.match(/^\/feeds\/(0|[1-9]\d?)$/),id=m?Number(m[1]):-1;
  if(!FEEDS[id]||u.search)return error(404,'feed_not_found');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...cors,'Access-Control-Max-Age':'86400'}});
  if(request.method!=='GET')return error(405,'method_not_allowed');
  // Cache identity excludes caller cookies, headers and query-string variants.
  const key=new Request(`${u.origin}/feeds/${id}`),cache=cacheProvider();
  let hit;try{hit=await cache.match(key);}catch{/* Cache is best-effort. */}if(hit)return hit;
  const task=(async()=>{
   const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
   try{
    let url=new URL(FEEDS[id].url),response;
    for(let n=0;n<=3;n++){
     response=await fetcher(url.href,{method:'GET',redirect:'manual',signal:controller.signal,
      headers:{Accept:'application/rss+xml,application/atom+xml,application/xml,text/xml','User-Agent':'Breeze public RSS reader'}});
     if([301,302,303,307,308].includes(response.status)){
      await response.body?.cancel();if(n===3||!response.headers.get('location'))throw Error('redirect');
      url=destination(response.headers.get('location'),url,FEEDS[id],aliases[id]||[]);continue;
     }break;
    }
    if(response.status!==200){await response.body?.cancel();throw Error('upstream');}
    const type=response.headers.get('content-type')||'';
    if(!/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/i.test(type)){await response.body?.cancel();throw Error('content_type');}
    const declared=Number(response.headers.get('content-length'));
    if(declared>MAX_BYTES){await response.body?.cancel();throw Error('size');}
    const bytes=await bounded(response.body),control=response.headers.get('cache-control')||'';
    // Respect explicit publisher restrictions; never forward Set-Cookie.
    const reusable=!/(?:^|,)\s*(?:private|no-store|no-cache)(?:\s|,|=|$)/i.test(control)&&!response.headers.has('set-cookie')&&!(response.headers.get('vary')||'').split(',').some(v=>v.trim()==='*');
    const freshness=control.match(/(?:^|,)\s*s-maxage\s*=\s*"?(\d+)/i)||control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i);
    const age=Number(response.headers.get('age')||0);
    const validAge=Number.isSafeInteger(age)&&age>=0;
    const ttl=validAge?Math.max(0,Math.min(TTL,(freshness?Number(freshness[1]):TTL)-age)):0;
    const result=new Response(bytes,{headers:{...cors,'Content-Type':type,'X-Breeze-Feed-URL':url.href,
      'X-Breeze-Fetched-At':String(Date.now()-(validAge?age*1000:0)),'Access-Control-Expose-Headers':'X-Breeze-Feed-URL, X-Breeze-Fetched-At','Cache-Control':reusable&&ttl>0?`public, max-age=${ttl}`:'no-store'}});
    if(reusable&&ttl>0)ctx.waitUntil(cache.put(key,result.clone()).catch(()=>{}));
    return result;
   }catch{return error(502,'feed_unavailable');}finally{clearTimeout(timer);}
  })();return task;
 }};
}
export default createWorker();
