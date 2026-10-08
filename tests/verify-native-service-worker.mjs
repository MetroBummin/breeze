import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../scripts/main.js',import.meta.url),'utf8');
for(const [name,protocol,native,expected,overlay=false] of [
 ['web','https:',false,1],['android local https','https:',true,0],['ios','capacitor:',true,0],
 ['web passive onboarding','https:',false,1,true],['android passive onboarding','https:',true,0,true],
]){
 const calls=[],events=new Map();let rendered=0;
 const context={
   window:{Capacitor:{isNativePlatform:()=>native},addEventListener:(name,callback)=>events.set(name,callback)},
   navigator:{serviceWorker:{register:async(...args)=>{calls.push(args);}}},location:{protocol},console,
   syncHomeNavigation(){},loadBooks:async()=>{},migrateLibraryFolders(){},maybeShowOnboarding:async()=>{},
   onboardingSession:overlay?{}:null,onboardingOwnsReader:()=>false,renderHome(){rendered++;},startSharedFileImports(){},restoreMissingLongReadCovers(){},
   document:{documentElement:{classList:{remove(){}}}},
 };
 vm.createContext(context);vm.runInContext(source+';globalThis.ready=homeReady;',context);await context.ready;
 events.get('load')?.();await Promise.resolve();assert.equal(calls.length,expected,name);
 assert.equal(rendered,overlay?0:1,name+' preserves passive-overlay Home guard');
 if(expected)assert.equal(calls[0][0],'sw.js');
}
console.log('Web service worker registration retained; Android/iOS native bundles skip it');
