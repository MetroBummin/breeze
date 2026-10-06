import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';

const source=readFileSync(process.env.BREEZE_RSS_TEST_SOURCE||new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
// Controlled layout and image events exercise the production state machine.
// Browser pixels, WebKit and device layout remain separate CI/device evidence.
class Node {
  constructor(className=''){
    this.className=className;this.dataset={};this.children=[];this.attrs=new Map();this.hidden=false;
    this.isConnected=true;this.scrollLeft=0;this.style={removeProperty:key=>{delete this.style[key];}};
  }
  get classList(){return {contains:value=>this.className.split(' ').includes(value),
    add:value=>{if(!this.classList.contains(value))this.className+=' '+value;},
    remove:value=>{this.className=this.className.split(' ').filter(v=>v!==value).join(' ');}};}
  setAttribute(key,value){this.attrs.set(key,value);}
  removeAttribute(key){this.attrs.delete(key);}
  hasAttribute(key){return this.attrs.has(key);}
  addEventListener(){} removeEventListener(){} closest(){return null;}
  getClientRects(){return this.hidden?[]:[this.getBoundingClientRect()];}
  getBoundingClientRect(){const index=this.parentElement?this.parentElement.children.filter(c=>!c.hidden).indexOf(this):0;
    const left=index*150;return this.hidden?{left:0,right:0,top:0,bottom:0,width:0,height:0}:{left,right:left+150,top:0,bottom:200,width:150,height:200};}
  matches(selector){
    if(selector.includes(':not([hidden])')&&this.hidden)return false;
    return selector.replace(':not([hidden])','').split('.').filter(Boolean).every(value=>this.classList.contains(value));
  }
  querySelectorAll(selector){return this.children.flatMap(child=>selector.split(',').some(part=>child.matches(part))?[child]:[]);}
  querySelector(selector){if(selector==='.cover')return this.image||null;if(selector==='.thumb')return this.thumb||null;
    if(selector==='.thumb.has-cover')return this.thumb?.classList.contains('has-cover')?this.thumb:null;
    return this.querySelectorAll(selector)[0]||null;}
  insertBefore(child,before){child.remove();const index=this.children.indexOf(before);if(index<0)this.children.push(child);else this.children.splice(index,0,child);child.parentElement=this;child.isConnected=true;}
  remove(){if(this.parentElement){const list=this.parentElement.children;list.splice(list.indexOf(this),1);this.parentElement=null;}this.isConnected=false;}
  contains(node){return node===this||this.children.includes(node);}
}
function fixture(){
  const rail=new Node();rail.id='casual-rail';rail.getBoundingClientRect=()=>({left:0,right:320,top:0,bottom:200,width:320,height:200});
  const empty=new Node(),storage=new Map(),frames=new Map(),imageStarts=[],imagePending=[],metadata=[],writes=[];
  let frame=0,created=0,transport=async()=>null;
  const document={visibilityState:'visible',activeElement:null,getElementById:id=>id==='casual-rail'?rail:id==='home-feed-empty'?empty:null,
    createElement:()=>new Node(),addEventListener(){},removeEventListener(){}};
  const context=createContext({URL,Date,console,setTimeout,clearTimeout,TextEncoder,AbortController,
    books:[],positions:{},navigator:{onLine:true},window:{innerWidth:320,innerHeight:700},document,
    requestAnimationFrame:fn=>{frames.set(++frame,fn);return frame;},cancelAnimationFrame:id=>frames.delete(id),
    load:(_key,fallback)=>fallback,normalizeArticleUrl:v=>v,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},
    bookPut:()=>writes.push('book'),imgPut:()=>writes.push('image'),fetchArticleHtml:()=>writes.push('body'),
    homeSmartCrop(){},fetchArticleImage:async()=>null,
  });
  runInContext(source,context);
  const feeds=runInContext('RSS_FEEDS',context);
  context.rssAlignRailStart=()=>{};
  context.rssCard=entry=>{
    created++;const card=new Node('casual rss-card');card.dataset.rssUrl=entry.url;card.style.visibility='hidden';card.tabIndex=-1;
    card.thumb=new Node('thumb');card.image=new Node('cover');card.image.hidden=true;card.image.naturalWidth=800;card.image.naturalHeight=600;
    card.image.decode=()=>Promise.resolve();
    Object.defineProperty(card.image,'src',{set:src=>{imageStarts.push(src);imagePending.push({card,image:card.image,src});}});
    return card;
  };
  context.rssCoverFetch=async(url,signal)=>{metadata.push(url);return transport(url,signal);};
  const entry=(id,feed=0,photo='')=>({title:'Public article '+id,url:'https://publisher.test/'+id,source:feeds[feed].name,
    feedSourceUrl:feeds[feed].url,category:feeds[feed].category,photo,coverFallback:!photo,summary:'Public metadata',contentHtml:'',bodyProvided:false});
  const groups=value=>{context.groups=value;runInContext('rssCands=groups;loadRss=async()=>rssCands',context);};
  const flush=async()=>{for(let n=0;n<15;n++){await Promise.resolve();const batch=[...frames.values()];frames.clear();batch.forEach(fn=>fn());await new Promise(r=>setTimeout(r,0));if(!frames.size)await Promise.resolve();}};
  const completeImages=async(ok=true)=>{for(const item of imagePending.splice(0)){if(ok)item.image.onload?.();else item.image.onerror?.();}await flush();};
  return {context,rail,empty,storage,metadata,writes,imageStarts,imagePending,entry,groups,flush,completeImages,
    setTransport:fn=>{transport=fn;},created:()=>created,frames:()=>frame,paint:(force=false)=>context.renderRssCards(rail,force,empty),
    cards:()=>rail.children.filter(c=>c.classList.contains('rss-card')),
    owner:()=>runInContext('rssCoverOwners.get(document.getElementById("casual-rail"))',context),
  };
}
function state(f){return f.cards().map(card=>({url:card.dataset.rssUrl,hidden:card.hidden,pending:card.classList.contains('rss-cover-pending'),ready:!!card.querySelector('.thumb.has-cover')}));}
function assertReadyOnly(f){assert(f.cards().every(card=>card.hidden||card.classList.contains('rss-cover-pending')||card.querySelector('.thumb.has-cover')),JSON.stringify(state(f)));}

