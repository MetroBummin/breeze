import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source=readFileSync(process.env.BREEZE_RSS_TEST_SOURCE || new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
const now=Date.parse('2026-09-25T00:00:00Z'), day=86400000;
const feeds=[
  {url:'https://space.test/feed',category:'science'},
  {url:'https://culture.test/feed',category:'culture'},
  {url:'https://fun.test/feed',category:'entertainment'},
  {url:'https://business.test/feed',category:'business'},
];
const entry=(host='space',id='new',category='science',age=1,extra={})=>({
  title:`Article ${id}`,url:`https://${host}.test/${id}`,photo:`https://images.test/${id}.png`,
  category,feedSourceUrl:`https://${host}.test/feed`,publishedAt:new Date(now-age*day).toISOString(),...extra,
});
const read=(host='space',id='read',extra={})=>({id,kind:'article',sourceUrl:`https://${host}.test/${id}`,...extra});
const position=(p=1,age=0)=>({p,t:now-age*day});
class Clock extends Date { static now(){return now;} }
function environment(overrides={}){
  const context=vm.createContext({URL,Date:Clock,console,setTimeout,clearTimeout,performance,books:[],positions:{},
    load:(_key,fallback)=>fallback,normalizeArticleUrl:value=>value,...overrides});
  vm.runInContext(source,context);
  return context;
}
function rank(groups,options={}){
  return environment().rssRankRecommendations(groups,{now,sources:feeds,...options});
}
const urls=groups=>Array.from(groups,group=>group[0].url);
const items=()=>[[entry('space')],[entry('culture','new','culture')],
  [entry('fun','new','entertainment')],[entry('business','new','business')]];
const personalized=()=>({library:[read()],positions:{read:position()}});

// These run the actual ranking and render functions, not a duplicate algorithm.
test('cold start favors fresh articles and remains deterministic',()=>{
  const groups=[[entry('old','old','culture',50)],[entry('fresh','fresh','science',0)]];
  assert.equal(rank(groups)[0][0].url,'https://fresh.test/fresh');
  assert.deepEqual(urls(rank(groups)),urls(rank(groups)));
  assert.deepEqual(urls(rank(groups)),urls(rank([...groups].reverse())));
});
test('recent meaningful reading boosts its source/category without an AI request',()=>{
  const neutral=rank(items()), tailored=rank(items(),personalized());
  assert.notEqual(neutral[0][0].url,'https://space.test/new');
  assert.equal(tailored[0][0].url,'https://space.test/new');
});
test('a Preview, saved-only link or accidental open does not train preferences',()=>{
  const expected=urls(rank(items()));
  for(const p of [undefined,{p:0,t:now},{p:.09,t:now},{p:1,t:0}]){
    assert.deepEqual(urls(rank(items(),{library:[read()],positions:{read:p}})),expected);
  }
});
test('PDF, EPUB and pasted text do not train the article profile',()=>{
  for(const kind of ['pdf','epub','paste'])
    assert.deepEqual(urls(rank(items(),{library:[read('space','read',{kind})],positions:{read:position()}})),urls(rank(items())));
});
test('invalid, future and expired reading timestamps do not train preferences',()=>{
  for(const t of [NaN,Infinity,-1,now+1,now-61*day])
    assert.deepEqual(urls(rank(items(),{library:[read()],positions:{read:{p:1,t}}})),urls(rank(items())));
});
test('recent readings outweigh equally progressed old readings',()=>{
  const options={library:[read('space','old'),read('culture','recent')],
    positions:{old:position(1,50),recent:position()}};
  assert.equal(rank(items(),options)[0][0].url,'https://culture.test/new');
});
test('duplicate library aliases do not multiply an interest signal',()=>{
  const original=read(), copy=read('space','copy',{sourceUrl:original.sourceUrl+'?utm_source=dup'});
  const a=rank(items(),personalized());
  const b=rank(items(),{library:[original,copy],positions:{read:position(),copy:position()}});
  assert.deepEqual(urls(a),urls(b));
});
test('saved source, resolved and discovered URLs are excluded including tracking variants',()=>{
  const book=read('space','old',{sourceUrl:'https://space.test/new?a=1&b=2',
    resolvedUrl:'https://culture.test/new',discoveredFromUrl:'https://fun.test/new'});
  const groups=[[entry('space','new','science',1,{url:'https://space.test/new?b=2&utm_source=rss&a=1#top'})],...items().slice(1)];
  assert.deepEqual(urls(rank(groups,{library:[book]})),['https://business.test/new']);
});
test('saved linked article suppresses its Reddit discovery card',()=>{
  const groups=[[entry('reddit','post','science',1,{readUrl:'https://space.test/read?utm_medium=feed'})]];
  assert.equal(rank(groups,{library:[read()]}).length,0);
});
test('only supplied RSS candidates are recommended; library contents are never appended',()=>{
  const books=[read('private','secret'),{id:'book',kind:'epub',title:'My book'}];
  assert.equal(rank([],{library:books}).length,0);
  const input=items();
  assert(rank(input,{library:books}).every(group=>input.flat().includes(group[0])));
});
test('cross-feed duplicates fall through to the next eligible candidate',()=>{
  const shared=entry('space','shared');
  const alternate=entry('other','different','science');
  const groups=[[shared],[{...shared,feedSourceUrl:'https://other.test/feed'},alternate]];
  const output=urls(rank(groups));
  assert.equal(output.length,2);assert.equal(new Set(output).size,2);
  assert(output.includes(alternate.url));
});
test('different Reddit links to the same article are deduplicated',()=>{
  const groups=[[entry('reddit','post-a','science',1,{readUrl:'https://space.test/shared'})],
    [entry('reddit','post-b','science',1,{feedSourceUrl:'https://reddit.test/another',readUrl:'https://space.test/shared#section'})]];
  assert.equal(rank(groups).length,1);
});
test('photo-less, malformed and non-HTTP entries cannot become recommendations',()=>{
  const good=entry();
  const bad=[null,{},entry('space','bad','science',1,{photo:''}),
    entry('space','bad2','science',1,{url:'javascript:alert(1)'}),
    entry('space','bad3','science',1,{readUrl:'file:///private'}),
    entry('space','bad4','science',1,{title:' '})];
  assert.deepEqual(urls(rank([null,[...bad,good]])),[good.url]);
});
test('refresh rotation within a feed is preserved rather than always taking newest',()=>{
  const rotated=entry('space','rotated','science',8), newest=entry('space','newest','science',0);
  assert.equal(rank([[rotated,newest]])[0][0],rotated);
});
test('unread pictured candidate follows a saved candidate in the same feed',()=>{
  const group=[entry('space','saved'),entry('space','missing','science',1,{photo:''}),entry('space','eligible')];
  assert.equal(rank([group],{library:[read('space','saved')]} )[0][0].url,'https://space.test/eligible');
});
test('new category gets the fourth slot when alternatives exist',()=>{
  const groups=['a','b','c','d'].map(host=>[entry(host,'new','science')]);
  groups.push([entry('z','new','culture',2)]);
  const library=Array.from({length:6},(_,i)=>read('space','read'+i));
  const positions=Object.fromEntries(library.map(book=>[book.id,position()]));
  const result=rank(groups,{library,positions});
  assert.equal(result[3][0].category,'culture');
});
test('first four avoid repeated publishers when alternatives exist',()=>{
  const groups=[0,1,2].map(n=>[entry('space','topic-'+n,'science',0,{feedSourceUrl:`https://space.test/feed-${n}`})]);
  groups.push(...items().slice(1));
  const first=rank(groups,personalized()).slice(0,4).map(group=>new URL(group[0].url).hostname);
  assert.equal(new Set(first).size,4);
});
test('single-source/category feeds remain usable; no rigid quota causes empty slots',()=>{
  assert.equal(rank([[entry()]],personalized()).length,1);
});
test('ambiguous publisher categories are not guessed from titles or body',()=>{
  const sources=[{url:'https://medium.test/tech',category:'science'},
    {url:'https://medium.test/culture',category:'culture'}];
  const groups=[[entry('a','new','science')],[entry('b','new','culture')]];
  const options={sources,library:[read('medium')],positions:{read:position()}};
  assert.deepEqual(urls(rank(groups,options)),urls(rank(groups,{sources})));
  options.library=[read('medium','read',{feedUrl:'https://medium.test/culture'})];
  assert.equal(rank(groups,options)[0][0].category,'culture');
});
test('current custom source categories are respected',()=>{
  const sources=[{url:'https://space.test/feed',category:'culture'}];
  const groups=[[entry('a','new','science')],[entry('b','new','culture')]];
  assert.equal(rank(groups,{...personalized(),sources})[0][0].category,'culture');
});
test('missing and future publication dates gain no artificial freshness bonus',()=>{
  const groups=[[entry('a','bad','science',1,{publishedAt:'bad'})],
    [entry('b','future','science',-1)],[entry('c','today','culture',0)]];
  assert.equal(rank(groups)[0][0].url,'https://c.test/today');
});
test('same candidate pool, history and clock produce stable non-mutating output',()=>{
  const groups=items(), options={...personalized(),now,sources:feeds};
  const freeze=value=>{if(value && typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  const before=JSON.stringify({groups,options});freeze(groups);freeze(options);
  const first=urls(rank(groups,options));
  for(let i=0;i<10;i++)assert.deepEqual(urls(rank(groups,options)),first);
  assert.equal(JSON.stringify({groups,options}),before);
});
test('profile is derived each time: removing reading history removes personalization',()=>{
  const options=personalized();
  assert.equal(rank(items(),options)[0][0].url,'https://space.test/new');
  options.positions={};
  assert.deepEqual(urls(rank(items(),options)),urls(rank(items())));
});
test('candidate work is bounded to existing source/item limits',()=>{
  const groups=Array.from({length:30},(_,i)=>Array.from({length:110},(_,j)=>entry('host'+i,'item'+j)));
  assert.equal(rank(groups).length,20);
});
test('non-array legacy state and malformed URL values do not throw',()=>{
  assert.deepEqual(urls(rank(null,{library:null,sources:null,positions:null})),[]);
  assert.deepEqual(urls(rank(items(),{library:[null,{},read('space','r',{sourceUrl:'broken'})]})),urls(rank(items())));
});

// Small DOM contract harness. It exercises production renderRssCards but is
// explicitly not WebKit/iPad visual, scrolling, network or image-decode evidence.
class Node {
  constructor(className=''){this.className=className;this.dataset={};this.children=[];this.hidden=false;this.scrollLeft=0;this.isConnected=true;}
  get classList(){return {contains:name=>this.className.split(' ').includes(name),add:name=>{this.className+=' '+name;}};}
  setAttribute(){}
  matches(selector){return selector.split('.').filter(Boolean).every(name=>this.classList.contains(name));}
  querySelectorAll(selector){return this.children.filter(child=>selector.split(',').some(part=>child.matches(part)));}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  insertBefore(child,before){child.remove();const index=before?this.children.indexOf(before):-1;
    if(index<0)this.children.push(child);else this.children.splice(index,0,child);
    child.parentElement=this;child.isConnected=true;}
  remove(){if(this.parentElement){const list=this.parentElement.children;list.splice(list.indexOf(this),1);this.parentElement=null;}this.isConnected=false;}
  contains(node){return !!node && (this.children.includes(node)||node===this);}
}
function renderer({id='casual-rail',category='all',options=personalized()}={}){
  const rail=new Node();rail.id=id;
  const empty=new Node(), document={activeElement:null,querySelectorAll:()=>[],createElement:()=>new Node()};
  let groupData=items(),photos=0;
  const ctx=environment({document,books:options.library||[],positions:options.positions||{},
    load:(key,fallback)=>key==='breeze.feed-category'?category:fallback});
  // Network and visual DOM are replaced; production ranking/paint stays intact.
  ctx.rssSources=()=>feeds;
  ctx.loadRss=async()=>groupData;
  ctx.rssCard=entry=>{const card=new Node('casual rss-card');card.dataset.rssUrl=entry.url;card.hidden=true;return card;};
  ctx.rssCardPhoto=async card=>{photos++;card.hidden=false;
    if(rail.dataset.rssResetStart){rail.scrollLeft=0;delete rail.dataset.rssResetStart;}return true;};
  return {rail,empty,ctx,document,setGroups:value=>{groupData=value;},photos:()=>photos,
    paint:force=>ctx.renderRssCards(rail,force,empty),urls:()=>rail.children.filter(n=>n.classList.contains('rss-card')).map(n=>n.dataset.rssUrl)};
}
test('Home render uses ranking, preserves decoded nodes, and refreshes after reading changes',async()=>{
  const r=renderer();await r.paint();
  assert.equal(r.urls()[0],'https://space.test/new');
  const nodes=[...r.rail.children],count=r.photos();await r.paint();
  assert.deepEqual(r.rail.children,nodes);assert.equal(r.photos(),count);
  r.ctx.positions={};await r.paint();
  assert.notEqual(r.urls()[0],'https://space.test/new');assert.equal(r.photos(),count);
});
test('legacy category and Discover rails keep their non-personalized path',async()=>{
  const r=renderer({id:'casual-discover-rail'});await r.paint();
  assert.deepEqual(r.urls(),items().map(group=>group[0].url));
  const category=renderer({category:'culture'});await category.paint();
  if(typeof category.ctx.rssSelectedCategory==='function')
    assert.deepEqual(category.urls(),['https://culture.test/new']);
  else assert.equal(category.urls().length,4); // Home PR #20 removes category filters.
});
test('scroll/focus/busy rails preserve old card order; explicit refresh reranks',async()=>{
  for(const mode of ['scroll','focus','busy']){
    const r=renderer({options:{}});await r.paint();const before=r.urls();
    if(mode==='scroll')r.rail.scrollLeft=200;
    if(mode==='focus')r.document.activeElement=r.rail.children[0];
    if(mode==='busy')r.rail.children[0].classList.add('busy');
    r.ctx.books=personalized().library;r.ctx.positions=personalized().positions;
    await r.paint();assert.deepEqual(r.urls(),before);
    r.setGroups([...items(),[entry('extra','latest','society',0)]]);
    await r.paint();assert.deepEqual(r.urls().slice(0,before.length),before);
    await r.paint(true);assert.equal(r.urls()[0],'https://space.test/new');
  }
});
test('empty feeds render an empty state instead of injecting personal saved content',async()=>{
  const r=renderer();r.setGroups([]);await r.paint();
  assert.equal(r.urls().length,0);assert.equal(r.empty.hidden,false);
});
test('ranking has no storage or network side effects',()=>{
  const forbidden=()=>{throw new Error('Unexpected recommendation side effect');};
  const ctx=environment({fetch:forbidden,save:forbidden,localStorage:{setItem:forbidden},
    crypto:{randomUUID:forbidden}});
  assert.equal(ctx.rssRankRecommendations(items(),{...personalized(),now,sources:feeds}).length,4);
});
