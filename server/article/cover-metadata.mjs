/* Pure metadata extraction for the catalog's bounded, allowlisted refresh.
   Caller owns successful/public HTTP provenance, budgets, cancellation and
   cache expiry. This module never fetches or retains article/image bodies. */
import {DOMParser} from 'linkedom';
import {publicUrl} from './public-fetch.mjs';

const badImage=/(logo|icon|avatar|profile[-_]image|sprite|spacer|pixel|1x1|placeholder|badge|emoji|blank)/i;
// LinkeDOM preserves attribute spelling; HTML names and duplicate-name
// precedence are case-insensitive. Read the first matching source attribute.
const attribute=(node,name)=>[...node.attributes].find(item=>item.name.toLowerCase()===name)?.value??null;
function publicMetadataUrl(raw,base){
  if(!String(raw||'').trim())return '';
  try{
    const url=publicUrl(new URL(raw,base).href),host=url.hostname;
    if(!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(host)
      ||/(^|\.)(localhost|local|internal|home|lan|onion)$/i.test(host)
      ||[...url.searchParams.keys()].some(key=>/^(?:token|access_token|api_?key|auth|authorization|secret|password|session|jwt|signature|sig|AWSAccessKeyId|GoogleAccessId|(?:x-amz|x-goog)-(?:credential|signature|security-token))$/i.test(key)))return '';
    return url.href;
  }catch{return '';}
}
function safePhoto(raw,base){const url=publicMetadataUrl(raw,base);return badImage.test(url)?'':url;}
function bestSource(image){
  let best='',width=-1,over='',overWidth=Infinity;
  for(const match of (attribute(image,'srcset')||attribute(image,'data-srcset')||'').matchAll(/(?:^|,\s*)(\S+)\s+(\d+)w(?=\s*(?:,|$))/g)){
    const next=Number(match[2]);
    if(next<=1600&&next>width){best=match[1];width=next;}
    if(next>1600&&next<overWidth){over=match[1];overWidth=next;}
  }
  return best||attribute(image,'data-src')||attribute(image,'data-original')||attribute(image,'src')||over;
}
export function extractPublicArticleCover(html,base){
  if(typeof html!=='string'||html.length>3000000)return '';
  const origin=publicMetadataUrl(base);if(!origin)return '';
  const end=html.lastIndexOf('>');if(end<0)return '';
  const doc=new DOMParser().parseFromString(html.slice(0,end+1),'text/html');
  doc.querySelectorAll('script,style,noscript,template').forEach(node=>node.remove());
  const declared=[...doc.querySelectorAll('base')].find(node=>attribute(node,'href')!==null);
  const resolvedBase=declared?publicMetadataUrl(attribute(declared,'href').trim()||origin,origin):origin;
  let ambiguousBase=false;
  const photoFor=raw=>{
    if(!String(raw||'').trim())return '';
    if(!resolvedBase){try{new URL(raw);}catch{ambiguousBase=true;return '';}}
    return safePhoto(raw,resolvedBase||undefined);
  };
  const metas=[...doc.querySelectorAll('meta')];
  for(const name of ['og:image','og:image:url','twitter:image','twitter:image:src']){
    for(const node of metas.filter(node=>(attribute(node,'property')||attribute(node,'name')||'').trim().toLowerCase()===name)){
      const photo=photoFor(attribute(node,'content'));if(photo)return photo;
    }
  }
  // Public share metadata is distinct from a restricted article's body.
  if(!/"isAccessibleForFree"\s*:\s*(?:false|"false")/i.test(html))for(const image of doc.querySelectorAll('img')){
    const width=parseInt(attribute(image,'width')||'0',10),height=parseInt(attribute(image,'height')||'0',10);
    if((width||height)&&(Math.max(width,height)<200||Math.min(width,height)>0&&Math.min(width,height)<60))continue;
    const photo=photoFor(bestSource(image));if(photo)return photo;
  }
  // The caller must not cache ambiguous private/invalid-base resolution as a
  // successful no-image result. No URL or publisher body appears in the error.
  if(ambiguousBase)throw Error('cover_base_unsafe');
  return '';
}