test('historical photo-only display stays separate from retained candidate eligibility',async()=>{
  const f=fixture(),unknown=f.entry('unknown'),ready=f.entry('ready',0,'https://images.test/ready.jpg');
  f.groups([[unknown,ready]]);runInContext('rssCoverRemaining=0',f.context);await f.paint();await f.completeImages();
  assert.deepEqual(f.cards().map(c=>c.dataset.rssUrl),[ready.url]);assertReadyOnly(f);
  assert.equal(runInContext('rssCands[0].length',f.context),2);assert.equal(f.context.rssCoverCached(unknown.url),null);
  assert.equal(f.metadata.length,0);assert.equal(f.writes.length,0);assert.equal(f.storage.size,0);
});
test('only actual metadata admission shows shimmer and resolves up to two original-only photos',async()=>{
  const f=fixture(),entries=[0,1,2,3].map(i=>f.entry('original-'+i,i));f.groups(entries.map(e=>[e]));
  let finish;f.setTransport(()=>new Promise(resolve=>{finish=resolve;}));
  await f.paint();assert(f.cards().every(c=>!c.classList.contains('rss-cover-pending')));
  await f.flush();assert.equal(f.metadata.length,1);assert.equal(f.cards().filter(c=>c.classList.contains('rss-cover-pending')).length,1);
  const admitted=f.cards()[0];assert.equal(admitted.tabIndex,0,'Known metadata must remain selectable during admission');assert.equal(admitted.hidden,false);
  finish({photo:'https://images.test/first.jpg'});await f.flush();await f.completeImages();
  assert.equal(f.metadata.length,2);finish({photo:'https://images.test/second.jpg'});await f.flush();await f.completeImages();
  assert.equal(f.cards().length,2);assert(f.cards().every(c=>c.thumb.classList.contains('has-cover')));assertReadyOnly(f);
  assert.equal(runInContext('rssCoverRemaining',f.context),0);assert.equal(runInContext('rssCands.flat().length',f.context),4);
  await f.paint();await f.flush();assert.equal(f.metadata.length,2);assert.equal(f.writes.length,0);
});
test('complete no-image caches absence while transient/unknown only withhold this generation and refill',async()=>{
  for(const outcome of [{photo:''},null]){
    const f=fixture(),unknown=f.entry('unknown'),ready=f.entry('ready',1,'https://images.test/ready.jpg');f.groups([[unknown],[ready]]);
    f.setTransport(async()=>outcome);await f.paint();await f.flush();await f.completeImages();
    assert.deepEqual(f.cards().map(c=>c.dataset.rssUrl),[ready.url],JSON.stringify(state(f)));assertReadyOnly(f);
    assert.equal(f.context.rssCoverCached(unknown.url)?.photo,outcome?'':undefined);
    assert.equal(runInContext('rssCands[0][0]===groups[0][0] && rssCands.flat().length===2',f.context),true);
    const before=f.metadata.length;await f.paint();await f.flush();assert.equal(f.metadata.length,before);
    assert.equal(f.writes.length,0);assert.equal(runInContext('rssPreparedArticles.size',f.context),0);
  }
});
test('supplied decode failure exhausts existing image fallback, withholds and refills without originals',async()=>{
  const f=fixture(),bad=f.entry('broken',0,'https://images.test/broken.jpg'),good=f.entry('good',0,'https://images.test/good.jpg');f.groups([[bad,good]]);
  let fallback=0;f.context.fetchArticleImage=async()=>{fallback++;return null;};
  await f.paint();await f.flush();assert.equal(f.cards()[0].classList.contains('rss-cover-pending'),true);
  await f.completeImages(false);assert.equal(fallback,1);await f.completeImages(true);
  assert.deepEqual(f.cards().map(c=>c.dataset.rssUrl),[good.url]);assertReadyOnly(f);
  assert.equal(f.metadata.length,0);assert.equal(f.context.rssCoverCached(bad.url),null);assert.equal(f.storage.size,0);
  assert.equal(runInContext('rssCands[0].length',f.context),2);await f.paint();await f.flush();assert.equal(fallback,1);
});
test('supplied decode can succeed through the existing one-blob fallback',async()=>{
  const f=fixture(),entry=f.entry('fallback',0,'https://images.test/fallback.jpg');f.groups([[entry]]);
  let fallback=0;f.context.fetchArticleImage=async()=>{fallback++;return new Blob(['fixture']);};
  await f.paint();await f.flush();await f.completeImages(false);assert.equal(fallback,1);
  assert(f.imageStarts.some(src=>src.startsWith('blob:')));await f.completeImages(true);
  assert.equal(f.cards()[0].hidden,false);assert(f.cards()[0].thumb.classList.contains('has-cover'));assertReadyOnly(f);
  assert.equal(f.metadata.length,0);assert.equal(f.storage.size,0);
});
test('cancel and reentry resume a supplied image without making an artwork-ready card',async()=>{
  const f=fixture(),entry=f.entry('cancel',0,'https://images.test/cancel.jpg');f.groups([[entry]]);
  await f.paint();await f.flush();const card=f.cards()[0],owner=f.owner();
  f.context.rssCoverCancel(owner);assert.equal(card.hidden,true);assert.equal(card.tabIndex,-1);
  assert.equal(card.classList.contains('rss-cover-pending'),false);assert.equal(card.dataset.photoStarted,undefined);
  await f.flush();const next=f.context.rssCoverBegin(f.rail);f.context.rssCoverWatch(next,[card],[entry]);await f.flush();
  assert.equal(card.hidden,false);assert.equal(card.classList.contains('rss-cover-pending'),true);await f.completeImages(true);
  assert(card.thumb.classList.contains('has-cover'));assert.equal(f.metadata.length,0);assertReadyOnly(f);
});
test('offscreen and budget-unadmitted metadata stays unknown; photo-ready fallback remains reachable',async()=>{
  const f=fixture(),first=f.entry('first',0,'https://images.test/first.jpg'),second=f.entry('second',1,'https://images.test/second.jpg'),
    third=f.entry('third',2,'https://images.test/third.jpg'),unknown=f.entry('unknown',3),good=f.entry('alternate',3,'https://images.test/alternate.jpg');
  f.groups([[first],[second],[third],[unknown,good]]);await f.paint();await f.flush();await f.completeImages();
  assert.equal(f.metadata.length,0);assert.equal(f.context.rssCoverCached(unknown.url),null);
  assert(f.cards().some(c=>c.dataset.rssUrl===good.url));assert.equal(runInContext('rssCands.flat().length',f.context),5);assertReadyOnly(f);
});
test('new owner cannot replenish the generation budget or delete pending candidates',async()=>{
  const f=fixture(),a=f.entry('a'),b=f.entry('b',1);f.groups([[a],[b]]);f.setTransport(async()=>null);
  await f.paint();await f.flush();assert.equal(f.metadata.length,2);f.context.rssCoverCancel(f.owner());
  f.context.rssCoverBegin(f.rail);await f.paint();await f.flush();assert.equal(f.metadata.length,2);
  assert.equal(f.cards().length,0);assert.equal(runInContext('rssCands.flat().length',f.context),2);
  assert.equal(f.storage.size,0);assert.equal(f.writes.length,0);
  f.context.rssCoverAdvance();await f.paint(true);await f.flush();assert.equal(f.metadata.length,4,'A new explicit generation must reconsider unknown metadata');
});

