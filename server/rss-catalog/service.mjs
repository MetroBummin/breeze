import {fetchPublic} from '../article/public-fetch.mjs';
import {FEEDS} from '../rss-quality/feeds.mjs';
import {FRESH_MS,STALE_MS,MAX_FEED_BYTES,MAX_CATALOG_BYTES,parseMetadata,publicCatalog} from './metadata.mjs';

export function feedIds(raw=''){
  if(!raw.trim())return [];
  const ids=raw.split(',').map(value=>{if(!/^(?:[0-9]|1[0-2])$/.test(value.trim()))throw Error('feed_config');return Number(value);});
  return [...new Set(ids)];
}
export async function fetchFeed(feed,record){
  const headers={'User-Agent':'Breeze public RSS reader','Accept':'application/rss+xml,application/atom+xml,application/xml,text/xml'};
  if(record?.etag)headers['If-None-Match']=record.etag;
  if(record?.modified)headers['If-Modified-Since']=record.modified;
  const response=await fetchPublic(feed.url,{signal:AbortSignal.timeout(6000),limit:MAX_FEED_BYTES,headers});
  if(response.status===304)return {unchanged:true,headers:response.headers};
  if(response.status!==200||!/xml|rss|atom/i.test(response.headers['content-type']||''))throw Error('feed_unavailable');
  const charset=response.headers['content-type'].match(/charset=["']?([\w-]+)/i)?.[1]||'utf-8';
  let xml;try{xml=new TextDecoder(charset).decode(response.bytes);}catch{throw Error('feed_encoding');}
  return {xml,headers:response.headers};
}
function cacheDelay(headers){
  const control=String(headers?.['cache-control']||'');
  if(/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(control))throw Error('feed_not_cacheable');
  const age=Number(control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i)?.[1]||0)*1000;
  return Math.max(FRESH_MS,Math.min(age,STALE_MS));
}
/** @param {{store?:any,enabled?:number[],fetcher?:typeof fetchFeed,now?:()=>number,uuid?:()=>string}} options */
export function createCatalogService({store,enabled=[],fetcher=fetchFeed,now=Date.now,uuid=()=>crypto.randomUUID()}={}){
  if(enabled.some(id=>!Number.isInteger(id)||!FEEDS[id]))throw Error('feed_config');
  return {
    async read(){const record=await store.read();return {catalog:publicCatalog(record?.payload,enabled,now()),revision:record?.revision||''};},
    async refresh(){
      if(!enabled.length)return {refreshed:false,reason:'no_sources'};
      const token=uuid();if(!await store.claim(token))return {refreshed:false,reason:'cooldown_or_busy'};
      try{
        const previous=await store.read(),at=now(),records=previous?.payload?.feeds||[];
        const next=FEEDS.map((_feed,id)=>({id,at:0,entries:[],error:'disabled'}));let cursor=0;
        await Promise.all([0,1].map(async()=>{
          while(cursor<enabled.length){
            const id=enabled[cursor++],feed=FEEDS[id],old=records.find(record=>record.id===id);
            const usable=old&&Number.isFinite(old.at)&&old.at<=at&&at-old.at<=STALE_MS;
            if(usable&&old.nextFetchAt>at){next[id]=old;continue;}
            try{
              const response=await fetcher(feed,usable?old:null),delay=cacheDelay(response.headers);
              if(response.unchanged&&!usable)throw Error('feed_unavailable');
              const entries=response.unchanged?old.entries:parseMetadata(response.xml,feed);
              next[id]={id,at,entries,nextFetchAt:at+delay,
                etag:String(response.headers?.etag||'').slice(0,512),modified:String(response.headers?.['last-modified']||'').slice(0,100)};
            }catch(error){
              // Keep last-good metadata without renewing its source timestamp.
              next[id]=usable&&error.message!=='feed_not_cacheable'?{...old,error:'feed_unavailable',nextFetchAt:at+FRESH_MS}:
                {id,at:0,entries:[],error:'feed_unavailable'};
            }
          }
        }));
        const payload={version:1,feeds:next};publicCatalog(payload,enabled,at);
        if(new TextEncoder().encode(JSON.stringify(payload)).length>MAX_CATALOG_BYTES)throw Error('catalog_too_big');
        if(!await store.publish(token,payload))return {refreshed:false,reason:'lease_expired'};
        return {refreshed:true};
      }finally{await store.release(token);}
    }
  };
}
export function databaseStore(db){
  const checked=result=>{if(result.error)throw Error('catalog_database');return result.data;};
  return {
    async read(){return checked(await db.from('rss_public_catalog').select('payload,revision').eq('id',1).maybeSingle());},
    async claim(token){return checked(await db.rpc('rss_catalog_claim',{claim_token:token}));},
    async publish(token,payload){return checked(await db.rpc('rss_catalog_publish',{claim_token:token,new_payload:payload}));},
    async release(token){checked(await db.rpc('rss_catalog_release',{claim_token:token}));}
  };
}
