/* Only public destinations, including every redirect. DNS is resolved once and
   the validated addresses are pinned into the socket lookup (no DNS TOCTOU).
   Keep the original hostname for Host/TLS SNI and certificate verification. */
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export function publicAddress(address){
  if(isIP(address)===4){
    const [a,b,c]=address.split('.').map(Number);
    return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||
      a===192&&(b===168||b===0||b===2)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51&&c===100)||
      a===203&&b===0&&c===113);
  }
  if(isIP(address)===6){
    const first=parseInt(address.split(':')[0],16);
    // Global unicast only; excludes loopback, mapped IPv4, ULA and link-local.
    if(!(first>=0x2000&&first<=0x3fff))return false;
    const lower=address.toLowerCase();
    if(/^2001:(?:0*:|0*db8:|0*2:|0*1[0-9a-f]:|0*2[0-9a-f]:)/.test(lower)||/^2002:|^3fff:/.test(lower))return false;
    return true;
  }
  return false;
}
export function publicUrl(raw){
  let url;try{url=new URL(raw);}catch{throw new Error('bad_url');}
  const host=url.hostname.replace(/^\[|\]$/g,'').replace(/\.$/,'').toLowerCase();
  if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.href.length>4096||
    url.port&&url.port!==(url.protocol==='https:'?'443':'80')||!host||
    host==='localhost'||/\.(?:local|internal|localhost|test|invalid)$/.test(host)||
    !isIP(host)&&!host.includes('.')||isIP(host)&&!publicAddress(host))throw new Error('bad_url');
  url.hash='';return url;
}
export async function publicAddresses(url,resolve=lookup){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const addresses=isIP(host)?[{address:host,family:isIP(host)}]:await resolve(host,{all:true,verbatim:true});
  if(!addresses.length||addresses.some(item=>!publicAddress(item.address)))throw new Error('bad_url');
  return addresses;
}
function untilAbort(job,signal){
  return new Promise((resolve,reject)=>{
    const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));
    if(signal.aborted)return abort();
    signal.addEventListener('abort',abort,{once:true});
    Promise.resolve(job).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
  });
}
export async function readBounded(stream,limit){
  let total=0;const chunks=[];
  try{
    for await(const chunk of stream){
      total+=chunk.byteLength;
      if(total>limit)throw new Error('too_big');
      chunks.push(chunk);
    }
    const result=new Uint8Array(total);let at=0;
    for(const chunk of chunks){result.set(chunk,at);at+=chunk.byteLength;}
    return result;
  }catch(error){if(typeof stream.destroy==='function')stream.destroy();throw error;}
}
function requestPinned(url,addresses,{signal,headers,limit}){
  return new Promise((resolve,reject)=>{
    const start=url.protocol==='https:'?httpsRequest:httpRequest;
    const request=start(url,{
      method:'GET',agent:false,signal,headers,
      lookup(_host,options,callback){
        const preferred=options?.family?addresses.filter(item=>item.family===options.family):addresses;
        const selected=preferred.length?preferred:addresses;
        if(options?.all)callback(null,selected);
        else callback(null,selected[0].address,selected[0].family);
      }
    },async response=>{
      try{
        const status=response.statusCode||502;
        if([301,302,303,307,308].includes(status)){
          const location=response.headers.location;response.destroy();
          resolve({status,location,headers:response.headers,bytes:null});return;
        }
        const length=Number(response.headers['content-length']);
        if(Number.isFinite(length)&&length>limit){response.destroy();throw new Error('too_big');}
        if(status<200||status>=300){response.destroy();resolve({status,headers:response.headers,bytes:null});return;}
        const bytes=await readBounded(response,limit);
        resolve({status,headers:response.headers,bytes});
      }catch(error){response.destroy();reject(error);}
    });
    request.on('error',reject);request.end();
  });
}
/**
 * @param {string} raw
 * @param {{signal?: AbortSignal, headers?: Record<string,string>, limit?: number, resolve?: typeof lookup, transport?: typeof requestPinned}} [options]
 */
export async function fetchPublic(raw,{signal,headers={},limit=3000000,resolve=lookup,transport=requestPinned}={}){
  let url=publicUrl(raw);
  const controller=signal?null:new AbortController();signal=signal||controller.signal;
  for(let hop=0;hop<=5;hop++){
    const addresses=await untilAbort(publicAddresses(url,resolve),signal);
    const result=await untilAbort(transport(url,addresses,{signal,headers:{...headers,'Accept-Encoding':'identity'},limit}),signal);
    if([301,302,303,307,308].includes(result.status)){
      if(hop===5||!result.location)throw new Error('redirect_limit');
      url=publicUrl(new URL(result.location,url).href);continue;
    }
    return {...result,url:url.href};
  }
  throw new Error('redirect_limit');
}