test('small images, rejected decode and failed blob transport cannot become ready',async()=>{
  for(const reason of ['tiny','decode-rejected','transport-error']){
    const f=fixture(),entry=f.entry(reason,0,'https://images.test/'+reason+'.jpg');f.groups([[entry]]);
    let fallback=0;f.context.fetchArticleImage=async()=>{fallback++;if(reason==='transport-error')throw Error('fixture transport');return null;};
    await f.paint();await f.flush();const card=f.cards()[0];
    if(reason==='tiny')card.image.naturalWidth=59;
    if(reason==='decode-rejected')card.image.decode=()=>Promise.reject(Error('fixture decode'));
    await f.completeImages(reason!=='transport-error');
    assert.equal(f.cards().length,0,reason+': '+JSON.stringify(state(f)));assert.equal(fallback,1);
    assert.equal(f.context.rssCoverCached(entry.url),null);assert.equal(runInContext('rssCands[0][0].photo',f.context),entry.photo);
  }
});
test('a canceled old decode cannot clear the resumed image owner or falsely become ready',async()=>{
  const f=fixture(),entry=f.entry('late',0,'https://images.test/late.jpg');f.groups([[entry]]);
  await f.paint();await f.flush();const card=f.cards()[0],oldOnload=card.image.onload;
  f.context.rssCoverCancel(f.owner());const next=f.context.rssCoverBegin(f.rail);f.context.rssCoverWatch(next,[card],[entry]);
  oldOnload();await f.flush();assert.equal(card.classList.contains('rss-cover-pending'),true);assert.equal(card.thumb.classList.contains('has-cover'),false);
  await f.completeImages(true);assertReadyOnly(f);assert.equal(f.imageStarts.length,2);
});
test('metadata cancellation reentry keeps the global two-request cap and ignores late old completion',async()=>{
  const f=fixture(),entry=f.entry('metadata-cancel');f.groups([[entry]]);const finish=[];
  f.setTransport(()=>new Promise(resolve=>finish.push(resolve)));await f.paint();await f.flush();
  const card=f.cards()[0];f.context.rssCoverCancel(f.owner());assert.equal(card.hidden,true);
  const next=f.context.rssCoverBegin(f.rail);f.context.rssCoverWatch(next,[card],[entry]);
  finish[0]({photo:'https://images.test/stale.jpg'});await f.flush();
  assert.equal(entry.photo,'');assert.equal(f.context.rssCoverCached(entry.url),null);assert.equal(f.metadata.length,2);
  finish[1]({photo:'https://images.test/current.jpg'});await f.flush();await f.completeImages();
  assert.equal(entry.photo,'https://images.test/current.jpg');assertReadyOnly(f);
  assert.equal(f.context.rssCoverCached(entry.url).photo,entry.photo);assert.equal(runInContext('rssCoverRemaining',f.context),0);
});
test('all thirteen source groups survive even when none produces a photo-ready card',async()=>{
  const f=fixture(),entries=Array.from({length:13},(_,i)=>f.entry('retained-'+i,i));f.groups(entries.map(entry=>[entry]));
  f.setTransport(async()=>null);await f.paint();await f.flush();assert.equal(f.metadata.length,2);assert.equal(f.cards().length,0);
  assert.equal(runInContext('rssCands.length',f.context),13);assert.equal(runInContext('rssCands.flat().length',f.context),13);
  assert.equal(f.storage.size,0);assert.equal(runInContext('rssPreparedArticles.size',f.context),0);assert.equal(f.writes.length,0);
  for(const entry of entries)assert.equal(f.context.rssCoverCached(entry.url),null);
});
test('late supplied sources append without replacing admitted covers, including a recreated owner',async()=>{
  const f=fixture(),a=f.entry('z-first',11),b=f.entry('z-second',12);f.groups([[a],[b]]);
  f.setTransport(async url=>({photo:'https://images.test/'+url.split('/').at(-1)+'.jpg'}));
  await f.paint();await f.flush();await f.completeImages();const before=f.cards().map(c=>c.dataset.rssUrl);
  assert.equal(before.length,2);f.context.rssCoverCancel(f.owner());f.context.rssCoverBegin(f.rail);
  const late=f.entry('a-late',0,'https://images.test/late.jpg');f.groups([[late],[a],[b]]);
  await f.paint();await f.flush();await f.completeImages();
  assert.deepEqual(f.cards().map(c=>c.dataset.rssUrl),[...before,late.url]);assert.equal(f.metadata.length,2);assertReadyOnly(f);
});

