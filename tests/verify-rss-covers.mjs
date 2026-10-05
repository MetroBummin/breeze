import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {DOMParser} from 'linkedom';

const article=readFileSync(new URL('../scripts/importers/article.js',import.meta.url),'utf8');
const rss=readFileSync(process.env.BREEZE_RSS_TEST_SOURCE||new URL('../scripts/importers/rss.js',import.meta.url),'utf8');
const prose='The story explains how people learn about the world by reading evidence and comparing ideas. ';
const feed={name:'Public essays',url:'https://stories.test/feed',category:'science'};
class FeedParser extends DOMParser{
  parseFromString(source,type){
    const doc=super.parseFromString(type==='text/html'?'<html><body>'+source+'</body></html>':source,type);
    // Linkedom retains XML prefixes in localName; browsers expose the local
    // namespace name. Adapt that parser difference, not the production code.
    if(type!=='text/html')for(const node of doc.querySelectorAll('*'))
      Object.defineProperty(node,'localName',{value:node.localName.split(':').at(-1)});
    return doc;
  }
}
function runtime(){
  const storage=new Map(),calls=[];
  const context=createContext({URL,Date,DOMParser:FeedParser,console,setTimeout,clearTimeout,TextEncoder,
    books:[],positions:{},navigator:{onLine:true},window:{},load:(_key,fallback)=>fallback,
    localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)}});
  runInContext(article+'\n'+rss,context);
  context.fetchArticleHtml=async url=>{calls.push(url);throw Error('Unexpected article preparation');};
  return {context,storage,calls};
}
function xml(fields){
  return `<rss xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/"><channel><item><title>The useful story about reading evidence</title><link>https://stories.test/article</link>${fields}</item></channel></rss>`;
}
function parse(fields){return runtime().context.parseRss(xml(fields),feed)[0];}

test('a photo in description survives image-less full content without changing the body',()=>{
  const body=`<p>${prose.repeat(8)}</p>`;
  const entry=parse(`<content:encoded><![CDATA[${body}]]></content:encoded><description><![CDATA[<p>${prose}</p><img src="/description.jpg" width="640" height="480">]]></description>`);
  assert.equal(entry.photo,'https://stories.test/description.jpg');
  assert.equal(entry.contentHtml,body);assert.equal(entry.bodyProvided,true);
});
test('an Atom summary photo is independent of its supplied content',()=>{
  const ctx=runtime().context,body=prose.repeat(8);
  const atom=`<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>The useful story about reading</title><link href="https://stories.test/article"/><content type="html">${body}</content><summary type="html"><![CDATA[<img data-src="/summary.jpg" width="640" height="480">]]></summary></entry></feed>`;
  const entry=ctx.parseRss(atom,feed)[0];
  assert.equal(entry.photo,'https://stories.test/summary.jpg');assert.equal(entry.contentHtml,body.trim());
});
test('a video declaration cannot take the place of a supplied image thumbnail',()=>{
  const entry=parse(`<description>${prose}</description><media:content medium="video" url="https://images.test/clip.mp4"/><media:thumbnail url="https://images.test/thumbnail.jpg" width="640" height="480"/>`);
  assert.equal(entry.photo,'https://images.test/thumbnail.jpg');
});
test('image MIME types and media values are case insensitive',()=>{
  for(const field of ['<enclosure type="IMAGE/JPEG" url="https://images.test/cover.jpg"/>',
    '<media:content medium="IMAGE" type="IMAGE/JPEG" url="https://images.test/cover.jpg"/>'])
    assert.equal(parse(`<description>${prose}</description>${field}`).photo,'https://images.test/cover.jpg');
});
test('responsive photos in a supplementary field retain the existing size selection',()=>{
  const entry=parse(`<content:encoded><![CDATA[<p>${prose.repeat(8)}</p>]]></content:encoded><summary><![CDATA[<img src="https://images.test/small.jpg" srcset="https://images.test/small.jpg 400w, https://images.test/medium.jpg 1200w, https://images.test/large.jpg 2400w">]]></summary>`);
  assert.equal(entry.photo,'https://images.test/medium.jpg');
});
test('unsafe and tracking images do not replace an available publisher photo',()=>{
  const entry=parse(`<description><![CDATA[<p>${prose}</p><img src="javascript:alert(1)"><img src="https://images.test/count.gif" width="1" height="1"><img src="https://images.test/cover.jpg" width="640" height="480">]]></description><enclosure type="audio/mpeg" url="https://images.test/podcast.mp3"/>`);
  assert.equal(entry.photo,'https://images.test/cover.jpg');
});
test('source photo absence retains artwork eligibility without inventing a photo',()=>{
  const {context,calls}=runtime(),entry=context.parseRss(xml(`<description>${prose}</description>`),feed)[0];
  const discovery=context.rssDiscoveryEntry(entry);
  assert.equal(discovery.photo,'');assert.equal(discovery.coverFallback,true);
  assert.equal(context.rssRankRecommendations([[discovery]],{library:[],positions:{},sources:[feed],now:Date.now()}).length,1);
  assert.equal(entry.source,feed.name);assert.equal(entry.category,feed.category);assert.equal(calls.length,0);
});
test('cold default loading caches the supplementary photo and never prepares an article',async()=>{
  const {context,storage,calls}=runtime();
  const publicFeeds=JSON.parse(runInContext('JSON.stringify(RSS_FEEDS)',context));
  context.fetchArticleHtml=async url=>{
    calls.push(url);assert(publicFeeds.some(source=>source.url===url),'Non-feed fetch before selection');
    return xml(`<content:encoded><![CDATA[<p>${prose.repeat(8)}</p>]]></content:encoded><description><![CDATA[<img src="https://images.test/cover.jpg" width="640" height="480">]]></description>`);
  };
  const groups=await context.loadRss(true);
  assert.equal(calls.length,publicFeeds.length);assert.equal(context.rssCatalogEnabled(),false);
  const cached=JSON.parse(storage.get('breeze.rss-public.v1'));
  for(let index=0;index<publicFeeds.length;index++){
    assert.equal(groups[index][0].photo,'https://images.test/cover.jpg');
    assert.equal(groups[index][0].contentHtml,'');assert.equal(groups[index][0].bodyProvided,false);
    assert.equal(cached[publicFeeds[index].url].entries[0].photo,'https://images.test/cover.jpg');
    assert.equal(cached[publicFeeds[index].url].entries[0].contentHtml,'');
  }
});

