// Actual Deno socket path, confined to loopback synthetic HTTP. Production
// calls still pass public DNS + HTTPS admission before this pinned transport.
import {requestPrefixDeno} from '../server/rss-catalog/public-prefix.mjs';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
const encoder=new TextEncoder(),decoder=new TextDecoder();
for(const fixture of [
  {name:'early OG prefix closes before body tail',body:'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 1000000\r\n\r\n<meta>',stop:data=>data.length>=6,complete:false,length:6},
  {name:'complete chunked response proves absence without waiting for socket EOF',body:'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n6\r\n<html>\r\n0\r\n\r\n',stop:()=>false,complete:true,length:6},
  {name:'truncated length stays incomplete',body:'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 100\r\n\r\n<html>',end:true,stop:()=>false,complete:false,length:6},
  {name:'private response cancels body reading',body:'HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nCache-Control: private\r\nContent-Length: 1000000\r\n\r\n',stop:()=>false,complete:false,length:null}
])Deno.test('catalog prefix '+fixture.name,async()=>{
  const listener=Deno.listen({hostname:'127.0.0.1',port:0}),port=listener.addr.port;
  const server=(async()=>{
    const conn=await listener.accept();listener.close();
    try{
      const buffer=new Uint8Array(4096),n=await conn.read(buffer),request=decoder.decode(buffer.subarray(0,n||0));
      assert(request.includes(`Host: www.tmz.com:${port}`),'Original hostname is preserved');
      assert(request.includes('Accept-Encoding: identity'),'No compressed page');assert(!/Authorization|Cookie:/i.test(request),'No credentials');
      const payload=encoder.encode(fixture.body);let sent=0;while(sent<payload.length)sent+=await conn.write(payload.subarray(sent));
      if(!fixture.end)assert(await conn.read(buffer)===null,'Client cancels the unread page');
    }finally{try{conn.close();}catch{}}
  })();
  try{
    const reply=await requestPrefixDeno(new URL(`http://www.tmz.com:${port}/public-story`),[{address:'127.0.0.1',family:4}],
      {signal:AbortSignal.timeout(1000),limit:131072,stop:fixture.stop});
    assert(reply.complete===fixture.complete,'Completion provenance');assert((reply.bytes?.length??null)===fixture.length,'Retained prefix length');
    await server;
  }finally{try{listener.close();}catch{}}
});
