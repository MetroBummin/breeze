"""Run verified full candidate tests and publish only immutable tree objects."""
from pathlib import Path
import os, sys, runpy
base=Path(__file__).with_name('base.py').read_text()
base=base.replace("{'prepare': prepare, 'verify': verify, 'publish': publish_tree}[sys.argv[1]]()",'')
exec(compile(base,str(Path(__file__).with_name('base.py')),'exec'))
if sys.argv[1]=='prepare':
    prepare()
    runpy.run_path(str(Path(__file__).with_name('followup.py')))
    runpy.run_path(str(Path(__file__).with_name('final-fix.py')))
elif sys.argv[1]=='verify':
    verify()
elif sys.argv[1]=='publish':
    doc=manifest(); target=doc['targets'][TARGET]
    assert git('ls-remote','origin','refs/heads/'+target['branch']).decode().split()[0]==target['expected']
    git('add','-A')
    names=filter(None,git('diff','--cached','--name-only','-z',doc['source']).decode().split('\0'))
    entries=[]
    for name in names:
        if name.startswith('.github/workflows/'):
            continue # connector overlays the reviewed CI workflow
        path=valid_path(name)
        if not path.exists():
            entries.append({'path':name,'mode':'100644','type':'blob','sha':None});continue
        assert path.suffix not in ('.woff','.woff2','.ttf','.otf')
        data=path.read_bytes();assert len(data)<2000000
        entries.append({'path':name,'mode':'100755' if os.access(path,os.X_OK) else '100644','type':'blob','content':data.decode()})
    body={'base_tree':git('rev-parse',doc['source']+'^{tree}').decode().strip(),'tree':entries}
    (OUT/'tree-input.json').write_text(json.dumps(body))
    process=subprocess.run(['gh','api','--method','POST','repos/MetroBummin/breeze/git/trees','--input','-'],input=json.dumps(body),text=True,capture_output=True)
    (OUT/'publish.log').write_text(process.stdout+'\n'+process.stderr)
    if process.returncode:
        print(process.stdout,process.stderr);raise SystemExit(process.returncode)
    tests=json.loads((OUT/'tests.json').read_text())
    result={'target':TARGET,'tree':json.loads(process.stdout)['sha'],'branch':target['branch'],'expectedHead':target['expected'],'allPassed':all(t['exitCode']==0 for t in tests),'tests':tests,'workflowOverlayRequired':True,'diagnosticPass':False}
    (OUT/'result.json').write_text(json.dumps(result,indent=2))
    print(json.dumps({k:v for k,v in result.items() if k!='tests'}))
    if not result['allPassed']:raise SystemExit(1)
