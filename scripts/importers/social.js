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
    cancelled:'이 글이 삭제되어 가져오기를 취소했어요.',
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
function socialLinkOnlyText(text){
  const value=String(text||'').trim();
  return /(?:https?:\/\/|pic\.twitter\.com\/)/i.test(value)
    && !value.replace(/(?:https?:\/\/|pic\.twitter\.com\/)[^\s<>]+/gi,'').replace(/[\s.,;:!?()[\]{}<>“”"'‘’—–-]/g,'');
}
// Only the known old oEmbed placeholder is eligible for an explicit reimport.
// A short real post, a manually pasted link and an image-only post stay intact.
function socialSavedNeedsRefresh(book){
  const source=socialUrlInfo(book?.sourceUrl);
  return book?.social?.platform==='x'&&book.social.extraction==='x-oembed'
    && book.social.scope==='single-post'&&source?.kind==='post'&&source.id===book.social.id
    && Array.isArray(book.paras)&&book.paras.length>1
    && book.paras.slice(1).every(text=>socialLinkOnlyText(text));
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
  copy.querySelectorAll('script,style,noscript,iframe,object,embed,form,button,svg,nav,[hidden],[aria-hidden="true"],blockquote.twitter-tweet,article,[data-testid="tweet"],[data-testid="quoteTweet"]').forEach(n=>n.remove());
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
      const poster=tag==='video'?socialHttpUrl(element.getAttribute('poster'),url):'';
      if(poster&&!ARTICLE_IMG_BAD.test(poster)&&blocks.filter(b=>b.r==='img').length<ARTICLE_IMG_MAX)
        blocks.push({r:'img',t:poster,alt:'Video preview'});
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
      if(child.nodeType===1&&(/^(BR|P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|IMG|VIDEO|AUDIO)$/.test(child.nodeName)
        ||/** @type {Element} */(child).querySelector('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figure,br,img,video,audio'))){
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
  const hasImage=blocks.some(b=>b.r==='img');
  if(prose.trim().length<2&&!hasImage)throw socialImportError('unavailable');
  if(socialLinkOnlyText(prose)&&!hasImage)throw socialImportError('incomplete');
  if(socialHasCutoff(prose))throw socialImportError('incomplete');
  if(info.kind==='article'&&prose.length<ARTICLE_MIN_CHARS)throw socialImportError('incomplete');
  const author=String(meta.author||'').slice(0,160),site=info.platform==='x'?'X':'Threads';
  const title=String(meta.title||blocks.find(b=>b.r!=='img')?.t||site).replace(/\s+/g,' ').trim().slice(0,180);
  return {title,site,author,publishedAt:String(meta.date||'').slice(0,80),url:info.url,cover:blocks.find(b=>b.r==='img')?.t||'',blocks,
    contentType:info.kind==='article'?'social-article':'social-post',
    social:{platform:info.platform,id:info.id,scope:info.kind==='article'?'article':'single-post',extraction:meta.extraction||'public-html'},
    ...articleAssemble(title,blocks)};
}
/* Public X Article HTML declares its document identity and a separate rendered
   body. Status shares use the same ID in this markup. Require that declaration,
   the page canonical and the enclosing post's own permalink to agree; never
   select the longest article or read hydration/private state to guess an owner. */
function socialIsArticleScope(node){
  return String(node.getAttribute('itemtype')||'').split(/\s+/).some(type=>/^https?:\/\/schema\.org\/(Article|BlogPosting|NewsArticle)$/.test(type));
}
function socialArticleScopeOf(node){
  for(let scope=node.closest('[itemscope][itemtype]');scope;scope=scope.parentElement?.closest('[itemscope][itemtype]'))
    if(socialIsArticleScope(scope))return scope;
  return null;
}
function parseSocialXArticleDom(doc,info){
  if(info.platform!=='x')return null;
  const canonical=doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if(!canonical||!socialSameUrl(socialHttpUrl(canonical,info.url),info.url))return null;
  const articleScope='[itemscope][itemtype]';
  const sameDocument=raw=>{const candidate=socialUrlInfo(socialHttpUrl(raw,info.url));return candidate?.platform==='x'&&candidate.kind!=='unsupported'&&candidate.id===info.id;};
  for(const scope of doc.querySelectorAll(articleScope)){
    if(!socialIsArticleScope(scope))continue;
    if(scope.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'))continue;
    const own=selector=>[...scope.querySelectorAll(selector)].filter(node=>
      (node.hasAttribute('itemscope')?node.parentElement?.closest('[itemscope]'):node.closest('[itemscope]'))===scope);
    const value=node=>node?.getAttribute('content')||node?.getAttribute('href')||node?.textContent||'';
    const identities=[scope.getAttribute('itemid'),...own('[itemprop~="url"],[itemprop~="mainEntityOfPage"]').map(value)].filter(Boolean);
    if(!identities.length||!identities.every(sameDocument))continue;
    const post=scope.closest('article,[data-testid="tweet"]');
    if(!post||![...post.querySelectorAll('a[href]')].some(link=>
      link.closest('article,[data-testid="tweet"]')===post&&!link.closest('[data-testid="quoteTweet"],blockquote.twitter-tweet')
      &&sameDocument(link.getAttribute('href'))))continue;
    if(own('[itemprop~="isAccessibleForFree"]').some(node=>/^false$/i.test(value(node).trim())))throw socialImportError('restricted');
    const body=own('[itemprop~="articleBody"],.x-article-body,[data-testid="twitterArticleRichTextView"]')
      .find(node=>node.closest('article,[data-testid="tweet"]')===post);
    if(!body)continue;
    if(body.closest('[hidden],[aria-hidden="true"]'))continue;
    const cutoff='[data-truncated="true"],[data-testid="tweet-text-show-more-link"],[data-testid*="ShowMore"]';
    if(body.matches(cutoff)||body.querySelector(cutoff))throw socialImportError('incomplete');
    const copy=body.cloneNode(true);
    copy.querySelectorAll(articleScope).forEach(node=>{if(socialIsArticleScope(node))node.remove();});
    const blocks=socialDomBlocks(copy,info.url);
    const coverNode=own('[itemprop~="image"]').find(node=>node.tagName==='IMG'||value(node));
    const cover=socialHttpUrl(coverNode?.tagName==='IMG'?articleBestSrc(coverNode):value(coverNode),info.url);
    if(cover&&!ARTICLE_IMG_BAD.test(cover)&&!blocks.some(block=>block.r==='img'&&block.t===cover))
      blocks.unshift({r:'img',t:cover,alt:coverNode?.getAttribute('alt')||''});
    let photos=0;
    const author=own('[itemprop~="author"]')[0];
    return socialAssemble({...info,kind:'article'},blocks.filter(block=>block.r!=='img'||++photos<=ARTICLE_IMG_MAX),{
      title:value(own('[itemprop~="headline"]')[0]),author:value(author?.querySelector('[itemprop~="name"]')),
      date:value(own('[itemprop~="datePublished"]')[0]),extraction:'x-article-dom'});
  }
  return null;
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
    const blocks=/** @type {any[]} */(socialPlainBlocks(text));
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
  const article=parseSocialXArticleDom(doc,info);if(article)return article;
  if(info.kind==='post'){
    for(const post of doc.querySelectorAll('article,[data-testid="tweet"]')){
      const time=[...post.querySelectorAll('time')].find(n=>n.closest('article,[data-testid="tweet"]')===post);
      const permalink=time?.closest('a')?.getAttribute('href');
      if(!socialSameUrl(socialHttpUrl(permalink,url),url))continue;
      if(post.querySelector('[data-testid="tweet-text-show-more-link"],[data-truncated="true"]'))throw socialImportError('incomplete');
      const body=[...post.querySelectorAll('[data-testid="tweetText"],[itemprop="articleBody"]')].find(n=>
        n.closest('article,[data-testid="tweet"]')===post&&!socialArticleScopeOf(n)&&!n.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'));
      const blocks=body?socialDomBlocks(body,url):[];
      for(const image of post.querySelectorAll('[data-testid="tweetPhoto"] img')){
        if(image.closest('article,[data-testid="tweet"]')!==post||socialArticleScopeOf(image)||image.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'))continue;
        const src=socialHttpUrl(articleBestSrc(image),url);
        if(src&&!ARTICLE_IMG_BAD.test(src)&&!articleTooSmall(image)&&!blocks.some(block=>block.r==='img'&&block.t===src)
          &&blocks.filter(block=>block.r==='img').length<ARTICLE_IMG_MAX)blocks.push({r:'img',t:src,alt:(image.getAttribute('alt')||'').slice(0,500)});
      }
      if(blocks.length)return socialAssemble(info,blocks,{author:post.querySelector('[data-testid="User-Name"]')?.textContent,
        date:time?.getAttribute('datetime')});
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
    // Prefer the public page: an embed may contain only an Article short link,
    // or omit post photos. A rich success takes one source request. One official
    // embed remains a short-post fallback within the same overall deadline.
    if(providedHtml===undefined){
      const endpoint=articleProxyUrl(info.url);
      try{
        const text=await requestText(endpoint||info.url,3200000);
        const payload=endpoint?JSON.parse(text):{html:text,url:info.url};
        if(!payload||typeof payload.html!=='string'||!socialSameUrl(payload.url||info.url,info.url))throw socialImportError('unavailable');
        return parseSocialHtml(payload.html,info.url);
      }catch(error){
        if(['social_rate_limited','social_restricted','social_oversized'].includes(error.code))throw error;
        if(lastError.code!=='social_incomplete')lastError=error;
      }
    }
    if(info.platform==='x'&&info.kind==='post'){
      const endpoint=articleProxyUrl(info.url,'x-oembed')||'https://publish.x.com/oembed?omit_script=1&dnt=1&hide_thread=1&url='+encodeURIComponent(info.url);
      try{const data=JSON.parse(await requestText(endpoint,150000));return parseSocialOembed(data,info.url);}
      catch(error){
        if(['social_rate_limited','social_restricted','social_oversized'].includes(error.code))throw error;
        if(lastError.code!=='social_incomplete')lastError=error;
      }
    }
    throw lastError;
  }catch(error){if(controller.signal.aborted)throw socialImportError('timeout');throw error?.code?.startsWith('social_')?error:socialImportError('unavailable');}
  finally{clearTimeout(timer);socialImportsActive--;}
}
