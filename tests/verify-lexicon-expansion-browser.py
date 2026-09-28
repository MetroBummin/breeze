#!/usr/bin/env python3
"""Standalone local-pack UI only, not Breeze Reader/AI/device QA."""
import functools,http.server,json,threading,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
results=[]
try:
 with sync_playwright() as p:
  for name in ['chromium','webkit']:
   browser=None
   try:
    launch={'headless':True}
    if name=='chromium' and shutil.which('chromium'):launch['executable_path']=shutil.which('chromium')
    browser=getattr(p,name).launch(**launch)
    page=browser.new_page();errors=[];network=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('request',lambda r:network.append(r.url))
    page.goto(f'http://127.0.0.1:{server.server_port}/experiments/lightning-expanded/',wait_until='networkidle',timeout=10000)
    page.locator('#load').click();page.wait_for_function("document.querySelector('#status').textContent.includes('12,398')",timeout=10000)
    page.locator('#experimental').check();page.locator('#load').click()
    page.wait_for_function("document.querySelector('#status').textContent.includes('40,000')",timeout=10000)
    # 50 unique source-backed words chosen from all packs, through actual UI buttons.
    manifest=json.loads((ROOT/'assets/dictionaries/en-ko-expansion/manifest.json').read_text())
    paths=[ROOT/'assets/dictionaries/en-ko-10k/dictionary.json']+[ROOT/'assets/dictionaries/en-ko-expansion'/x['file'] for x in manifest['packs']]
    words=[]
    for i,path in enumerate(paths):
     entries=json.loads(path.read_text())['entries'];selected=list(entries)[100:100+(20 if i==3 else 10)]
     words.extend(selected)
    before=len(network)
    for w in words:
     page.locator('#input').fill(w);page.locator('#render').click();page.locator('.word').click()
     assert page.locator('#result').get_attribute('data-pack'),w
     assert page.locator('#source a').get_attribute('href').startswith('https://'),w
    assert len(network)==before,'Network requests during taps'
    assert not errors,errors
    page.screenshot(path=str(ROOT/'test-results'/f'expansion-{name}.png'),full_page=True)
    results.append({'browser':name,'passed':True,'uiTaps':len(words),'tapNetworkRequests':len(network)-before})
   except Exception as e:
    results.append({'browser':name,'passed':False,'error':str(e)[:1200]})
   finally:
    if browser:browser.close()
finally:server.shutdown()
report={'scope':'Standalone lexicon demo; no Reader/AI/physical-device test','results':results}
(ROOT/'test-results/expansion-browser.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(report,ensure_ascii=False,indent=2))
