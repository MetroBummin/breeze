import test from 'node:test';
import assert from 'node:assert/strict';
import {appFamilyScenes,assertAppFamilyScene} from './helpers/app-icon-family-scenes.mjs';
const pageWith=counts=>({locator:selector=>({count:async()=>counts[selector]||0})});
const scenePage=scene=>Object.fromEntries(appFamilyScenes[scene].visible.map(s=>[s+':visible',1]));
test('folder scene rejects the previously silently omitted management summary',async()=>{
 const counts=scenePage('folders');delete counts['#v-longform .library-folder-menu>summary:visible'];
 await assert.rejects(assertAppFamilyScene(pageWith(counts),'folders'),/requires exactly one visible .*summary/);
});
test('a closed-menu capture cannot substitute for the required open-menu scene',async()=>{
 const counts=scenePage('folders-open');delete counts['#v-longform .library-folder-actions:visible'];
 await assert.rejects(assertAppFamilyScene(pageWith(counts),'folders-open'),/requires exactly one visible .*actions/);
});
test('directory back is explicitly hidden and unexpected controls fail',async()=>{
 const counts=scenePage('study-directory');assert.ok(await assertAppFamilyScene(pageWith(counts),'study-directory'));
 counts['#study-sets-back:visible']=1;
 await assert.rejects(assertAppFamilyScene(pageWith(counts),'study-directory'),/requires hidden #study-sets-back/);
});
test('front rejects a prematurely visible answer and duplicate reveal targets',async()=>{
 const counts=scenePage('study-front');counts['#study-sets-answer:visible']=1;
 await assert.rejects(assertAppFamilyScene(pageWith(counts),'study-front'),/requires hidden #study-sets-answer/);
 counts['#study-sets-answer:visible']=0;counts['#study-sets-reveal:visible']=2;
 await assert.rejects(assertAppFamilyScene(pageWith(counts),'study-front'),/requires exactly one visible #study-sets-reveal/);
});
