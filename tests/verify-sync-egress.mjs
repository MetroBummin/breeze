import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {WORD,VAULT,PROGRESS,server,device,word,book,pos} from './sync-test-transport.mjs';

const root=resolve(fileURLToPath(new URL('..',import.meta.url)));
const sync=readFileSync(resolve(root,'scripts/sync/sync.js'),'utf8');
assert.match(sync,/compareAndSwapSyncRow\(WORDBOOK_ROW,previous,data,session\)/);
assert.match(sync,/query\.select\('key'\)\.maybeSingle\(\)/);
assert.doesNotMatch(sync,/from\('(?:words|books|positions)'\)\.delete\(\)/);
assert.match(sync,/function queueReadingProgressSync\(\)\{[\s\S]*?Reading locations are local/);

const items=[{id:'old-book',identity:'old-book',title:'Existing encrypted metadata',position:pos(.7,400).position}];
const db=server({items,progress:{'old-book':pos(.8,500)}});
const client=device(db,'phone',{words:{newWord:word(300)},books:[book('local-book')],dirty:300});
assert.equal(await client.api.all(false),true);
assert.ok(db.calls.every(call=>call.table==='words'&&call.key!==PROGRESS));
assert.deepEqual(db.peek(VAULT).envelope.payload.items,items,'Existing book metadata changed');
assert.deepEqual(db.peek(PROGRESS).envelope.payload.records,{'old-book':pos(.8,500)},'Reading progress changed');
assert.equal(db.peek(WORD).words.newWord.up,300);
assert.match(sync,/책과 읽던 위치는 각 기기에 남습니다/);
assert.doesNotMatch(sync,/onclick="exportReadingBackup\(\)"/);

console.log('Wordbook-only egress and dormant-data checks passed');
