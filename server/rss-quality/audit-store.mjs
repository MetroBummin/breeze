import {LEDGER_ID} from './audit-contract.mjs';
// Only the approved sentinel row is writable. No RPC, feed/cache/control writes,
// lease expiry, retry, initialization, reset, or arbitrary row selection here.
export function auditStore(db){
  return {
    async read(){
      const {data,error}=await db.from('rss_quality_eval').select('id,status,token,result').eq('id',LEDGER_ID).abortSignal(AbortSignal.timeout(3000)).maybeSingle();
      if(error)throw Error('ledger_unavailable');return data;
    },
    async claim(expected,result){
      const token=crypto.randomUUID();
      let query=db.from('rss_quality_eval').update({status:'running',token,result}).eq('id',LEDGER_ID).eq('status','queued');
      query=expected.token===null?query.is('token',null):query.eq('token',expected.token);
      const {data,error}=await query.select('token').abortSignal(AbortSignal.timeout(3000)).maybeSingle();
      if(error)throw Error('ledger_unavailable');return data?.token || null;
    },
    async finish(token,result,closed){
      const {data,error}=await db.from('rss_quality_eval').update({status:closed?'done':'queued',result}).eq('id',LEDGER_ID).eq('status','running').eq('token',token).select('id').abortSignal(AbortSignal.timeout(3000)).maybeSingle();
      if(error || !data)throw Error('ledger_unavailable');
    },
  };
}