test('a photo sibling bypasses unresolved entries; an offscreen photo-free source settles once',async()=>{
  for(const hasSibling of [true,false]){
    const f=fixture(),unknown=Array.from({length:100},(_,i)=>f.entry('unknown-'+i,3));
    const ready=f.entry('ready-sibling',3,'https://images.test/ready.jpg');
    const leading=[0,1,2].map(i=>[f.entry('leading-'+i,i,'https://images.test/leading-'+i+'.jpg')]);
    f.groups([...leading,hasSibling?[...unknown,ready]:unknown]);await f.paint();await f.flush();await f.completeImages();
    assert.equal(f.metadata.length,0);assert(f.created()<=11,'Unadmitted source cycled through candidates: '+f.created());
    assert(f.frames()<=4,'Unadmitted source kept scheduling paints: '+f.frames());
    assert.equal(f.cards().length,hasSibling?4:3);assertReadyOnly(f);
    assert.equal(runInContext('rssCands[3].length',f.context),hasSibling?101:100);
    for(const entry of unknown)assert.equal(f.context.rssCoverCached(entry.url),null);
  }
});

test('saved or promotional photo siblings do not suppress original-only recovery',async()=>{
  const f=fixture(),saved=f.entry('saved',0,'https://images.test/saved.jpg'),promo=f.entry('promo',0,'https://images.test/promo.jpg'),unknown=f.entry('recover');
  promo.title='Acme coupon codes';promo.summary='Use code SAVE20 at checkout and save 20%. These verified codes expire today. Shop now.';
  f.context.books=[{id:'saved',kind:'article',sourceUrl:saved.url}];f.groups([[saved,promo,unknown]]);
  f.setTransport(async()=>({photo:'https://images.test/recovered.jpg'}));await f.paint();await f.flush();await f.completeImages();
  assert.deepEqual(f.metadata,[unknown.url]);assert.deepEqual(f.cards().map(c=>c.dataset.rssUrl),[unknown.url]);assertReadyOnly(f);
  assert.equal(runInContext('rssCands[0].length',f.context),3);assert.equal(f.writes.length,0);
});

