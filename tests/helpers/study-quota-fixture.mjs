import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
export const root=resolve(import.meta.dirname,'../..');
export const source=path=>readFileSync(resolve(root,path),'utf8');
const lookup={};vm.runInNewContext(source('assets/longreads/homeward-lookup-data.js'),lookup);
const collect=(value,out=[])=>{if(value&&typeof value==='object'){if(value.ko&&value.sentence&&value.canonical)out.push(value);else for(const child of Object.values(value))collect(child,out);}return out;};
const samples=collect(lookup.HOMEWARD_LOOKUP_DATA);
const lexemes=[...new Set(source('assets/longreads/hound-of-the-baskervilles.txt').toLowerCase().match(/[a-z]+(?:'[a-z]+)?/g))].filter(w=>w.length>=3);
export function vocabulary(size=5000){
 const words={};
 for(let i=0;i<size;i++){
  const sample=samples[i%samples.length],word=lexemes[i%lexemes.length]+(i>=lexemes.length?` sense ${Math.floor(i/lexemes.length)+1}`:'');
  // Synthetic identity pairs; real corpus lengths, Korean meanings and sentence sizes.
  // These are test data, not a semantically translated dictionary or a user export.
  const key=`${word.replace(/ /g,'_')}_${String(i).padStart(5,'0')}`;
  words[key]={word,ko:sample.ko,example:sample.sentence,book:`Reading ${Math.floor(i/100)+1}`,status:i%3+1,mark:true,addedAt:1750000000000+i,up:1750000000000+i};
 }
 return words;
}
export function engines(){const box={};vm.createContext(box);vm.runInContext(source('scripts/core/study-sets.js')+'\nglobalThis.sets=BreezeStudySets;',box);const simple=source('scripts/ui/vocabulary-review.js');vm.runInContext(simple.slice(simple.indexOf('const SimpleStudySession='),simple.indexOf('const SIMPLE_STUDY_STORAGE='))+'\nglobalThis.simple=SimpleStudySession;',box);return box;}
export const keySets='breeze.study-sets.v1',keySimple='breeze.simple-study-session.v1';
