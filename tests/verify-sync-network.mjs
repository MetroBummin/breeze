import assert from 'node:assert/strict';
import {VAULT,META,PROGRESS,server,device,word,book,pos} from './sync-test-transport.mjs';

// Exercise the real sync functions; return serialized database snapshots, not
// references to fixtures. The safety suite additionally delays competing calls.
{
  const db=server(),client=device(db,'unchanged',{seen:'base'});
  assert.equal(await client.api.vault(false),true);
  assert.deepEqual(db.calls.map(call=>call.key),[META,VAULT]);
  assert.equal(db.calls[1].columns,'revision:data->>revision,updatedAt:data->updatedAt,sync:data->sync');
  assert.equal(db.calls.some(call=>call.key===VAULT&&call.columns==='data'),false);
}
{
  const db=server(),client=device(db,'word',{words:{saved:word(200)},dirty:200});
  assert.equal(await client.api.vault(false),true);
  assert.deepEqual(db.calls.map(call=>call.kind+':'+call.key),[
    'select:'+META,'select:'+VAULT,'select:'+VAULT,'update:'+VAULT
  ]);
  assert.equal(db.calls[1].columns.includes('envelope'),false);
  assert.equal(db.calls[2].columns,'data');
  assert.equal(db.calls[3].columns,'key','CAS echoed the large vault instead of a key');
}
{
  const db=server(),client=device(db,'progress',{books:[book('book')],positions:{book:pos(.5,300).position},progressDirty:300});
  assert.equal(await client.api.progress(false,false),true);
  assert.deepEqual(db.calls.map(call=>call.kind+':'+call.key),['select:'+PROGRESS,'update:'+PROGRESS]);
  assert.equal(db.calls.some(call=>call.key===VAULT),false);
}
console.log('Sync request-count harness passed (vocabulary 4, progress 2; no full vault on unchanged sync)');
