import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
const c=vm.createContext({Map,WeakMap,console});vm.runInContext(readFileSync(new URL('../scripts/ui/smart-crop.js',import.meta.url),'utf8'),c);
test('edge face is retained instead of clamped toward centre',()=>{const p=c.homeCropPosition([{x:0,y:100,width:100,height:100}],1200,800,.75);assert.equal(p.x,0);assert.equal(p.fit,'cover');});
test('right edge face is retained',()=>{const p=c.homeCropPosition([{x:1100,y:100,width:100,height:100}],1200,800,.75);assert.equal(p.x,1);});
test('unfittable multiple faces use contain instead of silently cropping one',()=>{const p=c.homeCropPosition([{x:0,y:0,width:100,height:100},{x:1100,y:0,width:100,height:100}],1200,800,.75);assert.equal(p.fit,'contain');});
test('invalid source geometry safely produces no hint',()=>{assert.equal(c.homeCropPosition([],1200,800,.75),null);assert.equal(c.homeCropPosition([{x:NaN,y:0,width:2,height:2}],1200,800,.75),null);});
