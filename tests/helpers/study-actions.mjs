// Playwright dispatch completes before an IndexedDB transaction does. Await the
// app's pending read/write and card-exit owners before inspecting committed UI.
export async function studyAction(action,page){
 const result=await action;
 await page.waitForFunction(()=>!studySetsUI.mutating&&!studySetsUI.pendingClose&&studySetsUI.body?.getAttribute('aria-busy')!=='true'&&!simpleStudyBusy&&!document.querySelector('#study-sets-flashcard[data-direction]'));
 return result;
}