test('warm decoded-photo count precedes layout-probe settlement; settled rail keeps only cached photos',async()=>{
  const f=fixture(),entries=[0,1,2].map(i=>f.entry('warm-'+i,i));
  f.rail.getBoundingClientRect=()=>({left:0,right:300,top:0,bottom:200,width:300,height:200});
  f.context.window.innerWidth=300;
  for(const entry of entries.slice(0,2))f.context.rssCoverStore(entry.url,'https://images.test/'+entry.url.split('/').at(-1)+'.jpg');
  f.groups(entries.map(entry=>[entry]));await f.paint();
  for(const item of f.imagePending.splice(0))item.image.onload?.();
  await new Promise(resolve=>setTimeout(resolve,0));
  assert.equal(f.cards().filter(card=>card.thumb.classList.contains('has-cover')).length,2);
  assert.equal(f.cards().length,3,'The fixture must observe the still-queued offscreen layout probe');
  assert.equal(f.cards().filter(card=>card.tabIndex!==0).length,1);
  await f.flush();
  assert.equal(f.cards().length,2);assertReadyOnly(f);assert.equal(f.metadata.length,0);
  assert.equal(runInContext('rssCands.flat().length',f.context),3);
  assert.equal(f.context.rssCoverCached(entries[2].url),null,'Unadmitted metadata remains unknown');
});


test('explicit refresh reranks before admission and preserves the new visible owner through late refill',async()=>{
  const f=fixture(),first=f.entry('z-first',11),second=f.entry('z-second',12);
  f.groups([[first],[second]]);
  f.setTransport(async url=>({photo:'https://images.test/'+url.split('/').at(-1)+'.jpg'}));
  await f.paint();await f.flush();await f.completeImages();
  assert.deepEqual(f.cards().map(card=>card.dataset.rssUrl),[first.url,second.url]);
  assert.equal(f.metadata.length,2);
  const ready=f.entry('a-ready',0,'https://images.test/ready.jpg'),probe=f.entry('b-probe',1);
  f.groups([[ready],[probe],[first],[second]]);
  let finish;f.setTransport(()=>new Promise(resolve=>{finish=resolve;}));
  f.context.rssCoverAdvance();
  const pass=runInContext('rssCoverPass',f.context);
  await f.paint(true);
  // No frame has run: this is the new generation's rerank before admission.
  const initial=[ready.url,probe.url,first.url,second.url];
  assert.deepEqual(f.cards().map(card=>card.dataset.rssUrl),initial);
  assert.equal(runInContext('rssCoverRemaining',f.context),2);
  assert.equal(f.metadata.length,2);
  await f.flush();assert.equal(f.metadata.length,3);assert.equal(f.metadata.at(-1),probe.url);
  const late=f.entry('c-late',5,'https://images.test/late.jpg');
  f.groups([[ready],[probe],[first],[second],[late]]);
  f.owner().repaint();await f.flush();
  assert.deepEqual(f.cards().map(card=>card.dataset.rssUrl),[...initial,late.url]);
  finish({photo:'https://images.test/probe.jpg'});await f.flush();await f.completeImages();
  assert.deepEqual(f.cards().map(card=>card.dataset.rssUrl),[...initial,late.url]);
  const ownerCard=f.cards().find(card=>card.dataset.rssUrl===probe.url);
  assert(f.context.rssCoverVisible(f.owner(),ownerCard));assert(ownerCard.thumb.classList.contains('has-cover'));
  assert.equal(runInContext('rssCoverPass',f.context),pass);assert.equal(f.metadata.length,3);
  assert.equal(runInContext('rssCoverRemaining',f.context),1);assertReadyOnly(f);assert.equal(f.writes.length,0);
});

test('display-eligible ranking cannot be replaced by filtering a full-candidate ranking',async()=>{
  const f=fixture(),eligible=new Set([1,2,4]);
  const entries=Array.from({length:13},(_,i)=>f.entry('article-'+i,i,eligible.has(i)?'https://images.test/'+i+'.jpg':''));
  f.groups(entries.map(entry=>[entry]));
  f.context.excluded=entries.filter((_entry,index)=>!eligible.has(index));
  runInContext('excluded.forEach(entry=>rssCoverWithheld.set(entry,{pass:rssCoverPass,photo:entry.photo}))',f.context);
  const eligibleUrls=[1,2,4].map(index=>entries[index].url);
  const globalFiltered=Array.from(f.context.rssRankRecommendations(entries.map(entry=>[entry]),{
    library:[],positions:{},sources:runInContext('rssSources()',f.context),now:Date.now(),
  }),group=>group[0].url).filter(url=>eligibleUrls.includes(url));
  assert.deepEqual(globalFiltered,[1,4,2].map(index=>entries[index].url),'Fixture must expose category-diversity dependence on eligibility');
  await f.paint(true);
  assert.deepEqual(f.cards().map(card=>card.dataset.rssUrl),eligibleUrls);
  assert.equal(f.metadata.length,0);assert.equal(runInContext('rssCoverRemaining',f.context),2);
  await f.flush();await f.completeImages();assertReadyOnly(f);assert.equal(f.metadata.length,0);
});

