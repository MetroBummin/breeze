import {FEEDS} from './feeds.mjs';
import {VERSION} from './jev.mjs';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey,authorization,content-type,x-client-info','Access-Control-Allow-Methods':'GET,OPTIONS'};
const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
export function qualityHandler(service,schedule) {
  return async request=>{
    if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(request.method!=='GET')return reply({error:'method'},405);
    const params=new URL(request.url).searchParams,raw=params.get('feed');
    if([...params.keys()].length!==1 || !raw || !/^(?:[0-9]|1[0-2])$/.test(raw) || !FEEDS[Number(raw)])return reply({error:'feed'},400);
    try {
      const entries=await service.read(Number(raw));
      schedule(service.refresh(Number(raw)).catch(()=>{}));
      return reply({version:VERSION,entries,pending:entries.length===0,retryAfter:entries.length ? 600 : 15});
    } catch {return reply({error:'quality_unavailable'},503);}
  };
}
