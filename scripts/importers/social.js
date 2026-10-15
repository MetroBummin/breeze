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
  // oEmbed appends media display labels, not necessarily the anchor's t.co URL.
  // Those labels must not conceal an ellipsis at the end of the actual prose.
  const prose=String(text||'').replace(/(?:\s+(?:https?:\/\/|pic\.(?:twitter|x)\.com\/)[^\s<>]+)+\s*$/i,'').trim();
  return /(?:show more|read (?:the full (?:article|post)|more)|continue reading|subscribe to (?:read|continue))\s*[.→»]*$/i.test(prose)||/(?:…|\.{3})\s*$/.test(prose);
}
function socialLinkOnlyText(text){
  const value=String(text||'').trim();
  return /(?:https?:\/\/|pic\.(?:twitter|x)\.com\/)/i.test(value)
    && !value.replace(/(?:https?:\/\/|pic\.(?:twitter|x)\.com\/)[^\s<>]+/gi,'').replace(/[\s.,;:!?()[\]{}<>“”"'‘’—–-]/g,'');
}
// Only known old oEmbed placeholders/excerpts are eligible for explicit reimport.
// A short real post, a manually pasted link and an image-only post stay intact.
function socialSavedNeedsRefresh(book){
  const source=socialUrlInfo(book?.sourceUrl);
  return book?.social?.platform==='x'&&book.social.extraction==='x-oembed'
    && book.social.scope==='single-post'&&source?.kind==='post'&&source.id===book.social.id
    && Array.isArray(book.paras)&&book.paras.length>1
    && (book.paras.slice(1).every(text=>socialLinkOnlyText(text))
      ||socialHasCutoff(book.paras.slice(1).filter(text=>!text.startsWith(IMG_MARK)).join('\n')));
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
  // X renders inline emoji as images. Only its emoji assets with an emoji-only
  // alt become text; photo descriptions and arbitrary remote images stay media.
  for(const image of copy.querySelectorAll('img[alt]')){
    const src=socialHttpUrl(image.getAttribute('src'),url),alt=image.getAttribute('alt')||'';
    if(!src||!alt||alt.length>64)continue;
    const asset=new URL(src);
    if(/^abs(?:-\d+)?\.twimg\.com$/i.test(asset.hostname)&&asset.pathname.startsWith('/emoji/')
      &&/^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\uFE0F|\u200D|[\u{E0020}-\u{E007F}]|[0-9#*]\uFE0F?\u20E3)+$/u.test(alt))
      image.replaceWith(document.createTextNode(alt));
  }
  const postLines=root.matches('[data-testid="tweetText"]');
  const preservesLines=element=>{
    for(let current=element;current;current=current===copy?root.parentElement:current.parentElement){
      const space=current.style?.whiteSpace;
      if(space)return /^(pre|pre-wrap|pre-line|break-spaces)$/i.test(space);
    }
    return postLines;
  };
  const blocks=[];
  const addLines=(node,meta,preserve)=>{
    let text='';const marks=[];
    const inline=(current,keepLines)=>{
      if(current.nodeType===3){
        const value=current.textContent.replace(/\r\n?/g,'\n');
        text+=keepLines?value.replace(/[^\S\n]+/g,' '):value.replace(/\s+/g,' ');return;
      }
      if(current.nodeType!==1)return;
      if(current.tagName==='BR'){text+='\n';return;}
      const space=current.style?.whiteSpace;
      if(space)keepLines=/^(pre|pre-wrap|pre-line|break-spaces)$/i.test(space);
      const start=text.length;
      for(const child of current.childNodes)inline(child,keepLines);
      const tag=current.tagName.toLowerCase();
      if(['strong','b','em','i','a'].includes(tag)){
        const href=tag==='a'?socialHttpUrl(current.getAttribute('href'),url):'';
        if(tag!=='a'||href)marks.push({start,end:text.length,kind:tag==='a'?'link':['b','strong'].includes(tag)?'strong':'em',href});
      }
    };
    inline(node,preserve);
    let offset=0;
    for(const line of text.split('\n')){
      const t=line.trim(),start=offset+line.length-line.trimStart().length,end=start+t.length;
      if(t)blocks.push({...meta,t,marks:marks.map(mark=>({...mark,start:Math.max(start,mark.start)-start,end:Math.min(end,mark.end)-start})).filter(mark=>mark.end>mark.start)});
      offset+=line.length+1;
    }
  };
  function visit(node){
    if(node.nodeType===3){addLines(node,{r:'p'},preservesLines(node.parentElement));return;}
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
    if(!element.querySelector('p,div,h1,h2,h3,h4,li,blockquote,pre,figure,img,video,audio')){
      addLines(element,{r:tag==='pre'?'code':/^h[1-6]$/.test(tag)?'h2':tag==='blockquote'||element.closest('blockquote')?'quote':'p',
        ...(tag==='li'?{list:element.parentElement?.tagName==='OL'?String([...element.parentElement.children].indexOf(element)+1)+'.':'•'}:{}),
        ...(tag==='figcaption'?{caption:true}:{})},preservesLines(element));return;
    }
    // Inline runs around BRs keep links/emphasis and actual newline boundaries.
    let run=document.createElement('span');
    const flush=()=>{addLines(run,{r:element.closest('blockquote')?'quote':'p'},preservesLines(element));run=document.createElement('span');};
    for(const child of element.childNodes){
      if(child.nodeType===1&&(/^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|FIGURE|FIGCAPTION|IMG|VIDEO|AUDIO)$/.test(child.nodeName)
        ||/** @type {Element} */(child).querySelector('p,div,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figure,img,video,audio'))){
        flush();visit(child);
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
  if(info.kind==='article'&&prose.length<ARTICLE_MIN_CHARS)throw socialImportError('incomplete');
  if(prose.trim().length<2&&!hasImage)throw socialImportError('unavailable');
  if(socialLinkOnlyText(prose)&&!hasImage)throw socialImportError('incomplete');
  if(socialHasCutoff(prose))throw socialImportError('incomplete');
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
function socialHasCutoffControl(root,post){
  const selector='[data-truncated="true"],[data-testid="tweet-text-show-more-link"],[data-testid*="ShowMore"]';
  const scope=socialArticleScopeOf(root);
  return [root,...root.querySelectorAll(selector)].some(node=>node.matches(selector)
    &&node.closest('article,[data-testid="tweet"]')===post&&socialArticleScopeOf(node)===scope
    &&!node.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'));
}
function parseSocialXArticleDom(doc,info){
  if(info.platform!=='x')return null;
  const canonical=doc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  if(!canonical||!socialSameUrl(socialHttpUrl(canonical,info.url),info.url))return null;
  const articleScope='[itemscope][itemtype]';
  let incomplete=false;
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
    if(!body||body.closest('[hidden],[aria-hidden="true"]')||socialHasCutoffControl(body,post)){incomplete=true;continue;}
    const copy=body.cloneNode(true);
    copy.querySelectorAll(articleScope).forEach(node=>{if(socialIsArticleScope(node))node.remove();});
    const blocks=socialDomBlocks(copy,info.url);
    const coverNode=own('[itemprop~="image"]').find(node=>node.tagName==='IMG'||value(node));
    const cover=socialHttpUrl(coverNode?.tagName==='IMG'?articleBestSrc(coverNode):value(coverNode),info.url);
    if(cover&&!ARTICLE_IMG_BAD.test(cover)&&!blocks.some(block=>block.r==='img'&&block.t===cover))
      blocks.unshift({r:'img',t:cover,alt:coverNode?.getAttribute('alt')||''});
    let photos=0;
    const author=own('[itemprop~="author"]')[0];
    try{
      return socialAssemble({...info,kind:'article'},blocks.filter(block=>block.r!=='img'||++photos<=ARTICLE_IMG_MAX),{
        title:value(own('[itemprop~="headline"]')[0]),author:value(author?.querySelector('[itemprop~="name"]')),
        date:value(own('[itemprop~="datePublished"]')[0]),extraction:'x-article-dom'});
    }catch(error){if(error.code!=='social_incomplete')throw error;incomplete=true;}
  }
  if(incomplete)throw socialImportError('incomplete');
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
  const owned=nodes.filter(node=>{
    const types=(Array.isArray(node['@type'])?node['@type']:[node['@type']]).map(v=>String(v||'').split('/').pop());
    return types.some(t=>['SocialMediaPosting','DiscussionForumPosting','Article','BlogPosting','NewsArticle'].includes(t))
      &&[node.url,node['@id'],node.mainEntityOfPage].some(v=>socialSameUrl(socialHttpUrl(identity(v),url),url));
  });
  if(owned.some(node=>node.isAccessibleForFree===false||node.isAccessibleForFree==='false'))throw socialImportError('restricted');
  const articleNode=node=>(Array.isArray(node['@type'])?node['@type']:[node['@type']])
    .some(type=>['Article','BlogPosting','NewsArticle'].includes(String(type||'').split('/').pop()));
  let requiresArticle=owned.some(articleNode);
  let incomplete=false;
  const candidate=read=>{
    try{return read();}catch(error){if(error.code!=='social_incomplete')throw error;incomplete=true;return null;}
  };
  // A declared, owned rendered Article is the full document. A post's JSON-LD
  // may be only its share teaser, even when both are in this same response.
  const article=candidate(()=>parseSocialXArticleDom(doc,info));if(article)return article;
  requiresArticle=requiresArticle||incomplete;
  const posts=[];
  if(info.kind==='post')for(const post of doc.querySelectorAll('article,[data-testid="tweet"]')){
    if(post.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'))continue;
    const time=[...post.querySelectorAll('time')].find(n=>n.closest('article,[data-testid="tweet"]')===post
      &&!n.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'));
    if(!socialSameUrl(socialHttpUrl(time?.closest('a')?.getAttribute('href'),url),url))continue;
    const body=[...post.querySelectorAll('[data-testid="tweetText"],[itemprop="articleBody"]')].find(n=>
      n.closest('article,[data-testid="tweet"]')===post&&!socialArticleScopeOf(n)&&!n.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'));
    posts.push({post,time,blocks:body?socialDomBlocks(body,url):[]});
  }
  // A declared Article cannot become its share teaser, and an explicitly cut
  // owned post cannot become shorter posting metadata from the same response.
  if(!requiresArticle&&posts.some(({post,blocks})=>socialHasCutoffControl(post,post)
    ||socialHasCutoff(blocks.filter(block=>block.r!=='img').map(block=>block.t).join('\n'))))throw socialImportError('incomplete');
  const restricted=/"isAccessibleForFree"\s*:\s*(false|"false")/i.test(html);
  const postingMeta=owned.find(node=>!articleNode(node));
  const readPost=({post,time,blocks:bodyBlocks})=>{
    if(restricted)throw socialImportError('restricted');
    const blocks=[...bodyBlocks];
    for(const image of post.querySelectorAll('[data-testid="tweetPhoto"] img')){
      if(image.closest('article,[data-testid="tweet"]')!==post||socialArticleScopeOf(image)||image.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'))continue;
      const src=socialHttpUrl(articleBestSrc(image),url);
      if(src&&!ARTICLE_IMG_BAD.test(src)&&!articleTooSmall(image)&&!blocks.some(block=>block.r==='img'&&block.t===src)
        &&blocks.filter(block=>block.r==='img').length<ARTICLE_IMG_MAX)blocks.push({r:'img',t:src,alt:(image.getAttribute('alt')||'').slice(0,500)});
    }
    const author=[...post.querySelectorAll('[data-testid="User-Name"]')].find(node=>
      node.closest('article,[data-testid="tweet"]')===post&&!node.closest('[hidden],[aria-hidden="true"],[data-testid="quoteTweet"],blockquote.twitter-tweet'))?.textContent;
    return blocks.length?candidate(()=>socialAssemble(info,blocks,{
      author:author||(typeof postingMeta?.author==='string'?postingMeta.author:postingMeta?.author?.name),
      date:time?.getAttribute('datetime')||postingMeta?.datePublished})):null;
  };
  // Prefer a rendered owned text body over a complete-looking metadata teaser.
  // Photo-only DOM waits until structured text has had a chance to supply prose.
  if(!requiresArticle)for(const post of posts){
    const prose=post.blocks.filter(block=>block.r!=='img').map(block=>block.t).join('\n').trim();
    if(prose.length<2||socialLinkOnlyText(prose))continue;
    const parsed=readPost(post);if(parsed)return parsed;
  }
  for(const node of owned){
    if(requiresArticle&&!articleNode(node))continue;
    const text=node.articleBody||node.text;
    if(typeof text!=='string')continue; // OG/JSON-LD description is never a full body.
    if(socialHasCutoff(text)){incomplete=true;continue;}
    const blocks=/** @type {any[]} */(socialPlainBlocks(text));
    const images=Array.isArray(node.image)?node.image:[node.image];
    for(const image of images.slice(0,ARTICLE_IMG_MAX)){
      const src=socialHttpUrl(typeof image==='string'?image:image?.url||image?.contentUrl,url);
      if(src&&!ARTICLE_IMG_BAD.test(src))blocks.push({r:'img',t:src,alt:String(image?.caption||'').slice(0,500)});
    }
    if(node.video||node.audio)blocks.push({r:'p',t:node.video?'[Video — open the original post]':'[Audio — open the original post]',marks:[]});
    const kind=articleNode(node)?'article':info.kind;
    const parsed=candidate(()=>socialAssemble({...info,kind},blocks,{title:node.headline,author:typeof node.author==='string'?node.author:node.author?.name,
      date:node.datePublished,extraction:'jsonld'}));
    if(parsed)return parsed;
  }
  if(restricted)throw socialImportError('restricted');
  if(!requiresArticle)for(const post of posts){const parsed=readPost(post);if(parsed)return parsed;}
  throw socialImportError(incomplete||requiresArticle?'incomplete':'unavailable');
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
    if(providedHtml!==undefined){try{return parseSocialHtml(providedHtml,info.url);}catch(error){lastError=error;if(['social_restricted','social_incomplete','social_oversized'].includes(error.code))throw error;}}
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
        if(['social_rate_limited','social_restricted','social_oversized','social_incomplete'].includes(error.code))throw error;
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