function selectedFixture({photo='',current=true,connected=true,cardUrl='https://stories.test/article',draftPhoto='https://images.test/selected.jpg'}={}){
  const {context,storage,calls}=runtime(),decoded=[];
  context.entry={url:'https://stories.test/article',photo,coverFallback:!photo};
  context.card={isConnected:connected,dataset:{rssUrl:cardUrl}};
  context.draft={};context.current=current;
  context.draftPhoto=draftPhoto;
  runInContext('rssCands=[[current?entry:{...entry}]];articleDrafts.set(draft,{coverUrl:draftPhoto})',context);
  context.rssCardPhoto=async(card,entry)=>{decoded.push({card,entry,photo:entry.photo});return true;};
  return {context,storage,calls,decoded,project:()=>context.rssSelectedCover(context.entry,context.card,context.draft)};
}
test('selected photo uses the current discovery entry and retained card without extra fetch/storage',()=>{
  const fixture=selectedFixture();fixture.project();
  assert.equal(fixture.context.entry.photo,'https://images.test/selected.jpg');
  assert.equal(fixture.context.entry.coverFallback,false);assert.equal(fixture.decoded.length,1);
  assert.equal(fixture.decoded[0].entry,fixture.context.entry);assert.equal(fixture.decoded[0].card,fixture.context.card);
  assert.equal(fixture.context.card.dataset.photoStarted,'true');
  assert.equal(runInContext('rssCardIdentities.get(card)===rssCardIdentity(entry)',fixture.context),true);
  assert.equal(fixture.calls.length,0);assert.equal(fixture.storage.size,0);
});
test('a replaced source entry with the same URL cannot receive a late selected cover',()=>{
  const fixture=selectedFixture({current:false});fixture.project();
  assert.equal(fixture.context.entry.photo,'');assert.equal(fixture.decoded.length,0);
  assert.equal(runInContext('rssCands[0][0].photo',fixture.context),'');
});
test('detached or repurposed cards do not decode the selected source photo',()=>{
  for(const options of [{connected:false},{cardUrl:'https://stories.test/another'}]){
    const fixture=selectedFixture(options);fixture.project();
    assert.equal(fixture.context.entry.photo,'https://images.test/selected.jpg');
    assert.equal(fixture.decoded.length,0);assert.equal(fixture.context.card.dataset.photoStarted,undefined);
  }
});
test('a supplied discovery photo remains authoritative after article selection',()=>{
  const fixture=selectedFixture({photo:'https://images.test/supplied.jpg'});fixture.project();
  assert.equal(fixture.context.entry.photo,'https://images.test/supplied.jpg');assert.equal(fixture.decoded.length,0);
});
test('missing or excluded draft photos preserve the existing artwork',()=>{
  for(const draftPhoto of ['','https://images.test/avatar.jpg']){
    const fixture=selectedFixture({draftPhoto});fixture.project();
    assert.equal(fixture.context.entry.photo,'');assert.equal(fixture.context.entry.coverFallback,true);assert.equal(fixture.decoded.length,0);
  }
});
test('draft photo precedence is explicit cover, discovery photo, then existing body image',()=>{
  const {context}=runtime();
  for(const [cover,fallback,body,expected] of [
    ['https://images.test/og.jpg','https://images.test/feed.jpg','https://images.test/body.jpg','https://images.test/og.jpg'],
    ['','https://images.test/feed.jpg','https://images.test/body.jpg','https://images.test/feed.jpg'],
    ['','','https://images.test/body.jpg','https://images.test/body.jpg'],['','','',''],
  ]){
    const parsed={title:'The source story',paras:[prose],formatting:[],cover,blocks:[{r:'p',t:prose},...(body?[{r:'img',t:body}]:[])]};
    context.draft=context.makeArticleDraft(parsed,{sourceUrl:'https://stories.test/article'},fallback);
    assert.equal(runInContext('articleDrafts.get(draft).coverUrl',context),expected);
    assert.equal(context.draft.cover,null);assert.equal(context.books.length,0);
  }
});
