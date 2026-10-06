import {fetchPublic} from '../article/public-fetch.mjs';
import {FEEDS} from '../rss-quality/feeds.mjs';
import {FRESH_MS,STALE_MS,MAX_FEED_BYTES,MAX_CATALOG_BYTES,parseMetadata,publicCatalog} from './metadata.mjs';
import {enrichCatalogPhotos,fetchCatalogPhoto} from './photos.mjs';

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
  if(response.status===304)return {unchanged:true,headers:response.headers,responseBodyBytes:0};
  if(response.status!==200||!/xml|rss|atom/i.test(response.headers['content-type']||''))throw Error('feed_unavailable');
  const charset=response.headers['content-type'].match(/charset=["']?([\w-]+)/i)?.[1]||'utf-8';
  let xml;try{xml=new TextDecoder(charset).decode(response.bytes);}catch{throw Error('feed_encoding');}
  return {xml,headers:response.headers,responseBodyBytes:response.bytes.byteLength};
}
function cacheDelay(headers){
  const control=String(headers?.['cache-control']||'');
  if(/(?:^|,)\s*(?:no-store|private)(?:\s|,|$)/i.test(control))throw Error('feed_not_cacheable');
  const age=Number(control.match(/(?:^|,)\s*max-age\s*=\s*"?(\d+)/i)?.[1]||0)*1000;
  return Math.max(FRESH_MS,Math.min(age,STALE_MS));
}
/** @param {{store?:any,enabled?:number[],originalEnabled?:number[],fetcher?:typeof fetchFeed,photoFetcher?:typeof fetchCatalogPhoto,now?:()=>number,uuid?:()=>string}} options */
export function createCatalogService({store,enabled=[],originalEnabled=[],fetcher=fetchFeed,photoFetcher=fetchCatalogPhoto,now=Date.now,uuid=()=>crypto.randomUUID()}={}){
  if(enabled.some(id=>!Number.isInteger(id)||!FEEDS[id]))throw Error('feed_config');
  if(originalEnabled.some(id=>!Number.isInteger(id)||!enabled.includes(id)))throw Error('original_feed_config');
  return {
    async read(){
      const record=await store.read(),at=now(),ids=record?.active===true?enabled:[];
      const expiries=(record?.payload?.feeds||[]).filter(feed=>ids.includes(feed.id)&&originalEnabled.includes(feed.id)).flatMap(feed=>(feed.entries||[])
        .filter(entry=>entry.originalCover?.status==='present'&&entry.originalCover.at+STALE_MS>at).map(entry=>entry.originalCover.at+STALE_MS));
      return {catalog:publicCatalog(record?.payload,ids,at,originalEnabled),revision:record?.revision||'',cacheUntil:expiries.length?Math.min(...expiries):null};
    },
    async refresh(){
      if(!enabled.length)return {refreshed:false,reason:'no_sources'};
      if((await store.read())?.active!==true)return {refreshed:false,reason:'off'};
      const token=uuid();if(!await store.claim(token))return {refreshed:false,reason:'cooldown_or_busy'};
      try{
        const previous=await store.read(),at=now(),records=previous?.payload?.feeds||[];
        const next=FEEDS.map((_feed,id)=>({id,at:0,entries:[],error:'disabled'}));let cursor=0;
        let fetchedSources=0,reusedSources=0,failedSources=0,successfulFeedBodyBytes=0;
        await Promise.all([0,1].map(async()=>{
          while(cursor<enabled.length){
            const id=enabled[cursor++],feed=FEEDS[id],old=records.find(record=>record.id===id);
            const usable=old&&Number.isFinite(old.at)&&old.at<=at&&at-old.at<=STALE_MS;
            if(usable&&old.nextFetchAt>at){next[id]=old;reusedSources++;continue;}
            try{
              fetchedSources++;
              const response=await fetcher(feed,usable?old:null),delay=cacheDelay(response.headers);
              if(Number.isSafeInteger(response.responseBodyBytes)&&response.responseBodyBytes>=0)successfulFeedBodyBytes+=response.responseBodyBytes;
              if(response.unchanged&&!usable)throw Error('feed_unavailable');
              const entries=response.unchanged?old.entries:parseMetadata(response.xml,feed);
              next[id]={id,at,entries,nextFetchAt:at+delay,
                etag:String(response.headers?.etag||(response.unchanged?old.etag:'')||'').slice(0,512),
                modified:String(response.headers?.['last-modified']||(response.unchanged?old.modified:'')||'').slice(0,100)};
            }catch(error){
              failedSources++;
              // Keep last-good metadata without renewing its source timestamp.
              next[id]=usable&&error.message!=='feed_not_cacheable'?{...old,error:'feed_unavailable',nextFetchAt:at+FRESH_MS}:
                {id,at:0,entries:[],error:'feed_unavailable'};
            }
          }
        }));
        const originalMetrics=await enrichCatalogPhotos(next,records,originalEnabled,{now:at,fetcher:photoFetcher});
        const payload={version:1,feeds:next};
        const bytes=value=>new TextEncoder().encode(JSON.stringify(value)).length;
        // Long publisher URLs must not make the entire catalog unavailable.
        // Drop tail entries from the largest source first. Reserve 10 KiB for
        // jsonb's separators; the database independently enforces its own cap.
        while(bytes(payload)>MAX_CATALOG_BYTES-10000){
          const largest=next.filter(feed=>feed.entries.length).sort((a,b)=>bytes(b)-bytes(a))[0];
          if(!largest)throw Error('catalog_too_big');largest.entries.pop();
        }
        publicCatalog(payload,enabled,at,originalEnabled);
        if(!await store.publish(token,payload))return {refreshed:false,reason:'lease_expired'};
        // Service-only counters: final successful feed bodies, excluding failed
        // partial transfers, redirect bodies, headers/TLS, images and DB traffic.
        return {refreshed:true,fetchedSources,reusedSources,failedSources,successfulFeedBodyBytes,snapshotBytes:bytes(payload),...originalMetrics};
      }finally{await store.release(token);}
    }
  };
}
export function databaseStore(db){
  const checked=result=>{if(result.error)throw Error('catalog_database');return result.data;};
  return {
    async read(){return checked(await db.from('rss_public_catalog').select('payload,revision,active').eq('id',1).maybeSingle());},
    async claim(token){return checked(await db.rpc('rss_catalog_claim',{claim_token:token}));},
    async publish(token,payload){return checked(await db.rpc('rss_catalog_publish',{claim_token:token,new_payload:payload}));},
    async release(token){checked(await db.rpc('rss_catalog_release',{claim_token:token}));}
  };
}
