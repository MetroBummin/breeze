import assert from 'node:assert/strict';
import {WORD,PROGRESS,server,device,word,book,pos} from './sync-test-transport.mjs';

{
  const db=server(),client=device(db,'unchanged',{seen:'base'});
  assert.equal(await client.api.vault(false),true);
  assert.deepEqual(db.calls.map(call=>call.kind+':'+call.key),[
    'select:'+WORD
  ]);
}
{
  const db=server(),client=device(db,'word',{words:{saved:word(200)},dirty:200});
  assert.equal(await client.api.vault(false),true);
  assert.deepEqual(db.calls.map(call=>call.kind+':'+call.key),[
    'select:'+WORD,'update:'+WORD
  ]);
  assert.equal(db.calls[1].columns,'key','CAS must not echo the whole wordbook');
}
{
  const db=server(),client=device(db,'reader',{books:[book('book')],positions:{book:pos(.5,300).position}});
  client.api.queueProgress();
  assert.equal(client.timers.size,0);
  assert.equal(db.calls.length,0);
  assert.equal(client.memory.get('breeze.progress.changed'),0);
  assert.equal(await client.api.all(false),true);
  assert.ok(db.calls.every(call=>call.key!==PROGRESS));
}
console.log('Wordbook-only sync request checks passed');
