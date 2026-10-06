// Catalog-only HTTP prefix transport. Reuses the existing public URL/DNS rules;
// redirects are validated and DNS answers pinned before every connection.
import {request as httpRequest} from 'node:http';
import {request as httpsRequest} from 'node:https';
import {lookup} from 'node:dns/promises';
import {publicUrl,publicAddresses} from '../article/public-fetch.mjs';
const redirects=[301,302,303,307,308];
const join=chunks=>{const bytes=new Uint8Array(chunks.reduce((sum,chunk)=>sum+chunk.length,0));let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}return bytes;};
const abortable=(job,signal)=>new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason||new DOMException('Aborted','AbortError'));
  if(signal.aborted)return abort();signal.addEventListener('abort',abort,{once:true});
  Promise.resolve(job).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
});
export function prefixHeadersAllowed(status,headers){
  return status===200&&/^(?:text\/html|application\/xhtml\+xml)\b/i.test(headers['content-type']||'')&&
    !/(?:^|,)\s*(?:private|no-store)(?:\s|,|$)/i.test(headers['cache-control']||'')&&
    /^(?:identity)?$/i.test(headers['content-encoding']||'')&&!/challenge/i.test(headers['cf-mitigated']||'');
}
export async function readHtmlPrefix(stream,limit,stop=()=>false){
  const chunks=[];let retained=0,bodyBytesReceived=0;
  try{
    for await(const chunk of stream){
      bodyBytesReceived+=chunk.byteLength;const kept=chunk.subarray(0,limit-retained);chunks.push(kept);retained+=kept.length;
      const bytes=join(chunks);
      if(stop(bytes)||retained>=limit){if(typeof stream.destroy==='function')stream.destroy();return {bytes,complete:false,bodyBytesReceived};}
    }
    return {bytes:join(chunks),complete:true,bodyBytesReceived};
  }finally{if(typeof stream.destroy==='function')stream.destroy();}
}
export function requestPrefixNode(url,addresses,{signal,limit,stop}){
  return new Promise((resolve,reject)=>{
    const start=url.protocol==='https:'?httpsRequest:httpRequest;
    const request=start(url,{method:'GET',agent:false,signal,maxHeaderSize:32768,
      headers:{'User-Agent':'Breeze public RSS metadata','Accept':'text/html,application/xhtml+xml','Accept-Encoding':'identity'},
      lookup(_host,options,callback){const chosen=addresses.find(item=>!options?.family||item.family===options.family)||addresses[0];
        if(options?.all)callback(null,addresses);else callback(null,chosen.address,chosen.family);}
    },async response=>{
      try{
        const status=response.statusCode||502,headers=response.headers;
        if(redirects.includes(status)){response.destroy();resolve({status,headers,location:headers.location,bytes:null,complete:false,bodyBytesReceived:0});return;}
        if(!prefixHeadersAllowed(status,headers)){response.destroy();resolve({status,headers,bytes:null,complete:false,bodyBytesReceived:0});return;}
        const body=await readHtmlPrefix(response,limit,bytes=>stop(bytes,headers,url.href));
        resolve({status,headers,...body});
      }catch(error){response.destroy();reject(error);}
    });
    request.on('error',reject);request.end();
  });
}
// Partial HTTP/1.1 decoder for Deno's pinned TLS socket. No full body is needed
// to extract a complete OG tag. Only a complete body can prove photo absence.
export function decodeHttpPrefix(raw,limit,eof=false){
  const text=new TextDecoder('latin1').decode(raw),end=text.indexOf('\r\n\r\n');
  if(end<0){if(raw.length>32768)throw Error('bad_response');return null;}
  if(end>32768)throw Error('bad_response');
  const lines=text.slice(0,end).split('\r\n'),match=lines.shift().match(/^HTTP\/1\.[01] (\d{3})(?: |$)/);
  if(!match)throw Error('bad_response');const status=Number(match[1]),headers=Object.create(null);
  for(const line of lines){const colon=line.indexOf(':');if(colon<=0)throw Error('bad_response');
    const key=line.slice(0,colon).toLowerCase();if(!/^[a-z0-9-]+$/.test(key))throw Error('bad_response');
    const value=line.slice(colon+1).trim();
    if(key in headers&&['content-length','transfer-encoding','content-type','content-encoding'].includes(key))throw Error('bad_response');
    if(['cache-control','cf-mitigated'].includes(key)&&key in headers)headers[key]+=', '+value;
    else if(!(key in headers))headers[key]=value;}
  if(redirects.includes(status))return {status,headers,location:headers.location,bytes:null,complete:false,bodyBytesReceived:0};
  if(!prefixHeadersAllowed(status,headers))return {status,headers,bytes:null,complete:false,bodyBytesReceived:0};
  if(headers['transfer-encoding']&&(!/^chunked$/i.test(headers['transfer-encoding'])||headers['content-length']!==undefined))throw Error('bad_response');
  const body=raw.subarray(end+4);
  if(/(?:^|,)\s*chunked\s*(?:,|$)/i.test(headers['transfer-encoding']||'')){
    let at=end+4,total=0,bodyBytesReceived=0,complete=false;const chunks=[];
    while(at<raw.length){
      const lineEnd=text.indexOf('\r\n',at);if(lineEnd<0){if(raw.length-at>64)throw Error('bad_response');break;}
      const sizeText=text.slice(at,lineEnd).split(';',1)[0];if(!/^[0-9a-f]+$/i.test(sizeText)||lineEnd-at>64)throw Error('bad_response');
      const size=parseInt(sizeText,16);if(!Number.isSafeInteger(size))throw Error('bad_response');at=lineEnd+2;
      if(size===0){complete=text.slice(at,at+2)==='\r\n'||text.indexOf('\r\n\r\n',at)>=at;break;}
      const available=Math.min(size,raw.length-at),keep=Math.min(available,Math.max(0,limit-total));
      bodyBytesReceived+=available;if(keep){chunks.push(raw.subarray(at,at+keep));total+=keep;}
      if(available<size||at+size+2>raw.length)break;
      if(text.slice(at+size,at+size+2)!=='\r\n')throw Error('bad_response');at+=size+2;
    }
    return {status,headers,bytes:join(chunks),complete:complete&&bodyBytesReceived<=limit,bodyBytesReceived};
  }
  const length=headers['content-length'];
  if(length!==undefined&&!/^\d+$/.test(length))throw Error('bad_response');
  const count=length===undefined?Infinity:Number(length);if(length!==undefined&&!Number.isSafeInteger(count))throw Error('bad_response');
  const received=Math.min(body.length,count);
  return {status,headers,bytes:body.slice(0,Math.min(limit,count)),bodyBytesReceived:received,
    complete:received<=limit&&(length===undefined?eof:body.length>=count)};
}
export async function requestPrefixDeno(url,addresses,{signal,limit,stop}){
  const host=url.hostname.replace(/^\[|\]$/g,''),address=(addresses.find(item=>item.family===4)||addresses[0]).address;
  let conn;const abort=()=>{try{conn?.close();}catch{}};signal.addEventListener('abort',abort,{once:true});
  try{
    conn=await Deno.connect({hostname:address,port:Number(url.port||(url.protocol==='https:'?443:80))});
    if(signal.aborted)throw signal.reason;
    if(url.protocol==='https:')conn=await Deno.startTls(conn,{hostname:host,alpnProtocols:['http/1.1']});
    const request=new TextEncoder().encode(`GET ${url.pathname+url.search} HTTP/1.1\r\nHost: ${url.host}\r\nUser-Agent: Breeze public RSS metadata\r\nAccept: text/html,application/xhtml+xml\r\nAccept-Encoding: identity\r\nConnection: close\r\n\r\n`);
    let sent=0;while(sent<request.length)sent+=await conn.write(request.subarray(sent));
    const chunks=[],buffer=new Uint8Array(16384);let size=0,result=null;
    while(true){
      const n=await conn.read(buffer),eof=n===null;
      if(!eof){size+=n;if(size>limit*2+65536)throw Error('prefix_framing_limit');chunks.push(buffer.slice(0,n));}
      result=decodeHttpPrefix(join(chunks),limit,eof);
      if(result&&(result.bytes===null||result.complete||result.bytes.length>=limit||stop(result.bytes,result.headers,url.href)))return result;
      if(eof){if(!result)throw Error('bad_response');return result;}
    }
  }finally{signal.removeEventListener('abort',abort);try{conn?.close();}catch{}}
}
/** @param {string} raw @param {{limit?:number,timeoutMs?:number,maxRedirects?:number,allowed?:(url:URL)=>boolean,stop?:(bytes:Uint8Array,headers:any,url:string)=>boolean,resolve?:any,transport?:any}} options */
export async function fetchPublicPrefix(raw,{limit=131072,timeoutMs=4000,maxRedirects=2,allowed=()=>false,stop=()=>false,resolve=lookup,transport}={}){
  const signal=AbortSignal.timeout(timeoutMs);let url=publicUrl(raw),httpAttempts=0;
  transport=transport||(typeof Deno==='undefined'?requestPrefixNode:requestPrefixDeno);
  try{for(let hop=0;hop<=maxRedirects;hop++){
    if(!allowed(url))throw Error('photo_source_blocked');
    const addresses=await abortable(publicAddresses(url,resolve),signal);
    httpAttempts++;const result=await abortable(transport(url,addresses,{signal,limit,stop}),signal);
    if(redirects.includes(result.status)){
      if(hop===maxRedirects||!result.location)throw Error('redirect_limit');url=publicUrl(new URL(result.location,url).href);continue;
    }
    return {...result,url:url.href,httpAttempts};
  }}catch(error){const failure=error instanceof Error?error:Error('prefix_transport_failed');failure.prefixHttpAttempts=httpAttempts;throw failure;}
  throw Error('redirect_limit');
}
