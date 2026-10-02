// Offline reporting only. Reference labels are never sent to Jev.
export function qualityReport(reference,results){
  const byUrl=new Map();
  for(const row of results){if(byUrl.has(row.url))throw new Error('duplicate result');byUrl.set(row.url,row);}
  if(new Set(reference.map(row=>row.url)).size!==reference.length)throw new Error('duplicate reference');
  const statuses=['approved','rejected','uncertain','pending','error'];
  const sources={},topics={},lengths={short:0,medium:0,long:0,unknown:0};
  const totals=Object.fromEntries([...statuses,'unmeasured'].map(x=>[x,0]));
  let positives=0,falseRejections=0,positiveApprovals=0,positiveUnresolved=0,negatives=0,negativeRejections=0,negativeApprovals=0;
  let inputTokens=0,outputTokens=0,usageMissing=0;
  for(const row of reference){
    const result=byUrl.get(row.url),status=result?.status || 'unmeasured';
    if(![...statuses,'unmeasured'].includes(status))throw new Error('invalid result status');
    totals[status]++;const source=sources[row.source] ||= {before:0,...Object.fromEntries([...statuses,'unmeasured'].map(x=>[x,0]))};source.before++;source[status]++;
    if(row.label==='positive'){positives++;if(status==='rejected')falseRejections++;else if(status==='approved')positiveApprovals++;else positiveUnresolved++;}
    if(row.label==='negative'){negatives++;if(status==='rejected')negativeRejections++;if(status==='approved')negativeApprovals++;}
    if(status==='approved'){
      const topic=result.metadata?.topic || 'unknown';topics[topic]=(topics[topic] || 0)+1;
      const words=result.metadata?.words;lengths[!Number.isFinite(words)?'unknown':words<600?'short':words<1800?'medium':'long']++;
    }
    if(result?.usage && Number.isSafeInteger(result.usage.inputTokens) && Number.isSafeInteger(result.usage.outputTokens)){
      inputTokens+=result.usage.inputTokens;outputTokens+=result.usage.outputTokens;
    }else if(result && !['pending','error'].includes(status))usageMissing++;
  }
  return {referenceCount:reference.length,measuredCount:reference.length-totals.unmeasured,totals,sources,
    quality:{positives,positiveApprovals,falseRejections,positiveUnresolved,negatives,negativeRejections,negativeApprovals},
    availability:{approved:totals.approved,unresolved:totals.uncertain+totals.pending+totals.error,unmeasured:totals.unmeasured,
      emptyMeasuredSources:Object.entries(sources).filter(([,s])=>s.unmeasured===0 && s.approved===0).map(([name])=>name)},
    approvedDiversity:{topics,lengths},usage:{inputTokens,outputTokens,usageMissing},
    // Do not report percentages over an incomplete/non-live cohort as an improvement.
    improvementMeasured:totals.unmeasured===0 && results.every(row=>row.mode==='live')};
}
