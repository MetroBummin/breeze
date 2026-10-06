// Real Edge entry point + Supabase client. All REST responses are synthetic;
// the test has no network permission and reads synthetic environment values.
Deno.test('active Edge boot enforces database OFF and refresh authorization',async()=>{
  const serve=Deno.serve,fetch=globalThis.fetch;let handler,reads=0,rpcs=0,authChecks=0;
  try{
    Deno.serve=callback=>{handler=callback;return {};};
    globalThis.fetch=async(raw,options)=>{
      const url=new URL(typeof raw==='string'?raw:raw.url||String(raw));
      if(!url.href.startsWith('https://catalog-db.fixture/rest/v1/'))throw Error('Unexpected transport');
      if(url.pathname.endsWith('/rpc/rss_quality_operator_authorized')){
        authChecks++;
        const headers=new Headers(options?.headers);
        if(headers.get('apikey')!=='synthetic-anon-key'||options.redirect!=='error')throw Error('Invalid auth transport');
        return Response.json(headers.get('Authorization')==='Bearer synthetic.service.signature');
      }
      if(url.pathname.endsWith('/rss_public_catalog')){
        reads++;return Response.json({active:false,payload:{version:1,feeds:[]},revision:null});
      }
      rpcs++;throw Error('OFF must not claim');
    };
    await import('../supabase/functions/rss-catalog/index.ts');
    const url='https://catalog.fixture/rss-catalog';
    const read=await handler(new Request(url));
    if(read.status!==200||(await read.json()).feeds.some(feed=>feed.status!=='disabled'||feed.entries.length))throw Error('Database OFF read failed');
    for(const headers of [{},{apikey:'synthetic-anon'},{authorization:'Bearer synthetic.forged.signature'}]){
      if((await handler(new Request(url,{method:'POST',headers}))).status!==401)throw Error('Refresh authorization failed');
    }
    const refresh=await handler(new Request(url,{method:'POST',headers:{authorization:'Bearer synthetic.service.signature'}}));
    if(refresh.status!==200||(await refresh.json()).reason!=='off'||reads!==2||rpcs!==0||authChecks!==2)throw Error('Database OFF refresh failed');
  }finally{Deno.serve=serve;globalThis.fetch=fetch;}
});
