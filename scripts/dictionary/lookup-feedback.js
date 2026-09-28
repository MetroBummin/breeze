/* One lookup owns one quiet word cue. Diagnostics stay in memory on this device;
   never include lexical keys, book titles, sentences, account IDs or network data. */
const wordLookupFeedback = (()=>{
  const limit=240, rows=[];
  let active=null, pendingNode=null, pendingBusy=null, status=null;
  const now=()=>performance.now();
  const format=value=>['text','pdf','epub'].includes(value)?value:'text';
  const elapsed=start=>Math.max(0,Math.round(now()-start));
  const append=row=>{rows.push(row);if(rows.length>limit)rows.shift();};
  const styles=`
    .breeze-lookup-pending {
      --breeze-lookup-wash:rgba(74,151,235,.22);
      background-color:var(--breeze-lookup-wash)!important;
      background-image:linear-gradient(108deg,transparent 28%,rgba(171,216,255,.42) 40%,rgba(255,255,255,.68) 49%,rgba(171,216,255,.42) 58%,transparent 70%)!important;
      background-size:240% 100%!important;background-repeat:no-repeat!important;
      border-color:transparent!important;border-radius:5px!important;
      box-shadow:0 0 0 2px var(--breeze-lookup-wash),inset 0 0 0 1px rgba(74,151,235,.18)!important;
      -webkit-box-decoration-break:clone;box-decoration-break:clone;
      animation:breeze-word-sheen 1.65s ease-in-out infinite!important;
    }
    @keyframes breeze-word-sheen {
      0%,12%{background-position:160% 0}80%,100%{background-position:-60% 0}
    }
    #word-lookup-status {position:fixed;width:1px;height:1px;padding:0;margin:-1px;
      overflow:hidden;clip-path:inset(50%);white-space:nowrap;pointer-events:none;}
    @media(prefers-reduced-motion:reduce){
      .breeze-lookup-pending {animation:none!important;background-image:none!important;}
    }`;
  function ensureStyle(doc){
    if(!doc||!doc.head||doc.getElementById('breeze-word-feedback-style'))return;
    const style=doc.createElement('style');style.id='breeze-word-feedback-style';
    style.textContent=styles;doc.head.appendChild(style);
  }
  function announce(text){
    if(!document.body)return;
    if(!status){
      ensureStyle(document);
      status=document.createElement('span');status.id='word-lookup-status';
      status.setAttribute('role','status');status.setAttribute('aria-live','polite');
      status.setAttribute('aria-atomic','true');document.body.appendChild(status);
    }
    if(status.textContent!==text)status.textContent=text;
  }
  function clearCue(){
    if(pendingNode){
      pendingNode.classList.remove('breeze-lookup-pending');
      if(pendingBusy===null)pendingNode.removeAttribute('aria-busy');
      else pendingNode.setAttribute('aria-busy',pendingBusy);
      pendingNode.style.removeProperty('--breeze-lookup-ink');
      pendingNode.style.removeProperty('--breeze-lookup-paper');
    }
    pendingNode=null;pendingBusy=null;
  }
  function cue(node,pending){
    if(!pending||!node){clearCue();return;}
    if(pendingNode===node)return;
    clearCue();ensureStyle(node.ownerDocument||document);
    // EPUB documents do not inherit the app's tokens. Copy only the two material
    // colors to this owned marker, never modify the publisher's page or typography.
    const palette=getComputedStyle(document.body);
    node.style.setProperty('--breeze-lookup-ink',palette.getPropertyValue('--sentence-glass-ink'));
    node.style.setProperty('--breeze-lookup-paper',palette.getPropertyValue('--sentence-glass-solid'));
    pendingNode=node;pendingBusy=node.getAttribute('aria-busy');
    node.setAttribute('aria-busy','true');node.classList.add('breeze-lookup-pending');
    announce('뜻 찾는 중');
  }
  function complete(outcome){
    if(!active||active.row)return;
    active.row={kind:'lookup',format:active.format,outcome,latencyMs:elapsed(active.start),
      hadPending:active.hadPending,repeatTaps:active.repeatTaps,
      pendingRepeatTaps:active.pendingRepeatTaps,switchedWhilePending:active.switchedWhilePending,
      source:active.source};
    append(active.row);
  }
  function end(life){
    if(active&&active.life===life){complete('dismissed');active=null;}
    clearCue();if(status)status.textContent='';
  }
  const api={
    start(life,surface){
      active={life,format:format(surface),start:now(),hadPending:false,pending:true,
        repeatTaps:0,pendingRepeatTaps:0,switchedWhilePending:false,source:'saved_or_cache',row:null};
    },
    repeat(life){
      if(!active||active.life!==life)return;
      active.repeatTaps++;if(active.pending)active.pendingRepeatTaps++;
      if(active.row){active.row.repeatTaps=active.repeatTaps;active.row.pendingRepeatTaps=active.pendingRepeatTaps;}
    },
    switchTarget(life){
      if(active&&active.life===life&&active.pending)active.switchedWhilePending=true;
    },
    present(life,node,state,successful){
      cue(node,state.loading);
      if(active&&active.life===life){
        active.pending=!!state.loading;active.hadPending ||= active.pending;
        if(!state.loading)complete(successful?'ready':'failure');
      }
      if(!state.loading)announce(successful?'뜻: '+state.text:state.text);
    },
    request(life,surface){
      if(active&&active.life===life)active.source='ai';
      return {start:now(),format:format(surface)};
    },
    response(ticket,outcome){
      if(ticket)append({kind:'request',format:ticket.format,outcome,latencyMs:elapsed(ticket.start)});
    },
    source(life,source){
      if(active&&active.life===life&&source==='reviewed_local')active.source=source;
    },
    end,
    summary(){
      const lookups=rows.filter(row=>row.kind==='lookup'),ready=lookups.filter(row=>row.outcome==='ready');
      const pending=lookups.filter(row=>row.hadPending),requests=rows.filter(row=>row.kind==='request');
      const repeats=lookups.reduce((n,row)=>n+row.repeatTaps,0);
      const percentile=(items,p)=>{
        const values=items.map(row=>row.latencyMs).sort((a,b)=>a-b);
        return values.length?values[Math.ceil(values.length*p)-1]:null;
      };
      return {scope:'in-memory, current app session, last 240 events',
        lookupCount:lookups.length,readyCount:ready.length,
        failureCount:lookups.filter(row=>row.outcome==='failure').length,
        dismissedCount:lookups.filter(row=>row.outcome==='dismissed').length,
        readyP50Ms:percentile(ready,.5),readyP95Ms:percentile(ready,.95),
        requestCount:requests.length,requestP50Ms:percentile(requests,.5),requestP95Ms:percentile(requests,.95),
        repeatTapRate:lookups.length?repeats/(lookups.length+repeats):null,
        pendingSwitchRate:pending.length?pending.filter(row=>row.switchedWhilePending).length/pending.length:null,
        active:!!active&&!active.row,events:rows.map(row=>({...row}))};
    },
    reset(){
      rows.length=0;
      if(active){active.row=null;active.start=now();active.repeatTaps=0;active.pendingRepeatTaps=0;
        active.switchedWhilePending=false;active.hadPending=active.pending;}
    }
  };
  Reflect.set(window,'breezeLookupSummary',()=>api.summary());
  Reflect.set(window,'breezeLookupReset',()=>api.reset());
  return api;
})();
