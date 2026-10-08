import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {test} from 'node:test';
const root=new URL('../assets/auth/',import.meta.url);
const manifest=JSON.parse(readFileSync(new URL('manifest.json',root),'utf8'));
test('packaged official provider images retain source bytes and dimensions',()=>{
  const expected={'google-g.png':[200,204],'signin-ko-black.png':[750,144],'signin-ko-white.png':[750,144]};
  assert.deepEqual(manifest.files.map(a=>a.file).sort(),Object.keys(expected).sort());
  for(const asset of manifest.files){
    const bytes=readFileSync(new URL(asset.file,root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
    assert.deepEqual([bytes.readUInt32BE(16),bytes.readUInt32BE(20)],expected[asset.file]);
    const source=new URL(asset.source);
    assert.ok(['developers.google.com','appleid.cdn-apple.com'].includes(source.hostname));
    assert.equal(source.protocol,'https:');
    if(asset.file.startsWith('signin-')){
      assert.equal(source.hostname,'appleid.cdn-apple.com');
      assert.equal(source.pathname,'/appleid/button');
      assert.deepEqual(Object.fromEntries(source.searchParams),{type:'sign-in',color:asset.file.includes('black')?'black':'white',border:'false',height:'48',width:'250',locale:'ko_KR',scale:'3'});
    }
  }
});
