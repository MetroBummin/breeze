import {timingSafeEqual} from 'node:crypto';
import {Buffer} from 'node:buffer';
import {FRESH_MS,STALE_MS} from './metadata.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,authorization,content-type,if-none-match',
  'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Expose-Headers':'ETag,Retry-After'};
export const catalogReply=(body,status=200,headers={})=>new Response(JSON.stringify(body),{status,
  headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store',...headers}});
export function serviceAuthorization(key){
  const expected=Buffer.from(key||'');
  return request=>{
    if(!expected.length)return false;
    const raw=request.headers.get('apikey')||request.headers.get('authorization')?.replace(/^Bearer /i,'')||'';
    const supplied=Buffer.from(raw);
    return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
  };
}
/** @param {any} service @param {{authorize?:(request:Request)=>boolean,now?:()=>number}} options */
export function catalogHandler(service,{authorize=()=>false,now=Date.now}={}){
  return async request=>{
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
    if(new URL(request.url).search)return catalogReply({error:'parameters'},400);
    if(request.method==='GET'){
      try{
        const {catalog,revision}=await service.read();
        // The representation changes when source data expires or is disabled,
        // even without a new stored revision. Include that state in the ETag.
        const signature=catalog.feeds.map(feed=>`${feed.id}:${feed.at}:${feed.status}:${feed.entries.length}`).join('|');
        const etag='"'+(revision||'empty')+':'+signature+'"';
        const expires=catalog.feeds.filter(feed=>feed.entries.length).map(feed=>feed.at+(feed.status==='ready'?FRESH_MS:STALE_MS));
        const ttl=expires.length?Math.max(0,Math.min(60,Math.floor((Math.min(...expires)-now())/1000))):60;
        const headers={'ETag':etag,'Cache-Control':`public,max-age=${ttl}`};
        if(request.headers.get('if-none-match')===etag)return new Response(null,{status:304,headers:{...cors,...headers}});
        return catalogReply(catalog,200,headers);
      }catch{return catalogReply({error:'catalog_unavailable'},503,{'Retry-After':'600'});}
    }
    if(request.method!=='POST')return catalogReply({error:'method'},405);
    if(!authorize(request))return catalogReply({error:'unauthorized'},401);
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
