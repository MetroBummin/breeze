/* Preview invitation timing. No network, model, or persistent book write. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,Script} from 'node:vm';

function element(tag){
  return {tag,className:'',id:'',hidden:false,textContent:'',innerHTML:'',open:false,dataset:{},
    attributes:{},children:[],parent:null,scrollTop:0,src:'',onclick:null,style:{},
    setAttribute(name,value){this.attributes[name]=String(value);},
    getAttribute(name){return this.attributes[name]??null;},
    removeAttribute(name){delete this.attributes[name];if(name==='src')this.src='';},
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}},
    prepend(...nodes){for(const node of [...nodes].reverse()){node.parent=this;this.children.unshift(node);}},
    after(node){const list=this.parent?.children||[];const at=list.indexOf(this);node.parent=this.parent;list.splice(at+1,0,node);},
    addEventListener(){},
    showModal(){this.open=true;},
    close(){this.open=false;},
    focus(){},
    querySelector(selector){return query(this,selector);}
  };
}
function tokenMatch(node,token){
  const match=/^([a-z0-9-]*)(?:\.([a-z0-9-]+))?$/i.exec(token);
  if(!match||(!match[1]&&!match[2]))return false;
  if(match[1]&&node.tag!==match[1])return false;
  return !match[2]||node.className.split(/\s+/).includes(match[2]);
}
function query(root,selector){
  const tokens=selector.trim().split(/\s+/);
  function walk(node,index){
    for(const child of node.children||[]){
      if(tokenMatch(child,tokens[index])){
        if(index===tokens.length-1)return child;
        const nested=walk(child,index+1);
        if(nested)return nested;
      }
      const deeper=walk(child,index);
      if(deeper)return deeper;
    }
    return null;
  }
  return walk(root,0);
}
function mount(){
  const dialog=element('dialog');dialog.id='article-preview';
  const sheet=element('div');sheet.className='ap-sheet';
  const close=element('button');close.className='ap-close';
  const scroll=element('div');scroll.className='ap-scroll';
  const hero=element('div');hero.className='ap-hero';
  const image=element('img');const art=element('div');art.className='ap-art';
  const content=element('div');content.className='ap-content';
  const source=element('p');source.className='ap-source';
  const title=element('h2');title.className='ap-title';
  const summary=element('p');summary.className='ap-summary';summary.hidden=true;
  const actions=element('div');actions.className='ap-actions';
  const start=element('button');start.className='ap-start';
  hero.append(image,art);content.append(source,title,summary);scroll.append(hero,content);
  actions.append(start);sheet.append(close,scroll,actions);dialog.append(sheet);
  const requests=[];
  let release=null;
  const context=createContext({
    URL,Date,TextEncoder,TextDecoder,Uint8Array,Response,AbortController,AbortSignal,Promise,queueMicrotask,setTimeout,clearTimeout,
    console:{warn(){},error(){}},
    document:{getElementById:id=>id==='article-preview'?dialog:null,createElement:element},
    window:{addEventListener(){}},
    navigator:{onLine:true},
    localStorage:{values:new Map(),getItem(key){return this.values.get(key)??null;},setItem(key,value){this.values.set(key,String(value));}},
    IMG_MARK:'[[IMG]]:',SB_URL:'https://relay.example',SB_KEY:'synthetic-public-key',LONG_READS:[],books:[],
    articleDrafts:new WeakMap(),
    articleUrlKey(raw){const url=new URL(raw);url.hash='';return url.href;},
    deviceId(){return 'fixture-device';},
    posOf(){return {t:0};},
    cancelPendingBookOpen(){},
    coverArtwork(){return '';},
    bookImageBlob:async()=>null,
    commitArticleDraft:async book=>book,
    openBook:async()=>{throw Error('reader failed');},
    importLongRead:async()=>{throw Error('unused');},
    toast(){},
    sb:{auth:{getSession:async()=>({data:{session:null}})}},
    fetch:(_url,init)=>new Promise(resolve=>{requests.push({resolve,body:init?.body||''});release=resolve;})
  });
  new Script(readFileSync(new URL('../scripts/library/article-preview.js',import.meta.url),'utf8')).runInContext(context);
  return {context,dialog,summary,requests,respond(){
    const summaryKo='피드 요약만으로도 이 글의 긴장과 배경을 먼저 보여 줍니다. 본문이 늦어도 읽을 이유는 남습니다.';
    release(new Response(JSON.stringify({promptVersion:5,summaryKo}),{status:200,headers:{'Content-Type':'application/json'}}));
    return summaryKo;
  }};
}
const lead='The feed summary explains the stakes of this public article with enough detail to invite a reader before the full page arrives.';
async function flush(){await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));}

test('feed summary requests the invitation before the body, and body replacement keeps it',async()=>{
  const preview=mount();
  const card={querySelector:()=>null};
  const preparation=preview.context.articlePreviewPrepare({
    title:'Public story',source:'Example',url:'https://stories.example/one',summary:lead
  },card);
  await flush();
  assert.equal(preview.requests.length,1);
  assert.equal(preview.dialog.dataset.metadata,'loading');
  const book={id:'preview:https://stories.example/one',kind:'article',title:'Public story',site:'Example',
    sourceUrl:'https://stories.example/one',paras:[lead+' The parsed body adds another grounded paragraph for the reader to judge.']};
  preparation.finish(book);
  assert.equal(preview.requests.length,1,'A fuller excerpt must not start a second invitation');
  const summaryKo=preview.respond();
  await flush();
  assert.equal(preview.summary.hidden,false);
  assert.equal(preview.summary.textContent,summaryKo);
  assert.equal(preview.dialog.dataset.metadata,'ready');
});

test('a failed Read still shows an invitation that arrived while opening',async()=>{
  const preview=mount();
  const book={id:'a',kind:'article',title:'Public story',site:'Example',sourceUrl:'https://stories.example/two',
    paras:[lead]};
  preview.context.openCasualPreviewOrReader(book);
  await flush();
  assert.equal(preview.requests.length,1);
  let opened=false;
  preview.context.openBook=async()=>{
    opened=true;preview.respond();await flush();
    throw Error('reader failed');
  };
  await preview.context.articlePreviewStart();
  assert.equal(opened,true);
  assert.equal(preview.dialog.open,true);
  assert.equal(preview.summary.hidden,false);
  assert.equal(preview.dialog.dataset.metadata,'ready');
});

test('forty characters of feed summary stay, and a shorter summary yields to the body',async()=>{
  const enough='x'.repeat(40);
  const kept=mount();
  const preparation=kept.context.articlePreviewPrepare({
    title:'Public story',source:'Example',url:'https://stories.example/enough',summary:`\n\n${enough}  `
  },{querySelector:()=>null});
  await flush();
  assert.equal(kept.requests.length,1);
  assert.equal(JSON.parse(kept.requests[0].body).excerpt,enough);
  preparation.finish({id:'preview:enough',kind:'article',title:'Public story',site:'Example',
    sourceUrl:'https://stories.example/enough',
    paras:['The parsed body adds a grounded paragraph that must not replace a sufficient feed summary.']});
  assert.equal(kept.requests.length,1,'A sufficient feed summary stays when the body arrives');

  const paragraph='HYBRID body paragraph. The parsed article now supplies the first paragraph a reader can judge.';
  for(const summary of ['Brief.','',`  ${'y'.repeat(39)}\n`]){
    const preview=mount();
    const pending=preview.context.articlePreviewPrepare({
      title:'Public story',source:'Example',url:'https://stories.example/short',summary
    },{querySelector:()=>null});
    await flush();
    assert.equal(preview.requests.length,0,'A missing or short summary must not request an invitation');
    pending.finish({id:'preview:short',kind:'article',title:'Public story',site:'Example',
      sourceUrl:'https://stories.example/short',paras:[paragraph,'A later paragraph stays out of the first invitation.']});
    await flush();
    assert.equal(preview.requests.length,1);
    assert.equal(JSON.parse(preview.requests[0].body).excerpt.startsWith(paragraph),true);
  }
});

test('body failure keeps a ready invitation visible',async()=>{
  const preview=mount();
  const preparation=preview.context.articlePreviewPrepare({
    title:'Public story',source:'Example',url:'https://stories.example/three',summary:lead
  },{querySelector:()=>null});
  await flush();
  const summaryKo=preview.respond();
  await flush();
  preparation.fail(()=>{});
  assert.equal(preview.summary.textContent,summaryKo);
  assert.equal(preview.dialog.dataset.metadata,'ready');
  assert.equal(preview.dialog.open,true);
});
