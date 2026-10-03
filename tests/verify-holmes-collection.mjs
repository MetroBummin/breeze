import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Script} from 'node:vm';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const hash=text=>createHash('sha256').update(text).digest('hex');
const context={console,Set,books:[]};
new Script(read('scripts/library/longreads.js')).runInNewContext(context);
for(const slug of ['scandal-in-bohemia','red-headed-league']){
  test(`${slug}: complete source, exact edit replay and independent catalog identity`,()=>{
    const base='docs/content/'+slug+'/',m=JSON.parse(read(base+'manifest.json'));
    const original=read(base+'original.txt'),adapted=read('assets/longreads/'+slug+'.txt');
    const paras=original.trim().split('\n\n'),edits=JSON.parse(read(base+'edits.json'));
    assert.equal(hash(original),m.originalSha256);assert.equal(hash(adapted),m.adaptedSha256);
    assert.equal(original.trim().split(/\s+/).length,m.originalWords);
    assert.equal(adapted.trim().split(/\s+/).length,m.adaptedWords);
    assert.equal(paras.length,m.paragraphs);assert.equal(adapted.trim().split('\n\n').length,m.paragraphs);
    for(const e of edits){
      assert.equal(paras[e.paragraph-1].split(e.before).length-1,e.count||1);
      paras[e.paragraph-1]=paras[e.paragraph-1].replaceAll(e.before,e.after);assert.ok(e.reason);
    }
    assert.equal(paras.join('\n\n')+'\n',adapted);
    assert.equal(paras[0],m.first);assert.equal(paras.at(-1),m.last);
    assert.doesNotMatch(adapted,/Gutenberg|START OF|END OF|A CASE OF IDENTITY/);
    const catalog=context.pendingLongReads(),story=catalog.find(x=>x.id==='sherlock-holmes-'+slug);
    assert.equal(story.sha256,m.adaptedSha256);assert.equal(story.wordCount,m.adaptedWords);
    assert.equal(story.cover,'','Another story’s titled cover must not be reused');
    assert.match(story.editionNote,/not Doyle’s verbatim text/);
    assert.equal(new Set(catalog.map(x=>x.id)).size,4);
    if(slug==='scandal-in-bohemia'){
      assert.deepEqual(paras.filter(p=>/^(I|II|III)\.$/.test(p)),['I.','II.','III.']);
      for(const clue of ['This account of you we have from all quarters received.','Mrs. Turner','IRENE NORTON, née ADLER'])assert.ok(adapted.includes(clue),clue);
    }else{
      for(const clue of ['April 27, 1890','October 9, 1890','Saturday','napoleons','£ 30,000'])assert.ok(adapted.includes(clue),clue);
    }
  });
}
