/* A fixed public X oEmbed endpoint, not a generic JSON proxy. No credentials,
   session cookies, private API or alternate mirror. Existing SSRF transport only. */
export function xPostIdentity(raw){
  let u;try{u=new URL(raw);}catch{return '';}
  if(!['x.com','twitter.com','www.x.com','www.twitter.com','mobile.twitter.com','mobile.x.com'].includes(u.hostname)||u.username||u.password||u.port||!['http:','https:'].includes(u.protocol))return '';
  return u.pathname.match(/^\/(?:[A-Za-z0-9_]+|i\/web)\/status\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/)?.[1]||'';
}
export async function fetchXEmbed(url,signal,transport){
  const id=xPostIdentity(url);if(!id)return {status:400,body:{error:'social_unsupported',message:'게시글의 개별 링크를 넣어 주세요.'}};
  const target=new URL('https://publish.x.com/oembed');
  target.searchParams.set('url',url);target.searchParams.set('omit_script','1');target.searchParams.set('hide_thread','1');target.searchParams.set('dnt','1');
  const result=await transport(target.href,{signal,limit:150000,headers:{Accept:'application/json'}});
  if(result.status<200||result.status>=300){
    const status=[401,403,404,410,429].includes(result.status)?result.status:502;
    return {status,body:{error:status===429?'social_rate_limited':'social_unavailable',message:'공개 게시글을 가져오지 못했어요. 원문을 확인해 주세요.'}};
  }
  let data;try{data=JSON.parse(new TextDecoder().decode(result.bytes));}catch{return {status:502,body:{error:'social_response'}};}
  if(!data||!['Twitter','X'].includes(data.provider_name)||xPostIdentity(data.url)!==id||typeof data.html!=='string'||data.html.length>100000)
    return {status:502,body:{error:'social_response'}};
  return {status:200,body:{url:data.url,html:data.html,author_name:String(data.author_name||'').slice(0,160)}};
}
