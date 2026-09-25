/* Public social permalinks are not generic articles. Only the requested post's
   explicit body enters Reader: never OG descriptions, timelines or hidden APIs. */
const SOCIAL_HOSTS = new Set(['x.com','twitter.com','www.x.com','www.twitter.com','mobile.twitter.com','mobile.x.com',
  'threads.net','threads.com','www.threads.net','www.threads.com']);
function socialUrlInfo(raw){
  let u;try{u=new URL(raw);}catch{return null;}
  if(!SOCIAL_HOSTS.has(u.hostname.toLowerCase()))return null;
  const platform=u.hostname.includes('threads.')?'threads':'x';
  const invalid={platform,kind:'unsupported',id:'',url:u.href,key:u.href};
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port)return invalid;
  let match;
  if(platform==='x'){
    match=u.pathname.match(/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/);
    if(match)return {platform,kind:'post',id:match[1],url:'https://x.com'+u.pathname.replace(/\/(?:photo|video)\/\d+\/?$/,'').replace(/\/$/,''),key:'https://x.com/i/web/status/'+match[1]};
    match=u.pathname.match(/^\/(?:i|[A-Za-z0-9_]+)\/article\/(\d{1,25})\/?$/);
    if(match)return {platform,kind:'article',id:match[1],url:'https://x.com/i/article/'+match[1],key:'https://x.com/i/article/'+match[1]};
  }else{
    match=u.pathname.match(/^\/@[A-Za-z0-9_.]+\/post\/([A-Za-z0-9_-]{1,64})\/?$/);
    if(match)return {platform,kind:'post',id:match[1],url:'https://www.threads.com'+u.pathname.replace(/\/$/,''),key:'threads:post:'+match[1]};
  }
  return invalid;
}
function socialImportError(code){
  const messages={
    unsupported:'프로필·검색 주소가 아닌 게시글이나 아티클의 개별 링크를 넣어 주세요.',
    unavailable:'공개 응답에서 이 게시글 본문을 확인하지 못했어요. 원문에서 접근 가능 여부를 확인해 주세요.',
    restricted:'로그인·공개 범위·구독 제한 때문에 본문을 가져올 수 없어요.',
    incomplete:'잘린 발췌만 확인돼 전체 글로 저장하지 않았어요. 원문을 열어 확인해 주세요.',
    rate_limited:'원문 서비스의 요청 제한에 걸렸어요. 잠시 뒤 다시 시도해 주세요.',
    timeout:'원문 응답이 늦어 가져오기를 중단했어요. 다시 시도할 수 있어요.',
    busy:'다른 링크를 가져오는 중이에요. 잠시 뒤 다시 시도해 주세요.',
    oversized:'안전하게 처리할 수 있는 게시글 크기를 넘었어요.',
  };
  return Object.assign(new Error(messages[code]||messages.unavailable),{code:'social_'+code});
}
function socialSameUrl(a,b){
  const left=socialUrlInfo(a),right=socialUrlInfo(b);
  return !!left&&!!right&&left.kind!=='unsupported'&&left.key===right.key;
}
function socialHttpUrl(raw,base){
  const value=articleAbsolute(raw,base);if(!value)return '';
  const u=new URL(value);return u.username||u.password?'':u.href;
}
function socialPlainBlocks(text){
  return String(text||'').replace(/\r\n?/g,'\n').split(/\n+/).map(t=>t.trim()).filter(Boolean).map(t=>({r:'p',t,marks:[...t.matchAll(/https?:\/\/[^\s<>]+/g)].flatMap(m=>{
    const href=socialHttpUrl(m[0],m[0]);return href?[{kind:'link',href,start:m.index,end:m.index+m[0].length}]:[];
  })}));
}
function socialHasCutoff(text){
  return /(?:show more|read (?:the full (?:article|post)|more)|continue reading|subscribe to (?:read|continue))\s*[.→»]*$/i.test(text)||/(?:…|\.{3})\s*(?:https?:\/\/\S+)?\s*$/.test(text);
}
function socialDocument(html){
  if(typeof html!=='string'||html.length>3000000)throw socialImportError('oversized');
  const doc=new DOMParser().parseFromString(html,'text/html');
  if(doc.querySelectorAll('*').length>25000)throw socialImportError('oversized');
  return doc;
}
/* Build owned semantic blocks from an inert subtree; BR is a post line break.
   Attributes and script content never cross into the live app. */
