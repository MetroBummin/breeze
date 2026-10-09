/* Synthetic public feed fixtures and local fetch only. No credentials, live
   endpoints, DOM image requests or provider calls are exercised here. */
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';
const article=readFileSync(new URL('../scripts/importers/article.js',import.meta.url),'utf8');
const current=readFileSync(new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
export const cacheKey='breeze.rss-public.v1';
export function rssDevice({source=current,storage=new Map(),now=1000000,offline=false,
  missingCovers=false,mediumUnusable=false,mediumResolve=false,candidates=20,custom=[],denyStorage=false,catalog=false}={}){
  const calls=[],state={now,offline,fail:false,catalogPayload:null,catalogStatus:200};
  let feedAt=[];
  class Clock extends Date{static now(){return state.now;}}
  const context=createContext({URL,Date:Clock,TextEncoder,TextDecoder,Uint8Array,Response,AbortSignal,window:{BREEZE_CONFIG:{RSS_CATALOG:catalog}},console:{warn(){},error(){}},
    setTimeout,clearTimeout,ensureReadabilityLib:async()=>{},books:[],positions:{},SB_URL:'https://relay.example',SB_KEY:'synthetic-public-key',
    navigator:{get onLine(){return !state.offline;}},
    localStorage:{getItem:key=>{if(denyStorage)throw Error('storage denied');return storage.get(key)||null;},
      setItem:(key,value)=>{if(denyStorage)throw Error('storage denied');storage.set(key,value);}},
    load:(key,fallback)=>key==='breeze.feed-sources'?custom:fallback,
    fetch:async (raw,options)=>{
      const url=new URL(raw),proxy=url.origin==='https://relay.example';
      if(!proxy)throw new TypeError('Synthetic publisher CORS rejection');
      if(state.offline)throw Error('offline');
      if(url.pathname.endsWith('/rss-catalog')){
        if(state.fail){calls.push({target:'catalog',bytes:0,status:503});return new Response('',{status:503});}
        const payload=state.catalogPayload||{version:1,feeds:context.rssSources().slice(0,13).map((feed,id)=>({id,at:state.now,status:'ready',entries:context.parseRss('',feed).slice(0,20).map(({contentHtml,bodyProvided,...entry})=>entry)}))};
        const body=JSON.stringify(payload),status=state.catalogStatus;calls.push({target:'catalog',bytes:status===304?0:Buffer.byteLength(body),status,headers:options.headers});
        return new Response(status===304?null:body,{status,headers:{etag:'synthetic-etag'}});
      }
      const target=url.searchParams.get('url');
      if(state.fail){calls.push({target,bytes:0,status:503});return {ok:false,status:503,json:async()=>null};}
      const isFeed=/feed|\.xml|\.rss|\.atom/.test(target);
      const html=target+' '+'x'.repeat(isFeed?100000:200000);
      const payload={url:target,html};calls.push({target,bytes:Buffer.byteLength(JSON.stringify(payload)),status:200});
      return {ok:true,status:200,json:async()=>payload};
    }});
  new Script(article+'\n'+source).runInContext(context);
  context.parseRss=(_html,feed)=>{
    feedAt.push({url:feed.sourceUrl||feed.url,at:state.now});
    const medium=feed.url.includes('medium.com'),author=medium&&/\/feed\/@writer-/.test(feed.url);
    const topic=mediumUnusable?(feed.name.includes('Technology')?'technology-':feed.name.includes('Culture')?'culture-':'business-'):'';
    return Array.from({length:candidates},(_,i)=>({title:'The synthetic English story '+i,
      url:medium?`https://medium.com/@writer-${topic}${i}/story-${(i+1).toString(16).padStart(12,'0')}`:
        `https://stories.example/${encodeURIComponent(feed.name)}/${i}`,
      source:feed.name,feedUrl:feed.url,feedSourceUrl:feed.sourceUrl||feed.url,category:feed.category||'general',
      bodyProvided:medium&&!mediumUnusable&&(!mediumResolve||author),
      contentHtml:medium&&!mediumUnusable&&(!mediumResolve||author)?'<p>A synthetic full public feed body.</p>':'',
      photo:missingCovers&&!medium?'':`https://images.example/${encodeURIComponent(feed.name)}/${i}.png`,
      author:'Synthetic author',summary:'The public story describes a synthetic example.',publishedAt:'',date:'',kind:'',readUrl:''}));
  };
  context.parseFeedArticle=entry=>entry.bodyProvided?{title:entry.title,blocks:[{r:'p',t:'Synthetic public body'}]}:null;
  context.parseArticleHtml=(_html,url)=>({title:'Synthetic cover article',cover:`https://images.example/${encodeURIComponent(url)}.png`,blocks:[{r:'p',t:'Synthetic body'}]});
  return {context,calls,state,storage,feedAt,
    load:force=>context.loadRss(force),advance:ms=>{state.now+=ms;},
    rotate:()=>{new Script('rssPage++;rssLoadedAt=0;').runInContext(context);return context.loadRss(false);},
    entries:()=>JSON.parse(new Script('JSON.stringify(rssCands)').runInContext(context)),
    metrics:()=>({requests:calls.length,responseBodyBytes:calls.reduce((sum,call)=>sum+call.bytes,0)})};
}
