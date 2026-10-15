import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {DOMParser} from 'linkedom';

const root=new URL('../',import.meta.url),url='https://x.com/writer/status/123456789';
const document=new DOMParser().parseFromString('<html></html>','text/html');
const context=vm.createContext({DOMParser,document,URL,IMG_MARK:'[[IMG]]:'});
vm.runInContext(['scripts/importers/article.js','scripts/importers/social.js'].map(path=>readFileSync(new URL(path,root),'utf8')).join('\n'),context);
const copy=value=>JSON.parse(JSON.stringify(value));
const post=(body,attributes='data-testid="tweetText"')=>`<article><a href="${url}"><time>Date</time></a><div ${attributes}>${body}</div></article>`;
const parse=(body,attributes)=>context.parseSocialHtml(post(body,attributes),url);
const marked=(block,kind)=>copy(block.marks.filter(mark=>mark.kind===kind).map(mark=>({text:block.t.slice(mark.start,mark.end),href:mark.href,start:mark.start,end:mark.end})));

test('native post CRLF and LF preserve link and emphasis spans on each Unicode line',()=>{
  const result=parse('<strong>First <a href="https://example.com/source">café\r\n책 &amp; 🚀</a> final</strong>\nLast.');
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['First café','책 & 🚀 final','Last.']);
  for(const [index,text] of ['café','책 & 🚀'].entries()){
    const block=result.blocks[index],links=marked(block,'link');
    assert.equal(links.length,1);assert.equal(links[0].text,text);assert.equal(links[0].href,'https://example.com/source');
    assert.deepEqual(marked(block,'strong'),[{text:block.t,href:'',start:0,end:block.t.length}]);
  }
  assert.equal(result.blocks[2].marks.length,0);
});

test('nested BR splits inline anchors and emphasis without losing their marks',()=>{
  const result=parse('Intro <a href="https://example.com"><em>one<br>two</em></a> finish.');
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['Intro one','two finish.']);
  for(const [index,text] of ['one','two'].entries()){
    assert.equal(marked(result.blocks[index],'link')[0].text,text);
    assert.equal(marked(result.blocks[index],'em')[0].text,text);
  }
});

test('explicit pre-wrap body preserves LF while normal whitespace collapses it',()=>{
  const body='First line.\nSecond <strong>line.</strong>';
  const wrapped=parse(body,'itemprop="articleBody" style="white-space: pre-wrap"');
  assert.deepEqual(copy(wrapped.blocks.map(block=>block.t)),['First line.','Second line.']);
  assert.equal(marked(wrapped.blocks[1],'strong')[0].text,'line.');
  const normal=parse(body,'itemprop="articleBody"');
  assert.deepEqual(copy(normal.blocks.map(block=>block.t)),['First line. Second line.']);
});

test('a normal-whitespace inline override is honored inside a native post',()=>{
  const result=parse('First <span style="white-space: normal">one\ntwo</span>\nLast.');
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['First one two','Last.']);
});

test('an inherited explicit pre-wrap style survives the inert body clone',()=>{
  const html=post('First line.\nLast line.','itemprop="articleBody"').replace('<article>','<article style="white-space: pre-wrap">');
  const result=context.parseSocialHtml(html,url);
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['First line.','Last line.']);
});

test('X emoji images become inline text with surrounding Unicode mark offsets intact',()=>{
  const result=parse('Hello <strong><img src="https://abs.twimg.com/emoji/v2/svg/1f642.svg" alt="🙂"> &amp; <a href="https://example.com"><img src="https://abs-0.twimg.com/emoji/v2/svg/1f469.svg" alt="👩🏽‍💻"> 🇰🇷 <img src="https://abs.twimg.com/emoji/v2/svg/31.svg" alt="1️⃣"></a></strong> friends.');
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['Hello 🙂 & 👩🏽‍💻 🇰🇷 1️⃣ friends.']);
  const block=result.blocks[0];
  assert.equal(marked(block,'strong')[0].text,'🙂 & 👩🏽‍💻 🇰🇷 1️⃣');
  assert.equal(marked(block,'link')[0].text,'👩🏽‍💻 🇰🇷 1️⃣');
  assert.equal(result.blocks.some(block=>block.r==='img'),false);
});

test('photo alt and arbitrary or unsafe image URLs never become inline emoji text',()=>{
  const result=parse('A photograph.<img src="https://pbs.twimg.com/media/photo.jpg" alt="🙂"><img src="https://example.com/emoji/icon.svg" alt="🚀"><img src="javascript:alert(1)" alt="📚"><img src="https://abs.twimg.com/emoji/v2/svg/1f642.svg" alt="Invented words">End.');
  assert.deepEqual(copy(result.blocks.filter(block=>block.r!=='img').map(block=>block.t)),['A photograph.','End.']);
  assert.equal(result.blocks.find(block=>block.r==='img').t,'https://pbs.twimg.com/media/photo.jpg');
  assert.equal(result.blocks.some(block=>block.t.includes('Invented words')),false);
});

test('hidden and quoted emoji stay outside the owned post body',()=>{
  const result=parse('Only this <img src="https://abs.twimg.com/emoji/v2/svg/1f642.svg" alt="🙂">.<span hidden><img src="https://abs.twimg.com/emoji/v2/svg/1f680.svg" alt="🚀"></span><div data-testid="quoteTweet"><img src="https://abs.twimg.com/emoji/v2/svg/1f4da.svg" alt="📚"></div>');
  assert.deepEqual(copy(result.blocks.map(block=>block.t)),['Only this 🙂.']);
});

test('pretty-printed Article HTML retains its paragraph, image and caption structure',()=>{
  const html=readFileSync(new URL('tests/fixtures/x-public-article.html',root),'utf8')
    .replaceAll('{{POST}}',url).replaceAll('{{ARTICLE}}','https://x.com/writer/article/123456789')
    .replace('A careful reader begins','A careful\n      reader begins');
  const result=context.parseSocialHtml(html,url);
  assert.equal(result.social.scope,'article');assert.equal(result.blocks.length,12);
  assert(result.blocks.some(block=>block.t.startsWith('A careful reader begins')));
  assert.equal(result.blocks.filter(block=>block.r==='img').length,3);
  assert.equal(result.blocks.filter(block=>block.caption).length,2);
  assert.equal(result.blocks.filter(block=>block.list).length,2);
  assert.match(result.blocks.at(-1).t,/^The final paragraph/);
});
