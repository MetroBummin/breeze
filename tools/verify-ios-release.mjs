import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const project=readFileSync(new URL('../ios/App/App.xcodeproj/project.pbxproj',import.meta.url),'utf8');
const builds=[...project.matchAll(/CURRENT_PROJECT_VERSION = (\d+);/g)].map(m=>m[1]);
const versions=[...project.matchAll(/MARKETING_VERSION = ([\d.]+);/g)].map(m=>m[1]);
assert.deepEqual(builds,['221','221','221','221'],'App and extension Debug/Release must be build 221');
assert.deepEqual(versions,['1.7','1.7','1.7','1.7']);
console.log('Breeze and Share Extension: 1.7 (221)');
