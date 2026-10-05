// The real Edge entry point boots OFF with no permission to read service keys,
// access a database or open a network connection. All requests stay synthetic.
Deno.test('catalog OFF boot never constructs a database client or fetches public content',async()=>{
  const serve=Deno.serve;let handler;
  try{
    Deno.serve=callback=>{handler=callback;return {};};
    await import('../supabase/functions/rss-catalog/index.ts');
    if(!handler)throw Error('Missing HTTP handler');
    for(const method of ['GET','POST']){
      const response=await handler(new Request('https://catalog.example/rss-catalog',{method}));
      if(response.status!==503||(await response.json()).mode!=='off')throw Error('OFF boundary failed');
    }
    if((await handler(new Request('https://catalog.example/rss-catalog',{method:'OPTIONS'}))).status!==204)throw Error('CORS preflight failed');
  }finally{Deno.serve=serve;}
});