test('normal Home refresh re-admits unknown metadata after a new generation with identical feed contents',async()=>{
  const f=fixture(),actualLoad=f.context.loadRss,entries=Array.from({length:13},(_,i)=>f.entry('refresh-'+i,i));
  f.groups(entries.map(entry=>[entry]));f.context.loadRss=actualLoad;
  let feeds=0;f.context.rssFeedEntries=async feed=>{feeds++;return {entries:entries.filter(entry=>entry.feedSourceUrl===feed.url)};};
  f.setTransport(async()=>null);
  await f.paint();await f.flush();assert.equal(f.metadata.length,2);assert.equal(f.cards().length,0);
  const failedPass=runInContext('rssCoverPass',f.context),failedStamp=f.rail.dataset.rssStamp;
  assert.equal(feeds,13);assert.equal(f.storage.size,0,'Transient errors must not cache absence');
  await f.paint();await f.flush();assert.equal(f.metadata.length,2,'Same-generation render must not retry');
  f.setTransport(async url=>({photo:'https://images.test/'+url.split('/').at(-1)+'.jpg'}));
  // refreshLibrary invalidates feed freshness, then renderHome uses force=false.
  // Keep the actual production loader and per-source cloning/publication here.
  runInContext('rssPage++;rssLoadedAt=0',f.context);
  await f.paint();await f.flush();await f.completeImages();
  assert.equal(runInContext('rssCoverPass',f.context),failedPass+1);assert.equal(feeds,26);
  assert.equal(f.metadata.length,4,'New generation with identical metadata must recover within its two-request budget');
  assert.equal(f.cards().length,2);assertReadyOnly(f);
  assert.notEqual(f.rail.dataset.rssStamp,failedStamp);assert.equal(runInContext('rssCands.flat().length',f.context),13);
  assert.equal(f.writes.length,0);assert.equal(runInContext('rssPreparedArticles.size',f.context),0);
  await f.paint();await f.flush();assert.equal(f.metadata.length,4,'Recovered warm render repeated originals');
});

test('normal refresh preserves confirmed-negative metadata and recovers other unknown candidates',async()=>{
  const f=fixture(),actualLoad=f.context.loadRss,entries=Array.from({length:13},(_,i)=>f.entry('negative-'+i,i));
  f.groups(entries.map(entry=>[entry]));f.context.loadRss=actualLoad;
  f.context.rssFeedEntries=async feed=>({entries:entries.filter(entry=>entry.feedSourceUrl===feed.url)});
  f.setTransport(async()=>({photo:''}));await f.paint();await f.flush();
  assert.equal(f.metadata.length,2);assert.equal(f.cards().length,0);
  const absent=new Map(f.metadata.map(url=>[url,{...f.context.rssCoverCached(url)}]));
  f.setTransport(async url=>({photo:'https://images.test/'+url.split('/').at(-1)+'.jpg'}));
  runInContext('rssPage++;rssLoadedAt=0',f.context);await f.paint();await f.flush();await f.completeImages();
  assert.equal(f.metadata.length,4);assert.equal(new Set(f.metadata).size,4,'Confirmed absence was fetched again');
  assert.equal(f.cards().length,2);assertReadyOnly(f);
  for(const [url,record] of absent)assert.deepEqual({...f.context.rssCoverCached(url)},record,'Confirmed-negative provenance/lifetime changed');
  assert.equal(runInContext('rssCands.flat().length',f.context),13);assert.equal(f.writes.length,0);
  await f.paint();await f.flush();assert.equal(f.metadata.length,4);
});

