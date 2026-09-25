import pathlib, os
ROOT=pathlib.Path(os.environ['GITHUB_WORKSPACE'])/'candidate'
def patch(name,old,new,count=1):
 p=ROOT/name;s=p.read_text();assert s.count(old)==count,(name,old[:60],s.count(old));p.write_text(s.replace(old,new))
patch('server/article/safe-fetch.mjs','fetchPublicArticle(raw,{signal,asImage=false','fetchPublicArticle(raw,{signal=undefined,asImage=false')
patch('tests/verify-library-refresh-browser.mjs',"'#casuals .section-link'","'#home-casuals .section-link'")
for entry in ('redditLinkEntry','redditSelfEntry','xEntry'):
 old=f'await page.evaluate(async entry=>importRssEntry(entry,rssCard(entry)),{entry});'
 patch('tests/verify-ingestion-browser.mjs',old,old+"\n   await page.waitForFunction(()=>document.querySelector('#article-preview').open);\n   await page.locator('.ap-start:not([disabled])').click();")
patch('tests/verify-article-preview-browser.mjs',"const box=await page.locator('#article-preview').boundingBox();", "await page.locator('#article-preview').evaluate(async node=>{await Promise.all(node.getAnimations({subtree:true}).map(animation=>animation.finished.catch(()=>{})));});\n        const box=await page.locator('#article-preview').boundingBox();")
patch('tests/verify-article-preview-browser.mjs',"'preview is centered'", "`preview is centered (${engine.name()} ${width}x${height}: ${JSON.stringify(box)})`")
patch('tests/verify-audit-browser.mjs',"const result=await page.evaluate(async()=>{", "const result=await page.evaluate(async()=>{\n    let stage='seed';try{")
patch('tests/verify-audit-browser.mjs',"await bookPut(a);await bookPut(b);await imgPut('shared',new Blob(['shared'],{type:'image/png'}));await imgPut('own',new Blob(['own'],{type:'image/png'}));await originalPut(a.id,{hash:'aaa',blob:new Blob(['pdf'])});", "stage='book a';await bookPut(a);stage='book b';await bookPut(b);stage='image shared';await imgPut('shared',new Blob(['shared'],{type:'image/png'}));stage='image own';await imgPut('own',new Blob(['own'],{type:'image/png'}));stage='original blob';await originalPut(a.id,{hash:'aaa',blob:new Blob(['pdf'])});")
for old,label in [("const abortPreserved=",'abort-preserve'),("await deleteBookAssets(a.id,'remote-a');",'atomic-delete'),("await finishBookDeletion({id:a.id,remoteId:'remote-a'});",'journal'),("await assetWrite('imgs','bytes'",'backup-bytes'),("bookAll=originalRead;await loadBooks();",'retry-load')]:
 patch('tests/verify-audit-browser.mjs',old,"stage='"+label+"';"+old)
patch('tests/verify-audit-browser.mjs',"return {aborted,abortPreserved,failure,failedPreserved,deleted,sharedPreserved,journal,hidden,cleared,bytesExport,readPreserved,errorShown,retryCleared};", "return {aborted,abortPreserved,failure,failedPreserved,deleted,sharedPreserved,journal,hidden,cleared,bytesExport,readPreserved,errorShown,retryCleared};\n    }catch(error){throw new Error('Storage probe at '+stage+': '+error.message);}")
print('Applied integrated routing/animation test contracts, stage diagnostics and Deno option type.')
