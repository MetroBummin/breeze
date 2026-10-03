import {DOMParser} from 'linkedom';
import {Readability} from '@mozilla/readability';
import {publicUrl, fetchPublic} from '../article/public-fetch.mjs';
import {looksEnglish} from './language.mjs';
import {MAX_BODY_CHARS} from './jev.mjs';
export function canonical(raw) {
  const url=publicUrl(raw);
  for(const key of [...url.searchParams.keys()])if(/^utm_|^(fbclid|gclid)$/i.test(key))url.searchParams.delete(key);
  url.searchParams.sort();return url.href;
}
const text=node=>(node?.textContent || '').replace(/\s+/g,' ').trim();
const local=node=>(node.localName || '').split(':').pop().toLowerCase();
const child=(node,names)=>names.map(name=>[...node.children].find(n=>local(n)===name)).find(Boolean);
const safe=(raw,base)=>{try{return canonical(new URL(raw,base).href);}catch{return '';}};
const htmlDoc=html=>new DOMParser().parseFromString(html,'text/html');
export function parseFeed(xml,feed) {
  if(xml.length>3000000 || /<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('feed_invalid');
  const root=xml.match(/^\s*(?:<\?xml[^>]*\?>\s*)?<(rss|feed)\b/i)?.[1]?.toLowerCase();
  if(root){const end=xml.lastIndexOf(`</${root}>`);if(end>=0)xml=xml.slice(0,end+root.length+3);}
  const doc=new DOMParser().parseFromString(xml,'text/xml');
  if(!['rss','feed','rdf'].includes(local(doc.documentElement)))throw new Error('feed_invalid');
  const seen=new Set();
  return [...doc.querySelectorAll('item,entry')].slice(0,100).flatMap(node=>{
    const link=[...node.children].find(n=>local(n)==='link' && (!n.getAttribute('rel') || n.getAttribute('rel')==='alternate'));
    const url=safe(link?.getAttribute('href') || text(link),feed.url);
    if(!url || seen.has(url))return [];seen.add(url);
    const title=text(htmlDoc('<html><body>'+text(child(node,['title']))+'</body></html>').body).slice(0,500);
    const body=child(node,['encoded','content']), contentHtml=textContent(body || child(node,['description','summary']));
    const content=htmlDoc('<html><body>'+contentHtml+'</body></html>');
    let readUrl='';
    if(/(^|\.)reddit\.com$/.test(new URL(url).hostname)) {
      const outbound=[...content.querySelectorAll('a[href]')].find(a=>text(a)==='[link]');
      readUrl=outbound ? safe(outbound.getAttribute('href'),url) : '';
    }
    const media=[...node.querySelectorAll('*')].find(n=>['content','thumbnail','enclosure'].includes(local(n)) &&
      (n.getAttribute('url') || n.getAttribute('href')) && (!n.getAttribute('type') || n.getAttribute('type').startsWith('image/')));
    const photo=safe(media?.getAttribute('url') || media?.getAttribute('href') || content.querySelector('img')?.getAttribute('src') || '',url);
    return title ? [{url,title,readUrl,photo:photo===url?'':photo,source:feed.name,category:feed.category,feedUrl:feed.url,
      author:text(child(node,['author','creator'])).slice(0,200),publishedAt:text(child(node,['published','updated','pubdate','date'])).slice(0,100),
      contentHtml:contentHtml.length<=200000 ? contentHtml : '',bodyProvided:!!body}] : [];
  });
}
function textContent(node){return node?.textContent || '';}
export async function fetchDocument(url,signal) {
  const response=await fetchPublic(url,{signal:AbortSignal.any([signal,AbortSignal.timeout(12000)]),limit:3000000,
    headers:{'User-Agent':'Mozilla/5.0 (compatible; Breeze public article reader)','Accept':'text/html,application/xhtml+xml,application/xml,text/xml,application/atom+xml,application/rss+xml'}});
  if(response.status<200 || response.status>=300 || !/html|xml/i.test(response.headers['content-type'] || ''))throw new Error('source_unavailable');
  const charset=(response.headers['content-type'].match(/charset=([\w-]+)/i) || [,'utf-8'])[1];
  let html;try{html=new TextDecoder(charset).decode(response.bytes);}catch{html=new TextDecoder().decode(response.bytes);}
  return {html,url:canonical(response.url)};
}
export function extractArticle(html,url,title,{feedBody=false}={}) {
  if(html.length>3000000)throw new Error('body_limit');
  if(/(^|\.)(reddit|twitter|x)\.com$/.test(new URL(url).hostname))throw new Error('unsupported_post');
  const doc=htmlDoc(html);
  if(doc.querySelectorAll('*').length>25000)throw new Error('body_limit');
  const restricted=/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html), free=/"isAccessibleForFree"\s*:\s*(?:true|"true")/i.test(html);
  if(restricted || (!free && doc.querySelector('[class*="paywall"],[id*="paywall"]')))throw new Error('restricted');
  const cover=safe(doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || '',url);
  const embedded=doc.querySelectorAll('iframe,video,object,embed').length;
  doc.querySelectorAll('script,style,noscript,template,iframe,object,embed,form,button,nav,[hidden],[aria-hidden="true"],base').forEach(n=>n.remove());
  const base=doc.createElement('base');base.setAttribute('href',url);doc.head.appendChild(base);
  const parsed=new Readability(doc,{charThreshold:500,maxElemsToParse:25000,keepClasses:false}).parse();
  if(!parsed || parsed.length<500)throw new Error('incomplete');
  const body=htmlDoc('<html><body>'+parsed.content+'</body></html>').body;
  body.querySelectorAll('script,style,iframe,object,embed,form,svg,video,audio').forEach(n=>n.remove());
  const prose=text(body);
  if(prose.length<500 || (feedBody && (prose.length<1200 || /continue reading|member.only|paid subscribers|subscribe to (?:read|continue)|\[\s*…\s*\]/i.test(prose))))throw new Error('incomplete');
  if(!looksEnglish(prose))throw new Error('language_unavailable');
  if(prose.length>MAX_BODY_CHARS)throw new Error('body_limit');
  let paragraphs=[...body.querySelectorAll('h1,h2,h3,h4,p,li,blockquote,pre,figcaption,td')]
    .filter(n=>!n.querySelector('p,li,blockquote,pre,td')).map(text).filter(Boolean);
  if(!paragraphs.length)paragraphs=[prose];
  // Include all extracted text; group rather than truncate paragraphs.
  if(paragraphs.join(' ').length<prose.length*0.9)paragraphs=[prose];
  if(paragraphs.length>200){const group=Math.ceil(paragraphs.length/200);paragraphs=Array.from({length:Math.ceil(paragraphs.length/group)},(_,i)=>paragraphs.slice(i*group,(i+1)*group).join('\n'));}
  const images=[...body.querySelectorAll('img')].map(n=>safe(n.getAttribute('src') || n.getAttribute('data-src') || '',url)).filter(x=>x && x!==url);
  const links=[...body.querySelectorAll('a[href]')].slice(0,100).map(n=>({text:text(n).slice(0,120),url:safe(n.getAttribute('href'),url)}));
  const readiness=extractionReadiness({paragraphs});
  if(readiness.status!=='ready')throw new Error(readiness.reasons[0]);
  return {title,paragraphs,links,cover:cover && cover!==url ? cover : images[0] || '',checks:{feedBody,embeddedElements:embedded,extractedImages:images.length,readerImageLimit:8,imageDelivery:'unverified',
    declaredListCount:Number(title.match(/\b(\d{1,3})\s+(?:best|ways|things|photos|experiments|toys)\b/i)?.[1]) || null,
    extractedSections:body.querySelectorAll('h2,h3').length,originalCompleteness:'unknown',readiness:extractionReadiness({paragraphs})}};
}
export async function loadArticle(entry,signal,fetchDoc=fetchDocument) {
  const url=entry.readUrl || entry.url;
  const medium=/(^|\.)medium\.com$/.test(new URL(entry.feedUrl).hostname);
  if(medium){
    let full=entry;
    // Topic summaries cannot certify a public full story. Resolve public owner feed.
    if(!entry.bodyProvided || text(htmlDoc('<html><body>'+entry.contentHtml+'</body></html>').body).length<1200){
      const parsed=new URL(entry.url),owner=parsed.pathname.split('/').filter(Boolean)[0];
      const feedUrl=parsed.hostname.replace(/^www\./,'')==='medium.com' ? `https://medium.com/feed/${owner}` : new URL('/feed',parsed).href;
      const source=await fetchDoc(feedUrl,signal);
      const story=raw=>new URL(raw).pathname.match(/-([a-f0-9]{12})\/?$/i)?.[1] || canonical(raw);
      full=parseFeed(source.html,{name:entry.source,url:feedUrl,category:entry.category}).find(item=>story(item.url)===story(entry.url));
    }
    if(!full?.bodyProvided)throw new Error('incomplete');
    const doc=htmlDoc('<html><head></head><body><article></article></body></html>');
    const heading=doc.createElement('title');heading.textContent=entry.title;doc.head.appendChild(heading);
    doc.querySelector('article').innerHTML=full.contentHtml;
    return {url:canonical(url),article:extractArticle(doc.toString(),url,entry.title,{feedBody:true})};
  }
  const source=await fetchDoc(url,signal);
  return {url:source.url,article:extractArticle(source.html,source.url,entry.title)};
}

// Diagnostics describe only the supplied extracted bytes. They cannot establish
// that a remote original is complete, and do not penalize length or topic.
export function extractionReadiness(article){
  const paragraphs=article.paragraphs || [], body=paragraphs.join('\n');
  const characters=body.length, words=body.trim().split(/\s+/).filter(Boolean).length;
  const reasons=[];
  if(characters<500)reasons.push('body_too_short');
  if(characters>MAX_BODY_CHARS || paragraphs.length>200)reasons.push('body_limit');
  if(body.includes('\u0000') || (body.match(/\ufffd/g)||[]).length>characters*0.01)reasons.push('encoding_damage');
  return {stage:'extraction',status:reasons.length?'unavailable':'ready',reasons,characters,words,paragraphs:paragraphs.length,originalCompleteness:'unknown'};
}
