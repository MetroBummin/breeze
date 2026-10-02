"""Run the approved fixed cohort; credentials are read from a private local file.
No retries on POST: recover an uncertain client response only with a read-only GET.
"""
import argparse, concurrent.futures, json, pathlib, urllib.request, urllib.error
parser=argparse.ArgumentParser()
parser.add_argument('--token-file',required=True);parser.add_argument('--out',required=True)
args=parser.parse_args();token=pathlib.Path(args.token_file).read_text().strip()
cohort=json.loads(pathlib.Path(__file__).with_name('cohort.json').read_text())
out=pathlib.Path(args.out);out.mkdir(parents=True,exist_ok=True)
def request(id,method):
    url='https://hrtfhojbhqvaoiulspto.supabase.co/functions/v1/rss-eval-106?id='+id
    req=urllib.request.Request(url,method=method,headers={'Authorization':'Bearer '+token})
    with urllib.request.urlopen(req,timeout=90) as response:return json.load(response)
def run(row):
    path=out/(row['id']+'.json')
    if path.exists():return json.loads(path.read_text())
    try:
        response=request(row['id'],'POST')
    except Exception:
        try:response=request(row['id'],'GET')
        except Exception:response={'id':row['id'],'status':'pending','error':'transport_unavailable'}
    result={**row,**response}
    path.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    return result
# Verify configured key name and table availability before spending any work slot.
request('RSS-001','GET')
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for index,result in enumerate(pool.map(run,cohort),1):
        print(index,result['id'],result.get('status'),flush=True)
rows=[json.loads((out/(row['id']+'.json')).read_text()) for row in cohort]
(out/'results.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n')
