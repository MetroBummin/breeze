// Paired URL reporting only: never reinterpret v1 answers as v2 model judgments.
const normalize=row=>({...row,...(row.result || {}),url:row.url,source:row.source});
export function unresolvedCause(row){
  if(!row)return 'not_run';
  if(row.status==='error' || row.status==='unavailable')return row.diagnostic?.code==='invalid_evaluation' && row.diagnostic.detail
    ? `invalid_evaluation:${row.diagnostic.detail}` : row.diagnostic?.code || row.error || row.reason?.[0] || 'unknown_error';
  if(row.status==='pending')return 'not_evaluated';
  if(row.status!=='uncertain')return null;
  const a=row.answers;
  if(!a)return row.reason?.[0] || 'unknown_uncertainty';
  const blocked=['promotion','extraction','readability','mismatch'].some(k=>a[k]?.choice==='yes' && a[k].confidence>=.75);
  if(blocked && (!row.evidence || a.evidence?.confidence<.5))return 'evidence_confidence';
  for(const key of ['extraction','promotion','readability','mismatch'])if(a[key] && (a[key].confidence<.75 || a[key].choice==='uncertain'))return key+'_confidence';
  return 'unknown_uncertainty';
}
export function pairedReport(reference,baseline,next=[]){
  const urls=new Set(reference.map(r=>r.url));
  if(urls.size!==reference.length)throw Error('duplicate_reference');
  const index=rows=>{const m=new Map();for(const raw of rows){const r=normalize(raw);if(!urls.has(r.url)||m.has(r.url))throw Error('unpaired_result');m.set(r.url,r);}return m;};
  const before=index(baseline),after=index(next),sources={},pairs=[];
  const empty=()=>({pass:0,reject:0,pending:0,error:0,unmeasured:0,usable:0,approved:0,candidates:0,unresolvedCauses:{}});
  const totals={baseline:empty(),redesign:empty()};
  function count(target,row){
    const state=!row?'unmeasured':row.status==='approved'?'pass':row.status==='rejected'?'reject':['uncertain','pending'].includes(row.status)?'pending':['error','unavailable'].includes(row.status)?'error':null;
    if(!state)throw Error('invalid_status');target[state]++;
    if(state==='pass'){target.approved++;target.usable++;}
    if(row?.status==='uncertain' && row.eligibility==='candidate'){target.candidates++;target.usable++;}
    const cause=unresolvedCause(row);if(cause)target.unresolvedCauses[cause]=(target.unresolvedCauses[cause]||0)+1;
  }
  for(const ref of reference){
    const a=before.get(ref.url),b=after.get(ref.url),source=sources[ref.source] ||= {baseline:empty(),redesign:empty()};
    for(const [side,row] of [['baseline',a],['redesign',b]]){count(totals[side],row);count(source[side],row);}
    const exclusion=row=>row?.status==='rejected'?{reason:row.reason,evidence:row.evidence,contentKey:row.contentKey || row.key,version:row.version}:null;
    pairs.push({id:ref.id,url:ref.url,source:ref.source,baseline:a?.status || 'not_run',redesign:b?.status || 'not_run',baselineCause:unresolvedCause(a),redesignCause:unresolvedCause(b),baselineExclusion:exclusion(a),redesignExclusion:exclusion(b)});
  }
  return {referenceCount:reference.length,totals,sources,pairs,accuracy:null,falseRejectionRate:null,qualityImprovement:null,
    limitations:['No independent gold labels; browser observations are not ground truth.','Usable is approved plus explicitly marked shadow candidates, not all pending or failed rows.','Different content keys or fetch times are not a controlled same-snapshot comparison.','No v1 answer is a v2 evaluation.']};
}
