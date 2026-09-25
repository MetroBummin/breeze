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
// Supabase's Deno Node shim rejects ClientRequest.options.lookup. On that
// runtime, connect to the already validated IP and upgrade the same socket to
// TLS using the original hostname for SNI and certificate verification.
export function decodeHttpResponse(raw,limit){
  const text=new TextDecoder('latin1').decode(raw);
  const end=text.indexOf('\r\n\r\n');
  if(end<0||end>32768)throw new Error('bad_response');
  const lines=text.slice(0,end).split('\r\n');
  const match=lines.shift().match(/^HTTP\/1\.[01] (\d{3})(?: |$)/);
  if(!match)throw new Error('bad_response');
  const status=Number(match[1]),headers=Object.create(null);
  for(const line of lines){
    const colon=line.indexOf(':');
    if(colon<=0)throw new Error('bad_response');
    const key=line.slice(0,colon).toLowerCase();
    if(!/^[a-z0-9-]+$/.test(key))throw new Error('bad_response');
    if(!(key in headers))headers[key]=line.slice(colon+1).trim();
  }
  if([301,302,303,307,308].includes(status))return {status,location:headers.location,headers,bytes:null};
  if(status<200||status>=300)return {status,headers,bytes:null};
  const start=end+4,body=raw.subarray(start);
  if(/(?:^|,)\s*chunked\s*(?:,|$)/i.test(headers['transfer-encoding']||'')){
    let at=start,total=0;const chunks=[];
    for(;;){
      const lineEnd=text.indexOf('\r\n',at);
      if(lineEnd<0||lineEnd-at>64)throw new Error('bad_response');
      const sizeText=text.slice(at,lineEnd).split(';',1)[0];
      if(!/^[0-9a-f]+$/i.test(sizeText))throw new Error('bad_response');
      const size=parseInt(sizeText,16);
      if(size===0)break;
      total+=size;if(total>limit)throw new Error('too_big');
      at=lineEnd+2;
      if(at+size+2>raw.length||text.slice(at+size,at+size+2)!=='\r\n')throw new Error('bad_response');
      chunks.push(raw.subarray(at,at+size));at+=size+2;
    }
    const bytes=new Uint8Array(total);let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return {status,headers,bytes};
  }
  const length=headers['content-length'];
  if(length!==undefined){
    if(!/^\d+$/.test(length))throw new Error('bad_response');
    const count=Number(length);
    if(count>limit)throw new Error('too_big');
    if(body.length<count)throw new Error('bad_response');
    return {status,headers,bytes:body.slice(0,count)};
  }
  if(body.length>limit)throw new Error('too_big');
  return {status,headers,bytes:body.slice()};
}
async function requestDenoPinned(url,addresses,{signal,headers,limit}){
  const host=url.hostname.replace(/^\[|\]$/g,'');
  const address=(addresses.find(item=>item.family===4)||addresses[0]).address;
  const port=Number(url.port||(url.protocol==='https:'?443:80));
  let conn;
  const abort=()=>{try{conn?.close();}catch{}};
  if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
  signal?.addEventListener('abort',abort,{once:true});
  try{
    conn=await Deno.connect({hostname:address,port});
    if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
    if(url.protocol==='https:')conn=await Deno.startTls(conn,{hostname:host,alpnProtocols:['http/1.1']});
    const lines=[`GET ${url.pathname+url.search} HTTP/1.1`,`Host: ${url.host}`,'Connection: close'];
    for(const [key,value] of Object.entries(headers)){
      if(!/^[a-z0-9-]+$/i.test(key)||/[\r\n]/.test(String(value)))throw new Error('bad_request');
      lines.push(`${key}: ${value}`);
    }
    const request=new TextEncoder().encode(lines.join('\r\n')+'\r\n\r\n');
    await conn.write(request);
    const chunks=[];let size=0,headerEnd=-1;const buffer=new Uint8Array(16384);
    while(true){
      const n=await conn.read(buffer);if(n===null)break;
      size+=n;
      if(size>limit*2+65536)throw new Error('too_big');
      chunks.push(buffer.slice(0,n));
      if(headerEnd<0){
        const probe=new Uint8Array(size);let at=0;
        for(const chunk of chunks){probe.set(chunk,at);at+=chunk.length;}
        headerEnd=new TextDecoder('latin1').decode(probe).indexOf('\r\n\r\n');
        if(headerEnd<0&&size>32768)throw new Error('bad_response');
      }
    }
    if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
    const raw=new Uint8Array(size);let at=0;
    for(const chunk of chunks){raw.set(chunk,at);at+=chunk.length;}
    return decodeHttpResponse(raw,limit);
  }catch(error){
    if(signal?.aborted)throw signal.reason||new DOMException('Aborted','AbortError');
    throw error;
  }finally{signal?.removeEventListener('abort',abort);try{conn?.close();}catch{}}
}
/**
 * @param {string} raw
 * @param {{signal?: AbortSignal, headers?: Record<string,string>, limit?: number, resolve?: typeof lookup, transport?: typeof requestPinned}} [options]
 */
export async function fetchPublic(raw,{signal,headers={},limit=3000000,resolve=lookup,transport=requestPinned}={}){
  if(typeof Deno!=='undefined'&&transport===requestPinned)transport=requestDenoPinned;
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
