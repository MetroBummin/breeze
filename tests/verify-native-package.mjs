/* Run after npm run www. Preserve source assets while asserting what ships. */
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'www');
for(const path of ['scripts/vendor/ts-fsrs-5.4.2.js','scripts/core/vocabulary-review.js','assets/brand/review','assets/brand/thunderhead-round.png','modules/exam-shorts','modules/dict-seed']){
 assert(existsSync(resolve(root,path)),'source must remain: '+path);
 assert(!existsSync(resolve(out,path)),'parked resource must not ship: '+path);
}
const html=readFileSync(resolve(out,'index.html'),'utf8');
for(const match of html.matchAll(/<(?:script|link)\b[^>]*?\b(?:src|href)="(?!https?:|\/\/|data:|#)([^"]+)"/g)){
 assert(existsSync(resolve(out,match[1].split('?')[0])),'missing entry dependency '+match[1]);
}
for(const path of ['assets/lib/readability-0.6.0.js','assets/longreads/homeward-lookup-data.js','scripts/reader/frame-trace.js','assets/classics/alice-in-wonderland.epub']){
 assert(existsSync(resolve(out,path)),'required offline/deferred resource missing: '+path);
}
for(const dir of ['assets/longreads','assets/brand/wordmarks']){
 for(const name of readdirSync(resolve(root,dir)).filter(name=>dir.includes('longreads')||!name.endsWith('.png'))){
  assert(existsSync(resolve(out,dir,name)),'approved content/brand missing: '+dir+'/'+name);
 }
}
console.log('Native package: dormant resources excluded; source, live entry dependencies, deferred code and approved content retained.');
