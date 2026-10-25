// Playwright gives page.evaluate and locator.evaluate no timeout. A promise
// that never settles, including a lazy img.decode(), holds the process until
// the CI job is killed. Bound those calls and exit if one still does not return.
import {chromium as chromiumEngine,webkit as webkitEngine,firefox as firefoxEngine,devices} from 'playwright';
export {devices};
export const stepMs=20000;
const boundProtos=new WeakSet();
export function step(label,work,ms=stepMs){
 let timer;
 const timeout=new Promise((_,reject)=>{
  timer=setTimeout(()=>{
   console.error(`step timed out after ${ms}ms: ${label}`);
   setTimeout(()=>process.exit(1),250);
   reject(Error(`step timed out after ${ms}ms: ${label}`));
  },ms);
 });
 return Promise.race([Promise.resolve().then(work),timeout]).finally(()=>clearTimeout(timer));
}
function snippet(fn){
 const text=typeof fn==='function'?fn.toString():String(fn??'');
 return text.replace(/\s+/g,' ').slice(0,80);
}
function boundMethod(proto,method){
 if(!proto||proto['__breezeBound_'+method])return;
 const original=proto[method];
 if(typeof original!=='function')return;
 proto[method]=function(...args){
  return step(`${method} ${snippet(args[0])}`,()=>original.apply(this,args));
 };
 proto['__breezeBound_'+method]=true;
 boundProtos.add(proto);
}
function boundPage(page){
 if(!page)return page;
 if(page.__breezeBound)return page;
 page.__breezeBound=true;
 page.setDefaultTimeout(stepMs);
 page.setDefaultNavigationTimeout(stepMs);
 boundMethod(Object.getPrototypeOf(page),'evaluate');
 boundMethod(Object.getPrototypeOf(page),'evaluateHandle');
 const frame=page.mainFrame?.();
 if(frame){
  boundMethod(Object.getPrototypeOf(frame),'evaluate');
  boundMethod(Object.getPrototypeOf(frame),'evaluateHandle');
 }
 const locator=Object.getPrototypeOf(page.locator('html'));
 boundMethod(locator,'evaluate');
 boundMethod(locator,'evaluateHandle');
 // Bound element-handle evaluate when a test asks for one. Do not query the
 // document here: that runs before the caller's init scripts.
 if(!locator.__breezeElementHandle){
  const original=locator.elementHandle;
  if(typeof original==='function'){
   locator.elementHandle=async function(...args){
    const handle=await original.apply(this,args);
    if(handle){
     const proto=Object.getPrototypeOf(handle);
     boundMethod(proto,'evaluate');
     boundMethod(proto,'evaluateHandle');
    }
    return handle;
   };
   locator.__breezeElementHandle=true;
  }
 }
 return page;
}
function boundContext(context){
 const open=context.newPage.bind(context);
 context.newPage=async(...args)=>boundPage(await open(...args));
 const bind=page=>{void Promise.resolve(boundPage(page)).catch(()=>{});};
 context.on('page',bind);
 for(const page of context.pages())bind(page);
 return context;
}
function boundBrowser(browser){
 const openContext=browser.newContext.bind(browser);
 browser.newContext=async(...args)=>boundContext(await openContext(...args));
 const openPage=browser.newPage.bind(browser);
 browser.newPage=async(...args)=>boundPage(await openPage(...args));
 return browser;
}
function boundEngine(engine){
 return new Proxy(engine,{
  get(target,prop,receiver){
   if(prop==='launch')return async(...args)=>boundBrowser(await target.launch(...args));
   if(prop==='launchPersistentContext')return async(...args)=>boundContext(await target.launchPersistentContext(...args));
   const value=Reflect.get(target,prop,receiver);
   return typeof value==='function'?value.bind(target):value;
  },
 });
}
export const chromium=boundEngine(chromiumEngine);
export const webkit=boundEngine(webkitEngine);
export const firefox=boundEngine(firefoxEngine);
// A lazy illustration outside the viewport never starts its fetch, so decode()
// waits forever. Reload that element in place, then decode it.
export function decodeImage(locator){
 return locator.evaluate(img=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(Error('illustration decode never settled')),8000);
  const fail=error=>{clearTimeout(timer);reject(error instanceof Error?error:Error(String(error&&error.message||error)));};
  const finish=()=>img.decode().then(()=>{clearTimeout(timer);resolve();},error=>{
   // Chromium rejects decode() when a lazy image's src is still settling.
   if(error&&error.name==='EncodingError'&&!(img.complete&&img.naturalWidth)){
    img.addEventListener('load',()=>img.decode().then(()=>{clearTimeout(timer);resolve();},fail),{once:true});
    return;
   }
   fail(error);
  });
  if(img.complete&&img.naturalWidth){finish();return;}
  img.loading='eager';
  img.addEventListener('load',finish,{once:true});
  img.addEventListener('error',()=>fail(Error('illustration failed to load')),{once:true});
  const src=img.getAttribute('src');
  if(!src){fail(Error('illustration has no src'));return;}
  const next=src.split('?')[0]+'?eager=1';
  if(src===next){finish();return;}
  img.src=next;
 }));
}