test('late identical feed publication preserves an admitted original owner through normal refresh',async()=>{
  const f=fixture(),actualLoad=f.context.loadRss,entries=[f.entry('late-a',0),f.entry('late-b',1)];
  f.groups(entries.map(entry=>[entry]));f.context.loadRss=actualLoad;
  let releaseFeeds,feedGate=Promise.resolve();
  f.context.rssFeedEntries=async feed=>{await feedGate;return {entries:entries.filter(entry=>entry.feedSourceUrl===feed.url)};};
  f.setTransport(async()=>null);await f.paint();await f.flush();assert.equal(f.metadata.length,2);
  feedGate=new Promise(resolve=>{releaseFeeds=resolve;});let finishFirst;
  f.setTransport(url=>f.metadata.length===3?new Promise(resolve=>{finishFirst=resolve;}):Promise.resolve({photo:'https://images.test/'+url.split('/').at(-1)+'.jpg'}));
  runInContext('rssPage++;rssLoadedAt=0',f.context);const refreshing=f.paint();await f.flush();
  assert.equal(f.metadata.length,3);const consumer=f.owner().consumer;
  assert(consumer&&!consumer.job.controller.signal.aborted);
  releaseFeeds();await refreshing;await f.flush();
  const aborted=consumer.job.controller.signal.aborted,canonical=f.owner().consumer?.entry===runInContext('rssCands[0][0]',f.context);
  finishFirst({photo:'https://images.test/late-a.jpg'});await f.flush();await f.completeImages();
  assert.equal(aborted,false,'Identical canonical metadata replacement canceled admitted work');
  assert.equal(canonical,true,'Admitted owner did not follow identical current metadata');
  assert.equal(f.metadata.length,4);assert.equal(f.cards().length,2);assertReadyOnly(f);
  assert.equal(runInContext('rssCoverRemaining',f.context),0);assert.equal(f.writes.length,0);
});

test('late changed-title or version publication still cancels the old original owner and cache write',async()=>{
  for(const change of ['title','version']){
    const f=fixture(),actualLoad=f.context.loadRss,entries=[f.entry('changed-a',0),f.entry('changed-b',1)];
    entries[0].quality={key:'same-key',version:'v1',status:'approved'};
    f.groups(entries.map(entry=>[entry]));f.context.loadRss=actualLoad;
    let releaseFeeds,feedGate=Promise.resolve();
    f.context.rssFeedEntries=async feed=>{await feedGate;return {entries:entries.filter(entry=>entry.feedSourceUrl===feed.url)};};
    f.setTransport(async()=>null);await f.paint();await f.flush();assert.equal(f.metadata.length,2);
    feedGate=new Promise(resolve=>{releaseFeeds=resolve;});let finishFirst;
    f.setTransport(url=>f.metadata.length===3?new Promise(resolve=>{finishFirst=resolve;}):Promise.resolve({photo:'https://images.test/current.jpg'}));
    runInContext('rssPage++;rssLoadedAt=0',f.context);const refreshing=f.paint();await f.flush();
    const consumer=f.owner().consumer;assert(consumer&&!consumer.job.controller.signal.aborted);
    if(change==='title')entries[0].title='Revised source title';else entries[0].quality={...entries[0].quality,version:'v2'};
    releaseFeeds();await refreshing;await f.flush();const aborted=consumer.job.controller.signal.aborted;
    finishFirst({photo:'https://images.test/stale.jpg'});await f.flush();await f.completeImages();
    assert.equal(aborted,true,change);assert.equal(f.context.rssCoverCached(entries[0].url),null,change);
    assert.equal(runInContext('rssCands[0][0].photo',f.context),'',change);
    assert.equal(f.metadata.length,4,change);assert.equal(f.writes.length,0);assertReadyOnly(f);
  }
});

test('interrupted refresh retries only canceled unknown metadata; settled generations never repeat confirmed results',async()=>{
  for(const interrupted of [true,false]){
    const f=fixture(),actualLoad=f.context.loadRss,entries=Array.from({length:13},(_,i)=>f.entry('shimmer-'+i,i)),admissions=[];
    f.groups(entries.map(entry=>[entry]));f.context.loadRss=actualLoad;
    f.context.rssFeedEntries=async feed=>({entries:entries.filter(entry=>entry.feedSourceUrl===feed.url)});
    let finishCanceled;
    f.setTransport((url,signal)=>{
      admissions.push({url,pass:runInContext('rssCoverPass',f.context),cached:f.context.rssCoverCached(url),signal});
      if(url===entries[0].url)return Promise.resolve({photo:'https://images.test/shimmer-0.jpg'});
      if(interrupted&&admissions.length===4)return new Promise(resolve=>{finishCanceled=resolve;});
      return Promise.resolve({photo:''});
    });
    await f.paint();await f.flush();assert.equal(admissions.length,2);
    const firstNegative=admissions[1].url,negative={...f.context.rssCoverCached(firstNegative)};
    assert.equal(negative.photo,'');assert.equal(f.imageStarts.length,1);
    runInContext('rssPage++;rssLoadedAt=0',f.context);await f.paint();await f.flush();
    assert.equal(admissions.length,4);
    const fourth=admissions[3];
    if(interrupted)assert.equal(f.context.rssCoverCached(fourth.url),null,'Unfinished attempt must remain unknown');
    else assert.equal(f.context.rssCoverCached(fourth.url)?.photo,'','Settled attempt must confirm its absence');
    // Same-generation warm paint never spends another request.
    await f.paint();await f.flush();assert.equal(admissions.length,4);
    runInContext('rssPage++;rssLoadedAt=0',f.context);const next=f.paint();await f.flush();
    if(interrupted){
      assert.equal(fourth.signal.aborted,true);assert.equal(f.context.rssCoverCached(fourth.url),null);
      finishCanceled({photo:''});
    }
    await next;await f.flush();
    assert.equal(admissions.length,6);assert.equal(new Set(admissions.map(a=>a.url)).size,interrupted?5:6);
    const byPass=new Map();for(const a of admissions){const urls=byPass.get(a.pass)||[];urls.push(a.url);byPass.set(a.pass,urls);}
    assert.equal(byPass.size,3);for(const urls of byPass.values()){assert.equal(urls.length,2);assert.equal(new Set(urls).size,2);}
    assert.equal(admissions.filter(a=>a.url===firstNegative).length,1,'Confirmed-negative URL was refetched');
    assert.deepEqual({...f.context.rssCoverCached(firstNegative)},negative,'Negative provenance/timestamp was renewed');
    if(interrupted){const retry=admissions.filter(a=>a.url===fourth.url);assert.equal(retry.length,2);assert.equal(retry[1].cached,null,'Retry saw a false-negative cache from the canceled response');assert.notEqual(retry[0].pass,retry[1].pass);}
    console.log('RSS refresh boundary evidence:',JSON.stringify({interrupted,
      total:admissions.length,unique:new Set(admissions.map(a=>a.url)).size,
      perGeneration:[...byPass].map(([pass,urls])=>({pass,urls})),
      confirmedNegativeRequests:admissions.filter(a=>a.url===firstNegative).length,
      canceledRetryCache:interrupted?admissions.filter(a=>a.url===fourth.url)[1].cached:'no retry',
    }));
    assert.equal(f.imageStarts.length,1,'Explicit refresh restarted the held same-URL image');
    await f.completeImages();assertReadyOnly(f);assert.equal(f.cards().length,1);
    assert.equal(runInContext('rssCands.flat().length',f.context),13);assert.equal(f.writes.length,0);
  }
});

