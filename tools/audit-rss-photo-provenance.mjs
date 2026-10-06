/* Read-only, opt-in provenance audit. No relay/API keys, private feeds, body
   persistence or paid provider. The same pinned public transport reads fixed
   feeds, at most eight public originals and one image per original. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {fetchPublic} from '../server/article/public-fetch.mjs';

const root=new URL('../',import.meta.url);
const article=readFileSync(new URL('scripts/importers/article.js',root),'utf8');
const rss=readFileSync(new URL('scripts/importers/rss.js',root),'utf8');
const proof=process.env.BREEZE_RSS_PHOTO_PROOF||'/tmp/breeze-rss-photo-provenance';
mkdirSync(proof,{recursive:true});
const headers={'User-Agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36','Accept-Language':'en-US,en;q=0.9'};
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
async function read(url,image=false){
  const at=new Date().toISOString();
  try{
    const response=await fetchPublic(url,{limit:image?2000000:3000000,signal:AbortSignal.timeout(12000),
      headers:{...headers,Accept:image?'image/*':'text/html,application/rss+xml,application/atom+xml,application/xml',
        ...(image?{Referer:new URL(url).origin+'/'}:{})}});
    const {status,bytes}=response,type=response.headers['content-type']||'';
    return {bytes,record:{requestedUrl:url,url:response.url||url,at,status,type,
      bytes:bytes?.byteLength||0,sha256:bytes?sha(bytes):null}};
  }catch(error){return {record:{requestedUrl:url,at,error:error.name+': '+error.message}};}
}
const browser=await chromium.launch({headless:true});
const page=await browser.newPage();
// Production parser functions operate on inert documents. No app boot/network.
await page.setContent('<html><head></head><body></body></html>');
await page.evaluate(()=>Object.assign(window,{books:[],positions:{},load:(_key,fallback)=>fallback,
  SB_URL:'',SB_KEY:'',BREEZE_CONFIG:{RSS_CATALOG:false},fetch:()=>{throw Error('Unexpected browser request');}}));
await page.addScriptTag({content:article+'\n'+rss});
const allFeeds=await page.evaluate(()=>RSS_FEEDS.map(feed=>({...feed})));
const chosen=[0,1,2,3,4,5,7].map(index=>allFeeds[index]);
const report={at:new Date().toISOString(),sourceSha256:sha(rss),
  scope:'Live, read-only public GETs through repository pinned transport; seven fixed feeds, at most eight originals and eight images. No production relay, API key, paid provider or server mutation.',
  limitations:'Received HTTP representation, not proof of every rendered/photo variant. Original bodies are not retained in this artifact. Client CORS, deployed relay geography/runtime and billed egress are separate.',
  feeds:[],articles:[]};
try{
  const candidates=[];
  for(const feed of chosen){
    const response=await read(feed.url),record={feed,...response.record};report.feeds.push(record);
    if(!response.bytes)continue;
    try{
      const entries=await page.evaluate(({xml,feed})=>parseRss(xml,feed).slice(0,3).map(entry=>({
        url:entry.url,title:entry.title,photo:entry.photo,kind:entry.kind,readUrl:entry.readUrl,
        feedSourceUrl:entry.feedSourceUrl})),{xml:new TextDecoder().decode(response.bytes),feed});
      record.entries=entries;candidates.push(...entries.map(entry=>({...entry,feed:feed.name})));
    }catch(error){record.parseError=error.message;}
  }
  // Missing supplied metadata first, then a few supplied-image control cases.
  const missing=candidates.filter(entry=>!entry.photo&&!entry.kind&&!entry.readUrl);
  const diverse=missing.filter((entry,index,list)=>list.findIndex(item=>item.feed===entry.feed)===index);
  const selected=[...new Map([...diverse,...missing].map(entry=>[entry.url,entry])).values()].slice(0,6);
  selected.push(...candidates.filter(entry=>entry.photo).filter((entry,index,list)=>list.findIndex(item=>item.feed===entry.feed)===index).slice(0,2));
  for(const entry of selected){
    const response=await read(entry.url),row={entry,original:response.record};report.articles.push(row);
    if(!response.bytes)continue;
    const type=response.record.type;
    const charset=type.match(/charset=([\w-]+)/i)?.[1]||'utf-8';
    let html;try{html=new TextDecoder(charset).decode(response.bytes);}catch{html=new TextDecoder().decode(response.bytes);}
    const serialized=JSON.stringify({url:response.record.url,html});
    const prefix=new TextDecoder().decode(new TextEncoder().encode(serialized).subarray(0,128*1024));
    const rawDeclarations=[...html.matchAll(/<meta\b[^>]*>/gi)]
      .filter(match=>/\b(?:property|name)\s*=\s*["'](?:og:image(?::url)?|twitter:image(?::src)?)["']/i.test(match[0]))
      .slice(0,6).map(match=>({tag:match[0].slice(0,1000),byteOffset:Buffer.byteLength(html.slice(0,match.index))}));
    const metadata=await page.evaluate(({html,prefix,url,entry,rawDeclarations})=>{
      const doc=new DOMParser().parseFromString(html,'text/html');
      const payload=rssCoverPayloadPrefix(prefix);
      const declarations=rawDeclarations.map(record=>{
        const node=new DOMParser().parseFromString(record.tag,'text/html').querySelector('meta');
        return {...record,name:node?.getAttribute('property')||node?.getAttribute('name'),url:node?.getAttribute('content')};
      });
      return {suppliedPhoto:entry.photo,eligible:rssCoverEligible(entry),
        prefixPhoto:payload?rssCoverPhoto(payload.html,payload.url||url):null,
        fullPhoto:rssCoverPhoto(html,url),declarations,
        bodyImages:[...doc.querySelectorAll('img')].slice(0,12).map(image=>({url:articleBestSrc(image),width:image.getAttribute('width'),height:image.getAttribute('height')})),
        declaresRestricted:/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html)};
    },{html,prefix,url:response.record.url,entry,rawDeclarations});
    row.metadata=metadata;row.serializedBytes=Buffer.byteLength(serialized);
    const imageUrl=entry.photo||metadata.fullPhoto;if(!imageUrl)continue;
    const image=await read(imageUrl,true);row.image=image.record;
    if(image.bytes&&/^image\//i.test(image.record.type)&&!/svg/i.test(image.record.type)){
      const data='data:'+image.record.type.split(';')[0]+';base64,'+Buffer.from(image.bytes).toString('base64');
      row.decode=await page.evaluate(data=>new Promise(resolve=>{
        const image=new Image(),timer=setTimeout(()=>resolve({error:'decode_timeout'}),4000);
        image.onload=()=>image.decode().then(()=>{clearTimeout(timer);resolve({width:image.naturalWidth,height:image.naturalHeight});},()=>{clearTimeout(timer);resolve({error:'decode_failed'});});
        image.onerror=()=>{clearTimeout(timer);resolve({error:'image_error'});};image.src=data;
      }),data);
    }
  }
}finally{
  writeFileSync(proof+'/results.json',JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
console.log(JSON.stringify(report,null,2));
