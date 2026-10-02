"""Report real outcomes; the supplied notes are not a human gold dataset."""
import json,pathlib,sys,collections
rows=json.loads(pathlib.Path(sys.argv[1]).read_text())
assert len(rows)==106 and len({r['url'] for r in rows})==106
mapping={'approved':'pass','rejected':'reject','uncertain':'pending','running':'pending','queued':'pending','pending':'pending','error':'error'}
def counts(items):
    c={s:0 for s in ['pass','reject','pending','error']}
    for row in items:c[mapping[row['status']]]+=1
    return c
sources={source:counts([r for r in rows if r['source']==source]) for source in sorted({r['source'] for r in rows})}
totals=counts(rows)
live=[r['result'] for r in rows if (r.get('result') or {}).get('mode')=='live']
input_tokens=sum(r['usage']['inputTokens'] for r in live)
output_tokens=sum(r['usage']['outputTokens'] for r in live)
unknown=sum(1 for r in rows if (r.get('result') or {}).get('mode')=='attempted')
paid_attempts=len(live)+unknown
report={'inputCount':106,'exactUniqueUrls':106,'humanGoldCount':0,'totals':totals,'sources':sources,
 'decidedRetentionRate':totals['pass']/(totals['pass']+totals['reject']),
 'allInputRetentionRate':totals['pass']/106,'falseRejectionRate':None,'qualityImprovementRate':None,
 'emptyApprovedSources':[s for s,c in sources.items() if c['pass']==0],
 'paidAttempts':paid_attempts,'validModelResults':len(live),'usageMissingAttempts':unknown,
 'knownUsage':{'inputTokens':input_tokens,'outputTokens':output_tokens},
 'costUSD':{'knownInputEstimate':input_tokens*.042/1e6,'upperBoundIncludingMissingUsage':(input_tokens+unknown*64000)*.042/1e6,'approvedCap':.30,'isProviderInvoice':False},
 'splitCounts':{s:counts([r for r in rows if r['split']==s]) for s in ['review','holdout']}}
pathlib.Path(sys.argv[2]).write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
