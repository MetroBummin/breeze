import {FEEDS} from './feeds.mjs';
import {VERSION, MODEL, RUBRIC, qualityKey, evaluateArticle} from './jev.mjs';
import {canonical, parseFeed, fetchDocument, loadArticle, extractionReadiness} from './extract.mjs';
const DAY=86400000;
export function approvedInventory(entries,now=Date.now()) {
  return (Array.isArray(entries)?entries:[]).filter(entry=>entry.quality?.version===VERSION &&
    entry.quality.status==='approved' && Number.isFinite(entry.quality.checkedAt) && now-entry.quality.checkedAt<7*DAY).slice(0,20);
}
// Public results carry only server-selected metadata; never article bodies, user IDs,
// provider answers, private evidence, credentials, or client-supplied verdicts.
function preferredCover(...candidates) {
  for(const candidate of candidates){
    if(typeof candidate!=='string' || !candidate || /(logo|icon|avatar|sprite|pixel|placeholder)/i.test(candidate))continue;
    try{return canonical(candidate);}catch{/* Try the next public cover candidate. */}
  }
  return '';
}
function publicEntry(entry,article,url,key,now,verdict) {
  return {url:entry.url,readUrl:entry.readUrl || '',title:entry.title,photo:preferredCover(entry.photo,article.cover),
    source:entry.source,category:entry.category,feedUrl:entry.feedUrl,feedSourceUrl:entry.feedUrl,
    author:entry.author,publishedAt:entry.publishedAt,summary:'',bodyProvided:false,contentHtml:'',kind:'',
    quality:{status:verdict.status,eligibility:verdict.eligibility,ranking:verdict.ranking || 0,version:VERSION,key,checkedAt:now,resolvedUrl:url}};
}
export function createQualityService({store,key,fetchDoc=fetchDocument,load=loadArticle,evaluate=evaluateArticle,now=Date.now,mode='off',log=(_event)=>{}}) {
  const inflight=new Map();
  async function refresh(id) {
    if(!['shadow','active'].includes(mode))return;
    if(!FEEDS[id])throw new Error('feed');
    if(inflight.has(id))return inflight.get(id);
    // Local cap plus durable cross-worker feed leases and evaluation slots.
    if(inflight.size>=2 || !key)return;
    const job=(async()=>{
      const claim=await store.claimFeed(id);if(!claim)return;
      const entries=candidateInventory(claim.entries,now());let cursor=claim.cursor;
      const signal=AbortSignal.timeout(70000);
      try {
        const feed=FEEDS[id], source=await fetchDoc(feed.url,signal);
        const candidates=parseFeed(source.html,feed);
        // Continue through the feed on subsequent refreshes, including after rejections.
        // Three extracted bodies per feed per 10 minutes, independent of reader count.
        const count=Math.min(3,candidates.length);
        for(let step=0;step<count;step++) {
          const entry=candidates[cursor % candidates.length];cursor++;
          const identity=canonical(entry.readUrl || entry.url);
          const remove=()=>{for(let i=entries.length-1;i>=0;i--)if(canonical(entries[i].readUrl || entries[i].url)===identity)entries.splice(i,1);};
          try {
            const loaded=await load(entry,signal,fetchDoc), hash=await qualityKey(loaded.url,loaded.article);
            const readiness=extractionReadiness(loaded.article);
            if(readiness.status!=='ready'){remove();log({stage:'extraction',code:readiness.reasons[0],feed:id});continue;}
            // Known new content must not inherit an earlier body's approval.
            for(let i=entries.length-1;i>=0;i--)if(canonical(entries[i].readUrl || entries[i].url)===identity && entries[i].quality.key!==hash)entries.splice(i,1);
            const evaluation=await store.claimEvaluation(hash,loaded.url);
            let verdict=evaluation.verdict;
            if(evaluation.token) {
              try {
                verdict=await evaluate(loaded.article,key,{signal});
                // Only a durable successful write can publish an approval.
                await store.finishEvaluation(hash,evaluation.token,verdict);
                log({stage:verdict.stage,code:verdict.status,reason:verdict.reason,usage:verdict.usage,key:hash,feed:id});
              } catch(error) {
                const diagnostic=safeDiagnostic(error,'provider');log({...diagnostic,key:hash,feed:id});
                await store.retryEvaluation(hash,evaluation.token,diagnostic);
                verdict=null;
              }
            }
            if((verdict?.status==='approved' || verdict?.status==='uncertain' && verdict.eligibility==='candidate') && verdict.version===VERSION) {
              const item=publicEntry(entry,loaded.article,loaded.url,hash,now(),verdict);
              if(item.photo){remove();entries.unshift(item);}
            } else if(verdict)remove(); // Transient same-content provider failure preserves a valid prior verdict.
          } catch(error) {
            // Preserve last-good inventory on transport trouble. Deterministic
            // extraction failures are not cached as permanent AI rejections.
            log({...safeDiagnostic(error),feed:id});
            if(['bad_url','body_too_short','encoding_damage','restricted','incomplete','unsupported_post','body_limit','language_unavailable'].includes(error?.message))remove();
          }
          if(signal.aborted)break;
        }
      } catch(error) {
        log({...safeDiagnostic(error),stage:'feed',feed:id});throw error;
      } finally {
        await store.finishFeed(id,claim.token,cursor,candidateInventory(entries,now()));
      }
    })();
    inflight.set(id,job);
    try{await job;}finally{inflight.delete(id);}
  }
  return {refresh, async candidates(id){return candidateInventory(await store.readFeed(id),now());}, async read(id) {return approvedInventory(await store.readFeed(id),now());}};
}
export function databaseStore(db) {
  const checked=({data,error})=>{if(error)throw new Error('cache_unavailable');return data;};
  return {
    async readFeed(id){const row=checked(await db.from('rss_quality_feeds').select('entries').eq('id',id).single());return row.entries;},
    async claimFeed(id){
      const token=crypto.randomUUID();
      const row=checked(await db.from('rss_quality_feeds').update({token,next_run:new Date(Date.now()+600000).toISOString()})
        .eq('id',id).lte('next_run',new Date().toISOString()).select('entries,cursor').maybeSingle());
      return row ? {...row,token} : null;
    },
    async finishFeed(id,token,cursor,entries){checked(await db.from('rss_quality_feeds').update({cursor,entries}).eq('id',id).eq('token',token));},
    async claimEvaluation(hash,url){return checked(await db.rpc('claim_rss_quality',{p_key:hash,p_url:url,p_version:VERSION,p_model:MODEL,p_rubric:RUBRIC}));},
    async finishEvaluation(hash,token,verdict){
      const row=checked(await db.from('rss_article_quality').update({status:verdict.status,verdict,lease_until:null,
        retry_at:new Date(Date.now()+DAY).toISOString()}).eq('cache_key',hash).eq('token',token).select('cache_key').maybeSingle());
      if(!row)throw new Error('lease_lost');
    },
    async retryEvaluation(hash,token,diagnostic){checked(await db.from('rss_article_quality').update({status:'retry',verdict:{diagnostic},lease_until:null,
      retry_at:new Date(Date.now()+3600000).toISOString()}).eq('cache_key',hash).eq('token',token));},
  };
}

export function candidateInventory(entries,now=Date.now()){
  return (Array.isArray(entries)?entries:[]).filter(e=>e.quality?.version===VERSION &&
    (e.quality.status==='approved' || e.quality.status==='uncertain' && e.quality.eligibility==='candidate') &&
    Number.isFinite(e.quality.checkedAt) && e.quality.checkedAt<=now && now-e.quality.checkedAt<7*DAY)
    .sort((a,b)=>(b.quality.status==='approved')-(a.quality.status==='approved') || (b.quality.ranking||0)-(a.quality.ranking||0)).slice(0,20);
}
export function safeDiagnostic(error,fallbackStage='extraction'){
  if(error?.diagnostic)return error.diagnostic;
  const code=['bad_url','restricted','incomplete','body_limit','body_too_short','encoding_damage','language_unavailable','unsupported_post','source_unavailable','provider_unavailable','not_configured','cache_unavailable','lease_lost'].includes(error?.message)?error.message:'transient_failure';
  return {stage:['provider_unavailable','not_configured'].includes(code)?'provider':['cache_unavailable','lease_lost'].includes(code)?'cache':fallbackStage,code};
}