function socialDomBlocks(root,url){
  const copy=/** @type {Element} */(root.cloneNode(true));
  copy.querySelectorAll('script,style,noscript,iframe,object,embed,form,button,svg,nav,[hidden],[aria-hidden="true"],blockquote.twitter-tweet').forEach(n=>n.remove());
  const blocks=[];
  const addLine=node=>{
    const value=articleInline(node,url);
    if(value.t)blocks.push({r:node.closest('blockquote')?'quote':'p',...value});
  };
  function visit(node){
    if(node.nodeType===3){const t=node.textContent.trim();if(t)blocks.push({r:'p',t,marks:[]});return;}
    if(node.nodeType!==1)return;
    const element=/** @type {Element} */(node),tag=element.tagName.toLowerCase();
    if(tag==='img'){
      const src=socialHttpUrl(articleBestSrc(element),url);
      if(src&&!ARTICLE_IMG_BAD.test(src)&&!articleTooSmall(element)&&blocks.filter(b=>b.r==='img').length<ARTICLE_IMG_MAX)
        blocks.push({r:'img',t:src,alt:(element.getAttribute('alt')||'').slice(0,500)});
      return;
    }
    if(tag==='video'||tag==='audio'){
      blocks.push({r:'p',t:tag==='video'?'[Video — open the original post]':'[Audio — open the original post]',marks:[]});return;
    }
    if(!element.querySelector('p,div,h1,h2,h3,h4,li,blockquote,pre,figure,br,img,video,audio')){
      const value=articleInline(element,url);if(!value.t)return;
      blocks.push({r:tag==='pre'?'code':/^h[1-6]$/.test(tag)?'h2':tag==='blockquote'||element.closest('blockquote')?'quote':'p',...value,
        ...(tag==='li'?{list:element.parentElement?.tagName==='OL'?String([...element.parentElement.children].indexOf(element)+1)+'.':'•'}:{}),
        ...(tag==='figcaption'?{caption:true}:{})});return;
    }
    // Inline runs around BRs keep links/emphasis and actual newline boundaries.
    let run=document.createElement('span');
    const flush=()=>{addLine(run);run=document.createElement('span');};
    for(const child of element.childNodes){
      if(child.nodeType===1&&/^(BR|P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|IMG|VIDEO|AUDIO)$/.test(child.nodeName)){
        flush();if(child.nodeName!=='BR')visit(child);
      }else run.appendChild(child.cloneNode(true));
    }
    flush();
  }
  visit(copy);return blocks;
}
/** @param {any} info @param {any[]} blocks @param {any} [meta] */
function socialAssemble(info,blocks,meta={}){
  const prose=blocks.filter(b=>b.r!=='img').map(b=>b.t).join('\n');
  if(prose.length>120000||blocks.length>800)throw socialImportError('oversized');
  if(prose.trim().length<2)throw socialImportError('unavailable');
  if(socialHasCutoff(prose))throw socialImportError('incomplete');
  if(info.kind==='article'&&prose.length<ARTICLE_MIN_CHARS)throw socialImportError('incomplete');
  const author=String(meta.author||'').slice(0,160),site=info.platform==='x'?'X':'Threads';
  const title=String(meta.title||blocks.find(b=>b.r!=='img')?.t||site).replace(/\s+/g,' ').trim().slice(0,180);
  return {title,site,author,publishedAt:String(meta.date||'').slice(0,80),url:info.url,cover:blocks.find(b=>b.r==='img')?.t||'',blocks,
    contentType:info.kind==='article'?'social-article':'social-post',
    social:{platform:info.platform,id:info.id,scope:info.kind==='article'?'article':'single-post',extraction:meta.extraction||'public-html'},
    ...articleAssemble(title,blocks)};
}
function parseSocialHtml(html,url){
  const info=socialUrlInfo(url);if(!info||info.kind==='unsupported')throw socialImportError('unsupported');
  const doc=socialDocument(html);
  const canonical=doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  // Never import a login page, redirected profile, or a different post as target.
  if(canonical&&!socialSameUrl(socialHttpUrl(canonical,url),url))throw socialImportError('unavailable');
  const nodes=[];
  const collect=(value,depth=0)=>{
    if(!value||typeof value!=='object'||depth>8||nodes.length>=500)return;
    if(Array.isArray(value)){for(const item of value.slice(0,500))collect(item,depth+1);return;}
    nodes.push(value);collect(value['@graph'],depth+1);collect(value.mainEntity,depth+1);
    // Deliberately no recursion through comments, replies, recommendations or quoted posts.
  };
  for(const script of [...doc.querySelectorAll('script[type="application/ld+json"]')].slice(0,20)){
    if(script.textContent.length>500000)continue;
    try{collect(JSON.parse(script.textContent));}catch{}
  }
  const identity=value=>typeof value==='string'?value:value?.['@id']||value?.url||'';
  for(const node of nodes){
    const types=(Array.isArray(node['@type'])?node['@type']:[node['@type']]).map(v=>String(v||'').split('/').pop());
    if(!types.some(t=>['SocialMediaPosting','DiscussionForumPosting','Article','BlogPosting','NewsArticle'].includes(t)))continue;
    if(![node.url,node['@id'],node.mainEntityOfPage].some(v=>socialSameUrl(socialHttpUrl(identity(v),url),url)))continue;
    if(node.isAccessibleForFree===false||node.isAccessibleForFree==='false')throw socialImportError('restricted');
    const text=node.articleBody||node.text;
    if(typeof text!=='string')continue; // OG/JSON-LD description is never a full body.
    if(socialHasCutoff(text))throw socialImportError('incomplete');
    const blocks=socialPlainBlocks(text);
    const images=Array.isArray(node.image)?node.image:[node.image];
    for(const image of images.slice(0,ARTICLE_IMG_MAX)){
      const src=socialHttpUrl(typeof image==='string'?image:image?.url||image?.contentUrl,url);
      if(src&&!ARTICLE_IMG_BAD.test(src))blocks.push({r:'img',t:src,alt:String(image?.caption||'').slice(0,500)});
    }
    if(node.video||node.audio)blocks.push({r:'p',t:node.video?'[Video — open the original post]':'[Audio — open the original post]',marks:[]});
    return socialAssemble(info,blocks,{title:node.headline,author:typeof node.author==='string'?node.author:node.author?.name,
      date:node.datePublished,extraction:'jsonld'});
  }
  if(/"isAccessibleForFree"\s*:\s*(false|"false")/i.test(html))throw socialImportError('restricted');
  if(info.kind==='article'){
    const body=doc.querySelector('[data-testid="twitterArticleRichTextView"]');
    if(body&&canonical){
      if(body.querySelector('[data-testid*="ShowMore"],[aria-expanded="false"]'))throw socialImportError('incomplete');
      return socialAssemble(info,socialDomBlocks(body,url),{title:doc.querySelector('h1')?.textContent});
    }
  }else{
    for(const post of doc.querySelectorAll('article,[data-testid="tweet"]')){
      const permalink=post.querySelector('time')?.closest('a')?.getAttribute('href');
      if(!socialSameUrl(socialHttpUrl(permalink,url),url))continue;
      if(post.querySelector('[data-testid="tweet-text-show-more-link"],[data-truncated="true"]'))throw socialImportError('incomplete');
      const body=post.querySelector('[data-testid="tweetText"],[itemprop="articleBody"]');
      if(body)return socialAssemble(info,socialDomBlocks(body,url),{author:post.querySelector('[data-testid="User-Name"]')?.textContent,
        date:post.querySelector('time')?.getAttribute('datetime')});
    }
  }
  throw socialImportError('unavailable');
}
function parseSocialOembed(data,url){
  const info=socialUrlInfo(url);
  if(!info||info.platform!=='x'||info.kind!=='post'||!data||typeof data.html!=='string'||data.html.length>100000||!socialSameUrl(data.url,url))throw socialImportError('unavailable');
  const doc=socialDocument(data.html);
  const root=[...doc.querySelectorAll('blockquote.twitter-tweet')].find(block=>
    [...block.children].some(n=>n.tagName==='A'&&socialSameUrl(socialHttpUrl(n.getAttribute('href'),url),url)));
  if(!root)throw socialImportError('unavailable');
  const body=[...root.children].find(n=>n.tagName==='P');
  if(!body)throw socialImportError('unavailable');
  // Article cards are links to another document, not the Article body.
  if([...body.querySelectorAll('a[href]')].some(a=>socialUrlInfo(socialHttpUrl(a.getAttribute('href'),url))?.kind==='article'))throw socialImportError('incomplete');
  return socialAssemble(info,socialDomBlocks(body,url),{author:data.author_name,extraction:'x-oembed'});
}
async function socialResponseText(response,signal,max=3000000){
  if(!response.ok){
    if(response.body)void response.body.cancel().catch(()=>{});
    throw socialImportError(response.status===429?'rate_limited':[401,403].includes(response.status)?'restricted':'unavailable');
  }
  if(Number(response.headers.get('content-length'))>max){if(response.body)void response.body.cancel().catch(()=>{});throw socialImportError('oversized');}
  const reader=response.body?.getReader();if(!reader)throw socialImportError('unavailable');
  const chunks=[];let length=0;
  const abort=()=>{void reader.cancel().catch(()=>{});};signal.addEventListener('abort',abort,{once:true});
  try{
    for(;;){if(signal.aborted)throw socialImportError('timeout');const item=await reader.read();if(item.done)break;
      length+=item.value.byteLength;if(length>max)throw socialImportError('oversized');chunks.push(item.value);}
    if(signal.aborted)throw socialImportError('timeout');
    const bytes=new Uint8Array(length);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.byteLength;}
    return new TextDecoder().decode(bytes);
  }finally{signal.removeEventListener('abort',abort);void reader.cancel().catch(()=>{});}
}
let socialImportsActive=0;
/** @param {string} url @param {string} [providedHtml] */
async function loadSocialArticle(url,providedHtml){
  const info=socialUrlInfo(url);if(!info||info.kind==='unsupported')throw socialImportError('unsupported');
  if(socialImportsActive>=4)throw socialImportError('busy');
  socialImportsActive++;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),18000);
  let lastError=socialImportError('unavailable');
  const requestText=async(target,max=3000000)=>{
    const response=await fetch(target,{credentials:'omit',signal:controller.signal,headers:target.startsWith(SB_URL+'/')?{apikey:SB_KEY,Authorization:'Bearer '+SB_KEY}: {}});
    return socialResponseText(response,controller.signal,max);
  };
  try{
    if(providedHtml!==undefined){try{return parseSocialHtml(providedHtml,info.url);}catch(error){lastError=error;if(error.code==='social_restricted')throw error;}}
    // One public embed request, then at most one public page. No retry loops,
    // cookies, private GraphQL, third-party mirrors or conversation scraping.
    if(info.platform==='x'&&info.kind==='post'){
      const endpoint=articleProxyUrl(info.url,'x-oembed')||'https://publish.x.com/oembed?omit_script=1&dnt=1&hide_thread=1&url='+encodeURIComponent(info.url);
      try{const data=JSON.parse(await requestText(endpoint,150000));return parseSocialOembed(data,info.url);}
      catch(error){lastError=error;if(['social_rate_limited','social_restricted','social_oversized'].includes(error.code))throw error;}
    }
    if(providedHtml===undefined){
      const endpoint=articleProxyUrl(info.url);
      try{
        const text=await requestText(endpoint||info.url,3200000);
        const payload=endpoint?JSON.parse(text):{html:text,url:info.url};
        if(!payload||typeof payload.html!=='string'||!socialSameUrl(payload.url||info.url,info.url))throw socialImportError('unavailable');
        return parseSocialHtml(payload.html,info.url);
      }catch(error){if(lastError.code!=='social_incomplete')lastError=error;}
    }
    throw lastError;
  }catch(error){if(controller.signal.aborted)throw socialImportError('timeout');throw error?.code?.startsWith('social_')?error:socialImportError('unavailable');}
  finally{clearTimeout(timer);socialImportsActive--;}
}