test('navigation after the first pending image may legitimately admit the remaining candidate on return',async()=>{
  const f=fixture(),entries=Array.from({length:3},(_,i)=>f.entry('navigation-'+i,i));f.groups(entries.map(entry=>[entry]));
  f.setTransport(async url=>({photo:'https://images.test/'+url.split('/').at(-1)+'.jpg'}));
  const photo=f.context.rssCardPhoto;let cancelOnce=true,before;
  f.context.rssCardPhoto=(card,entry)=>{
    const work=photo(card,entry);
    if(cancelOnce){cancelOnce=false;Promise.resolve().then(()=>{
      before={requests:f.metadata.length,remaining:runInContext('rssCoverRemaining',f.context),pass:runInContext('rssCoverPass',f.context)};
      f.context.rssCoverCancel(f.owner());
    });}
    return work;
  };
  await f.paint();await f.flush();assert.equal(before.requests,1);assert.equal(before.remaining,1);
  assert.equal(f.metadata.length,1);assert.equal(f.owner().cancelled,true);
  await f.paint();await f.flush();await f.completeImages();
  const after={requests:f.metadata.length,remaining:runInContext('rssCoverRemaining',f.context),pass:runInContext('rssCoverPass',f.context)};
  assert.equal(after.requests,2);assert.equal(after.remaining,0);assert.equal(after.pass,before.pass);
  assert.equal(f.metadata.filter(url=>url===entries[0].url).length,1,'The resumed image refetched its original');
  assert.equal(new Set(f.metadata).size,2);assert.equal(f.writes.length,0);assertReadyOnly(f);
  console.log('Navigation boundary:',JSON.stringify({before,after,requests:f.metadata,firstSourceOriginalReused:true}));
});

test('Home return preserves its stamp before explicit refresh; generation refresh changes stamp but retains photo',async()=>{
 const f=fixture(),load=f.context.loadRss,entry=f.entry('stamp-photo',0,'https://images.test/stamp.jpg');
 f.groups([[entry]]);f.context.loadRss=load;
 f.context.rssFeedEntries=async feed=>({entries:feed.url===entry.feedSourceUrl?[entry]:[]});
 await f.paint();await f.flush();await f.completeImages();
 const card=f.cards()[0],stamp=f.rail.dataset.rssStamp,pass=runInContext('rssCoverPass',f.context);
 f.context.rssCoverCancel(f.owner());await f.paint();await f.flush();
 assert.equal(f.rail.dataset.rssStamp,stamp);assert.equal(f.cards()[0],card);
 runInContext('rssPage++;rssLoadedAt=0',f.context);await f.paint();await f.flush();
 assert.notEqual(f.rail.dataset.rssStamp,stamp);assert.equal(runInContext('rssCoverPass',f.context),pass+1);
 assert.equal(f.cards()[0],card);assert.equal(f.imageStarts.length,1);assert.equal(f.metadata.length,0);
 console.log('Stamp boundary:',JSON.stringify({sameOnReturn:true,changesOnExplicitRefresh:true,decodedCardRetained:true}));
});
