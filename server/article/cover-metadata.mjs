/* Pure metadata extraction for the catalog's bounded, allowlisted refresh.
   Caller owns successful/public HTTP provenance, budgets, cancellation and
   cache expiry. This module never fetches or retains article/image bodies. */
import {DOMParser} from 'linkedom';
import {publicUrl} from './public-fetch.mjs';

const badImage=/(logo|icon|avatar|profile[-_]image|sprite|spacer|pixel|1x1|placeholder|badge|emoji|blank)/i;
function safePhoto(raw,base){
  if(!String(raw||'').trim())return '';
  try{
    const url=publicUrl(new URL(raw,base).href),host=url.hostname;
    if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)
      ||/(^|\.)(localhost|local|internal|home|lan|onion)$/i.test(host)
      ||[...url.searchParams.keys()].some(key=>/^(?:token|access_token|api_?key|auth|authorization|secret|password|session|jwt|signature|sig|AWSAccessKeyId|GoogleAccessId|(?:x-amz|x-goog)-(?:credential|signature|security-token))$/i.test(key)))return '';
    return badImage.test(url.href)?'':url.href;
  }catch{return '';}
}
function bestSource(image){
  let best='',width=-1,over='',overWidth=Infinity;
  for(const match of (image.getAttribute('srcset')||image.getAttribute('data-srcset')||'').matchAll(/(?:^|,\s*)(\S+)\s+(\d+)w(?=\s*(?:,|$))/g)){
    const next=Number(match[2]);
    if(next<=1600&&next>width){best=match[1];width=next;}
    if(next>1600&&next<overWidth){over=match[1];overWidth=next;}
  }
  return best||image.getAttribute('data-src')||image.getAttribute('data-original')||image.getAttribute('src')||over;
}
export function extractPublicArticleCover(html,base){
  if(typeof html!=='string'||html.length>3000000)return '';
  try{publicUrl(base);}catch{return '';}
  const doc=new DOMParser().parseFromString(html,'text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach(node=>node.remove());
  const metas=[...doc.querySelectorAll('meta')];
  for(const name of ['og:image','og:image:url','twitter:image','twitter:image:src']){
    for(const node of metas.filter(node=>(node.getAttribute('property')||node.getAttribute('name')||'').toLowerCase()===name)){
      const photo=safePhoto(node.getAttribute('content'),base);if(photo)return photo;
    }
  }
  // Public share metadata is distinct from a restricted article's body.
  if(/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html))return '';
  for(const image of doc.querySelectorAll('img')){
    const width=parseInt(image.getAttribute('width')||'0',10),height=parseInt(image.getAttribute('height')||'0',10);
    if((width||height)&&(Math.max(width,height)<200||Math.min(width,height)>0&&Math.min(width,height)<60))continue;
    const photo=safePhoto(bestSource(image),base);if(photo)return photo;
  }
  return '';
}
