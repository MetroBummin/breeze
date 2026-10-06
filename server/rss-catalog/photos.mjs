import {extractPublicArticleCover} from '../article/cover-metadata.mjs';
import {publicUrl} from '../article/public-fetch.mjs';
import {FEEDS} from '../rss-quality/feeds.mjs';
import {metadataUrl,STALE_MS,FRESH_MS} from './metadata.mjs';
import {fetchPublicPrefix,prefixHeadersAllowed} from './public-prefix.mjs';
import {rssCoverHeadComplete} from './photo-head.mjs';
export const ORIGINAL_LIMIT=6,ORIGINAL_BYTES=131072,ORIGINAL_TIMEOUT_MS=4000,ORIGINAL_REDIRECTS=2,NO_IMAGE_MS=1800000;
const statuses=['present','noimage','transient','truncated','blocked'];
const host=url=>url.hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,'');
export function originalUrlAllowed(raw,feed){
  try{
    const url=publicUrl(raw),source=new URL(feed.url);
    return url.protocol==='https:'&&host(url)===host(source)&&
      ![...url.searchParams.keys()].some(key=>/^(?:token|access_token|api_?key|auth|authorization|secret|password|session|jwt|signature|sig|AWSAccessKeyId|GoogleAccessId|(?:x-amz|x-goog)-(?:credential|signature|security-token))$/i.test(key));
  }catch{return false;}
}
export function originalEligible(entry,feed){
  return entry.feedSourceUrl===feed.url&&!entry.kind&&!entry.readUrl&&originalUrlAllowed(entry.url,feed);
}
function decode(bytes,headers){const charset=headers?.['content-type']?.match(/charset=["']?([\w-]+)/i)?.[1]||'utf-8';return new TextDecoder(charset).decode(bytes);}
function inspect(bytes,headers,url,complete=false){
  const html=decode(bytes,headers),last=html.lastIndexOf('>');
  // Do not let a parser repair a half-received image/meta tag into a URL.
  if(last<0)return '';
  const prefix=html.slice(0,last+1),photo=extractPublicArticleCover(prefix,url);
  // Until EOF, a later first <base> can change a relative declaration. Reuse
  // the pure extractor with a different inert public origin to prove that an
  // early photo is independent of the missing base. No URL is fetched here.
  return photo&&(complete||rssCoverHeadComplete(prefix)||photo===extractPublicArticleCover(prefix,'https://breeze-cover-base.example/'))?photo:'';
}
export async function fetchCatalogPhoto(entry,feed,{fetcher=fetchPublicPrefix}={}){
  if(!originalEligible(entry,feed))return {status:'blocked',photo:'',prefixBytes:0,bodyBytesReceived:0};
  try{
    const response=await fetcher(entry.url,{limit:ORIGINAL_BYTES,timeoutMs:ORIGINAL_TIMEOUT_MS,maxRedirects:ORIGINAL_REDIRECTS,
      allowed:url=>originalUrlAllowed(url.href,feed),stop:(bytes,headers,url)=>!!inspect(bytes,headers,url)});
    const counts={prefixBytes:response.bytes?.length||0,bodyBytesReceived:response.bodyBytesReceived||0,httpAttempts:response.httpAttempts||1};
    if(!originalUrlAllowed(response.url,feed)||!prefixHeadersAllowed(response.status,response.headers))return {
      status:response.status>=500||response.status===429?'transient':'blocked',photo:'',...counts};
    const html=decode(response.bytes,response.headers);
    if(/<title\b[^>]*>\s*(?:just a moment|access denied|attention required)[.!\s]*<\/title>/i.test(html))return {status:'blocked',photo:'',...counts};
    const photo=inspect(response.bytes,response.headers,response.url,response.complete===true);
    if(photo)return {status:'present',photo,finalUrl:response.url,...counts};
    if(/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html))
      return {status:'blocked',photo:'',...counts};
    return {status:response.complete===true?'noimage':'truncated',photo:'',...counts};
  }catch(error){return {status:['bad_url','photo_source_blocked','redirect_limit','bad_response','cover_base_unsafe'].includes(error?.message)?'blocked':
    error?.message==='prefix_framing_limit'?'truncated':'transient',photo:'',prefixBytes:0,bodyBytesReceived:null,httpAttempts:error?.prefixHttpAttempts||0};}
}
function validHint(raw,now,feed){
  if(!raw||!statuses.includes(raw.status)||!Number.isFinite(raw.at)||raw.at<0||raw.at>now)return null;
  const photo=metadataUrl(raw.photo,feed.url);
  if(raw.status==='present'&&!photo)return null;
  return {status:raw.status,at:raw.at,photo:raw.status==='present'?photo:'',
    ...(originalUrlAllowed(raw.finalUrl,feed)?{finalUrl:raw.finalUrl}:{})};
}
// Cache hints stay service-only inside the bounded snapshot, alongside their
// public entry. No HTML, account data or arbitrary caller URL enters this path.
export async function enrichCatalogPhotos(feeds,previous,enabled,{now=Date.now(),fetcher=fetchCatalogPhoto}={}){
  const candidates=[],oldByUrl=new Map(),metrics={originalJobs:0,originalHttpAttempts:0,originalPrefixBytes:0,
    originalBodyBytesReceived:0,originalUnknownByteJobs:0,originalCacheHits:0,originalStatuses:Object.fromEntries(statuses.map(status=>[status,0]))};
  for(const record of previous||[])if(enabled.includes(record.id))for(const entry of record.entries||[]){
    const hint=validHint(entry.originalCover,now,FEEDS[record.id]);if(hint)oldByUrl.set(entry.url,hint);
  }
  for(const record of feeds)if(record.at>0){
    record.entries=record.entries.map((raw,position)=>{
      const entry={...raw},feed=FEEDS[record.id],wasOriginal=entry.originalCover&&entry.photo===entry.originalCover.photo;
      const hint=validHint(entry.originalCover,now,feed)||oldByUrl.get(entry.url);delete entry.originalCover;
      if(entry.photo&&!wasOriginal)return entry; // Fresh supplied feed photo wins.
      entry.photo='';if(!originalEligible(entry,feed))return entry;
      if(!enabled.includes(record.id))return entry; // Feed caching never approves original-page probing.
      if(hint){
        entry.originalCover={...hint};const ttl=hint.status==='present'?STALE_MS:hint.status==='noimage'?NO_IMAGE_MS:FRESH_MS;
        if(now-hint.at<ttl){if(hint.status==='present')entry.photo=hint.photo;metrics.originalCacheHits++;return entry;}
      }
      candidates.push({entry,feed,attempt:hint?.at||0,position});return entry;
    });
  }
  // Oldest attempts first prevent failing early sources starving other cards.
  // Coalesce a URL shared by multiple fixed feeds into one original lookup.
  const jobs=new Map();
  for(const candidate of candidates.sort((a,b)=>a.attempt-b.attempt||a.position-b.position)){
    if(jobs.has(candidate.entry.url))jobs.get(candidate.entry.url).push(candidate);
    else if(jobs.size<ORIGINAL_LIMIT)jobs.set(candidate.entry.url,[candidate]);
  }
  const work=[...jobs.values()];let cursor=0;
  await Promise.all([0,1].map(async()=>{
    while(cursor<work.length){
      const group=work[cursor++],first=group[0];metrics.originalJobs++;
      let result;try{result=await fetcher(first.entry,first.feed);}catch{result={status:'transient',photo:'',bodyBytesReceived:null};}
      const status=statuses.includes(result.status)?result.status:'transient',photo=status==='present'?metadataUrl(result.photo,first.feed.url):'';
      const checkedStatus=status==='present'&&!photo?'blocked':status;
      metrics.originalStatuses[checkedStatus]++;metrics.originalHttpAttempts+=result.httpAttempts||0;
      metrics.originalPrefixBytes+=result.prefixBytes||0;
      if(Number.isSafeInteger(result.bodyBytesReceived)&&result.bodyBytesReceived>=0)metrics.originalBodyBytesReceived+=result.bodyBytesReceived;
      else metrics.originalUnknownByteJobs++;
      for(const {entry,feed} of group){
        entry.photo=photo;entry.originalCover={status:checkedStatus,at:now,photo,
          ...(originalUrlAllowed(result.finalUrl,feed)?{finalUrl:result.finalUrl}:{})};
      }
    }
  }));
  return metrics;
}
