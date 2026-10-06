import {DOMParser} from 'linkedom';
import {publicUrl} from '../article/public-fetch.mjs';
import {looksEnglish} from '../rss-quality/language.mjs';
import {obviousPromo} from './discovery.mjs';
import {FEEDS} from '../rss-quality/feeds.mjs';

export const CATALOG_VERSION=1,MAX_CATALOG_BYTES=200000,MAX_FEED_BYTES=512000;
export const FRESH_MS=600000,STALE_MS=86400000,MAX_ENTRIES=20;
const local=node=>(node?.localName||'').split(':').pop().toLowerCase();
const child=(node,names)=>names.map(name=>[...node.children].find(item=>local(item)===name)).find(Boolean);
const text=node=>(node?.textContent||'').replace(/\s+/g,' ').trim();
const htmlText=raw=>{
  const doc=new DOMParser().parseFromString('<html><body>'+String(raw).slice(0,200000)+'</body></html>','text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach(node=>node.remove());
  return text(doc.body);
};
export function metadataUrl(raw,base){
  if(typeof raw!=='string'||!raw||raw.length>4096)return '';
  try{
    const url=publicUrl(new URL(raw,base).href);
    for(const key of [...url.searchParams.keys()]){
      if(/^(?:token|access_token|api_?key|auth|authorization|secret|password|session|jwt|signature|sig)$/i.test(key))return '';
      if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
    }
    return url.href;
  }catch{return '';}
}
const postKind=url=>/(^|\.)reddit\.com$/.test(new URL(url).hostname)?'reddit':
  /(^|\.)(x|twitter)\.com$/.test(new URL(url).hostname)?'x':'';
const badPhoto=/(logo|icon|avatar|profile[-_]image|sprite|spacer|pixel|1x1|placeholder|badge|emoji|blank)/i;
function suppliedPhoto(node,feed){
  const tooSmall=image=>['width','height'].some(attr=>{const size=parseInt(image.getAttribute(attr)||'0',10);return size>0&&size<60;});
  const accepted=(image,raw)=>{const url=metadataUrl(raw,feed.url);return url&&!tooSmall(image)&&!badPhoto.test(url)?url:'';};
  const priority={enclosure:0,content:1,thumbnail:2,link:3};
  const media=[...node.querySelectorAll('*')].filter(item=>local(item) in priority)
    .sort((a,b)=>priority[local(a)]-priority[local(b)]);
  for(const image of media){
    const kind=local(image),type=(image.getAttribute('type')||'').trim().toLowerCase(),medium=(image.getAttribute('medium')||'').trim().toLowerCase();
    if(kind==='link'&&image.getAttribute('rel')!=='enclosure'||medium&&medium!=='image'||type&&!type.startsWith('image/')||
      ['enclosure','link'].includes(kind)&&!type.startsWith('image/'))continue;
    const url=accepted(image,image.getAttribute('url')||image.getAttribute('href'));if(url)return url;
  }
  // Preserve the browser's existing supplied-photo choices on this separate
  // server parser: full content, description and summary are independent.
  const fields=new Set(['encoded','content','description','summary'].map(name=>child(node,[name])?.textContent||''));
  for(const html of fields){
    if(!html)continue;
    const doc=new DOMParser().parseFromString('<html><body>'+html.slice(0,200000)+'</body></html>','text/html');
    for(const image of doc.querySelectorAll('img')){
      const set=image.getAttribute('srcset')||image.getAttribute('data-srcset')||'';
      let best='',width=-1,over='',overWidth=Infinity;
      for(const match of set.matchAll(/(?:^|,\s*)(\S+)\s+(\d+)w(?=\s*(?:,|$))/g)){
        const size=Number(match[2]);if(size<=1600&&size>width){best=match[1];width=size;}
        if(size>1600&&size<overWidth){over=match[1];overWidth=size;}
      }
      const raw=best||image.getAttribute('data-src')||image.getAttribute('data-original')||image.getAttribute('src')||over;
      const url=accepted(image,raw);if(url)return url;
    }
  }
  return '';
}
export function metadataEntry(raw,feed){
  if(!raw||typeof raw!=='object')return null;
  const url=metadataUrl(raw.url,feed.url),title=htmlText(raw.title).slice(0,500);
  if(!url||!title)return null;
  const kind=postKind(url),linked=metadataUrl(raw.readUrl,url),photo=metadataUrl(raw.photo,feed.url);
  return {url,title,source:feed.name,category:feed.category,feedUrl:feed.url,feedSourceUrl:feed.url,
    author:htmlText(raw.author).slice(0,200),publishedAt:String(raw.publishedAt||'').slice(0,100),
    summary:htmlText(raw.summary).slice(0,280),photo:badPhoto.test(photo)?'':photo,
    readUrl:kind==='reddit'&&linked&&!postKind(linked)?linked:'',kind};
}
export function parseMetadata(xml,feed){
  if(new TextEncoder().encode(xml).length>MAX_FEED_BYTES||/<!DOCTYPE|<!ENTITY/i.test(xml))throw Error('feed_invalid');
  const root=xml.match(/^\s*(?:<\?xml[^>]*\?>\s*)?<(rss|feed)\b/i)?.[1]?.toLowerCase();
  if(root){const end=xml.lastIndexOf(`</${root}>`);if(end<0)throw Error('feed_invalid');xml=xml.slice(0,end+root.length+3);}
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  if(!['rss','feed','rdf'].includes(local(doc.documentElement))||doc.querySelectorAll('*').length>25000)throw Error('feed_invalid');
  const seen=new Set(),entries=[];
  for(const node of [...doc.querySelectorAll('item,entry')].slice(0,100)){
    const link=[...node.children].find(item=>local(item)==='link'&&(!item.getAttribute('rel')||item.getAttribute('rel')==='alternate'));
    const rawUrl=link?.getAttribute('href')||text(link);
    const summary=child(node,['description','summary']),body=child(node,['encoded','content']);
    // A feed can embed a body. Extract only a bounded snippet/image/link; never
    // retain or send the HTML or fetch the article to complete this metadata.
    const supplied=(body||summary)?.textContent||'';
    const content=new DOMParser().parseFromString('<html><body>'+supplied.slice(0,200000)+'</body></html>','text/html');
    const outbound=[...content.querySelectorAll('a[href]')].find(item=>text(item)==='[link]');
    const entry=metadataEntry({url:rawUrl,title:text(child(node,['title'])),author:text(child(node,['author','creator'])),
      publishedAt:text(child(node,['published','updated','pubdate','date'])),summary:summary?.textContent||supplied,
      photo:suppliedPhoto(node,feed),
      readUrl:outbound?.getAttribute('href')||''},feed);
    const prose=htmlText(supplied).slice(0,6000);
    const eligible=entry&&!obviousPromo({...entry,contentHtml:supplied})
      &&(entry.readUrl||looksEnglish(prose.length>=100?prose:entry.title+' '+entry.summary));
    if(eligible&&!seen.has(entry.url)){seen.add(entry.url);entries.push(entry);}
    if(entries.length>=MAX_ENTRIES)break;
  }
  return entries;
}
export function publicCatalog(snapshot,enabled,now){
  const catalog={version:CATALOG_VERSION,feeds:FEEDS.map((feed,id)=>{
    const record=snapshot?.feeds?.find(item=>item.id===id);
    const valid=enabled.includes(id)&&record&&Number.isFinite(record.at)&&record.at>=0&&record.at<=now&&now-record.at<=STALE_MS;
    const entries=valid&&Array.isArray(record.entries)?record.entries.slice(0,MAX_ENTRIES).map(entry=>metadataEntry(entry,feed)).filter(Boolean):[];
    return {id,at:valid?record.at:0,status:!enabled.includes(id)?'disabled':!valid?'unavailable':
      record.error||now-record.at>=FRESH_MS?'stale':'ready',entries};
  })};
  if(new TextEncoder().encode(JSON.stringify(catalog)).length>MAX_CATALOG_BYTES)throw Error('catalog_too_big');
  return catalog;
}
