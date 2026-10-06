// Pure head-completion scanner copied unchanged from PR104 at 7121c0f.
// Shared extraction still belongs to server/article/cover-metadata.mjs.
export function rssCoverHeadComplete(html){
  let at=0,templates=0;
  while(at<html.length){
    const start=html.indexOf('<',at);if(start<0)return false;
    if(html.startsWith('<!--',start)){
      const end=html.indexOf('-->',start+4);if(end<0)return false;
      at=end+3;continue;
    }
    let end=start+1,quote='';
    for(;end<html.length;end++){
      const char=html[end];
      if(quote){if(char===quote)quote='';}
      else if(char==='"'||char==="'")quote=char;
      else if(char==='>')break;
    }
    if(end===html.length)return false;
    const tag=/^<\/?([a-z][\w:-]*)\b/i.exec(html.slice(start,end+1));at=end+1;
    if(!tag)continue;
    const name=tag[1].toLowerCase(),closing=html[start+1]==='/';
    if(!templates&&(closing&&name==='head'||!closing&&name==='body'))return true;
    if(name==='template')templates=Math.max(0,templates+(closing?-1:1));
    if(!closing&&name==='plaintext')return false;
    if(!closing&&/^(script|style|noscript|title|textarea|xmp|iframe|noembed|noframes|plaintext)$/.test(name)){
      const close=new RegExp('</'+name+'\\s*>','ig');close.lastIndex=at;
      const match=close.exec(html);if(!match)return false;
      at=close.lastIndex;
    }
  }
  return false;
}
