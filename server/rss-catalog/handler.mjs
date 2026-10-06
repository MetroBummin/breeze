import {createHash} from 'node:crypto';
import {FRESH_MS,STALE_MS} from './metadata.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,authorization,content-type,if-none-match',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Expose-Headers':'ETag,Retry-After'};
export const catalogReply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,
  headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
// RFC 9110 sections 5.6.1, 8.8.3 and 13.1.2: GET uses weak comparison.
// Parse the whole list before accepting a match; commas inside opaque tags
// are data, W/ is case-sensitive, and backslashes do not escape quotes.
/** @param {string|null} value @param {string} etag The current strong catalog ETag. */
function matchesIfNoneMatch(value,etag){
  if(value===null)return false;
  if(/^[ \t]*\*[ \t]*$/.test(value))return true;
  const tag=/(?:W\/)?("[\x21\x23-\x7e\x80-\xff]*")/y;
  let at=0,matched=false;
  while(at<value.length){
    // Recipients ignore empty list members, including leading/trailing ones.
    while(value[at]===' '||value[at]==='\t'||value[at]===',')at++;
    if(at===value.length)break;
    tag.lastIndex=at;
    const item=tag.exec(value);
    if(!item)return false;
    if(item[1]===etag)matched=true;
    at=tag.lastIndex;
    while(value[at]===' '||value[at]==='\t')at++;
    if(at<value.length&&value[at]!==',')return false;
  }
  return matched;
}
/** @param {any} service @param {{authorize?:(request:Request)=>boolean|Promise<boolean>,now?:()=>number}} options */
export function catalogHandler(service,{authorize=()=>false,now=Date.now}={}){
  return async request=>{
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(new URL(request.url).search)return catalogReply({error:'parameters'},400);
    if(request.method==='GET'){
      try{
        const {catalog,revision,cacheUntil}=await service.read();
        // The representation changes when source data expires or is disabled,
        // even without a new stored revision. Include that state in the ETag.
        const signature=createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
        const etag='"'+(revision||'empty')+':'+signature+'"';
        const expires=catalog.feeds.filter(feed=>feed.entries.length).map(feed=>feed.at+(feed.status==='ready'?FRESH_MS:STALE_MS));
        if(Number.isFinite(cacheUntil)&&cacheUntil!==null)expires.push(cacheUntil);
        const ttl=expires.length?Math.max(0,Math.min(60,Math.floor((Math.min(...expires)-now())/1000))):60;
        const headers={'ETag':etag,'Cache-Control':`public,max-age=${ttl}`};
        if(matchesIfNoneMatch(request.headers.get('if-none-match'),etag))return new Response(null,{status:304,headers:{...cors,...headers}});
        return catalogReply(catalog,200,headers);
      }catch{return catalogReply({error:'catalog_unavailable'},503,{'Retry-After':'600'});}
    }
    if(request.method!=='POST')return catalogReply({error:'method'},405);
    let authorized=false;
    try{authorized=await authorize(request)===true;}catch{/* Authorization failures stay closed. */}
    if(!authorized)return catalogReply({error:'unauthorized'},401);
    // Refresh always uses the server's reviewed fixed inventory, never URLs or
    // a caller-supplied source list. Public reads cannot trigger upstream work.
    // HTTP stacks can expose a stream even for Content-Length: 0. Permit only
    // an actually empty stream; pg_net uses SQL NULL rather than its default {}.
    if(request.body!==null){
      const reader=request.body.getReader();let empty=false;
      try{const first=await reader.read();empty=first.done;}
      finally{await reader.cancel();}
      if(!empty)return catalogReply({error:'body'},400);
    }
    try{return catalogReply(await service.refresh());}
    catch{return catalogReply({error:'refresh_unavailable'},503,{'Retry-After':'600'});}
  };
}
