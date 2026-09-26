import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source=readFileSync(new URL('../scripts/importers/article.js',import.meta.url),'utf8');
const png=readFileSync(new URL('../assets/favicon/icon-512.png',import.meta.url));
const imageUrl='https://images.example/reading.png';
const relayBase='https://relay.example';

function importer(fetch,relay=relayBase){
  const context=vm.createContext({fetch,AbortSignal,SB_URL:relay,SB_KEY:'test-public-key'});
  vm.runInContext(source,context);
  return context.fetchArticleImage;
}
const validImage=()=>new Response(png,{headers:{'Content-Type':'image/png'}});
async function exactImage(blob){
  assert(blob instanceof Blob);assert.equal(blob.type,'image/png');
  assert.deepEqual(Buffer.from(await blob.arrayBuffer()),png);
}
// Native fetch keeps the request signal attached while reading the body. Model
// that boundary with a genuine PNG stream, not a delayed fake blob() method.
function slowImage(signal,delay,onAbort){
  const stream=new ReadableStream({start(controller){
    controller.enqueue(png.subarray(0,32));
    const abort=()=>{clearTimeout(timer);onAbort();controller.error(signal.reason);};
    const timer=setTimeout(()=>{
      signal.removeEventListener('abort',abort);
      controller.enqueue(png.subarray(32));controller.close();
    },delay);
    signal.addEventListener('abort',abort,{once:true});
  }});
  return new Response(stream,{headers:{'Content-Type':'image/png'}});
}

test('a complete direct image preserves every byte without a relay request',async()=>{
  const calls=[];
  const load=importer(async(url,options)=>{calls.push(url);assert.equal(options.credentials,'omit');return validImage();});
  await exactImage(await load(imageUrl));assert.deepEqual(calls,[imageUrl]);
});

test('direct HTTP 200 with a body timeout still uses the relay', {timeout:7000},async()=>{
  const events=[];
  const load=importer(async(url,options)=>{
    if(url===imageUrl){events.push('direct headers');return slowImage(options.signal,2400,()=>events.push('direct body aborted'));}
    events.push('relay');const endpoint=new URL(url);
    assert.equal(endpoint.origin,relayBase);assert.equal(endpoint.searchParams.get('as'),'image');
    assert.equal(endpoint.searchParams.get('url'),imageUrl);
    return validImage();
  });
  await exactImage(await load(imageUrl));assert.deepEqual(events,['direct headers','direct body aborted','relay']);
});

for(const [name,response] of [
  ['empty image body',()=>new Response(null,{headers:{'Content-Type':'image/png'}})],
  ['HTTP 200 challenge page',()=>new Response('<html>Try again</html>',{headers:{'Content-Type':'text/html'}})],
  ['interrupted image stream',()=>new Response(new ReadableStream({start(controller){controller.enqueue(png.subarray(0,32));controller.error(new Error('stream interrupted'));}}),{headers:{'Content-Type':'image/png'}})],
])test('direct '+name+' falls back to the complete relay image',async()=>{
  const calls=[];
  const load=importer(async url=>{calls.push(url);return url===imageUrl?response():validImage();});
  await exactImage(await load(imageUrl));assert.equal(calls.length,2);assert.equal(calls[0],imageUrl);
});

for(const [name,response] of [
  ['empty image',()=>new Response(null,{headers:{'Content-Type':'image/png'}})],
  ['non-image response',()=>new Response('unavailable',{headers:{'Content-Type':'text/plain'}})],
  ['SVG document',()=>new Response('<svg/>',{headers:{'Content-Type':'image/svg+xml'}})],
  ['failed status',()=>new Response('busy',{status:503})],
])test('unusable relay '+name+' stops after the two allowed attempts',async()=>{
  const calls=[];
  const load=importer(async url=>{calls.push(url);if(url===imageUrl)throw new TypeError('Direct CORS failure');return response();});
  assert.equal(await load(imageUrl),null);assert.equal(calls.length,2);
});

test('a relay body exceeding its existing budget is aborted',{timeout:7000},async()=>{
  const events=[];
  const load=importer(async(url,options)=>{
    if(url===imageUrl){events.push('direct blocked');throw new TypeError('Direct CORS failure');}
    events.push('relay headers');return slowImage(options.signal,4400,()=>events.push('relay body aborted'));
  });
  assert.equal(await load(imageUrl),null);assert.deepEqual(events,['direct blocked','relay headers','relay body aborted']);
});

test('without a configured relay an invalid direct body returns without another request',async()=>{
  let calls=0;const load=importer(async()=>{calls++;return new Response(null,{headers:{'Content-Type':'image/png'}});},'');
  assert.equal(await load(imageUrl),null);assert.equal(calls,1);
});
