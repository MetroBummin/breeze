// Durable quota decisions live in Postgres, never in an Edge isolate's memory.
export type Receipt={status:string;answer?:Record<string,unknown>;left?:number;limit?:number};
export async function logicalLookup(
  receipt:(answer?:Record<string,unknown>)=>Promise<Receipt>,
  generate:()=>Promise<Record<string,unknown>>,
  cost=0,
  requestId=""
):Promise<Receipt>{
  const before=await receipt();
  if(before.status!=="ok")return before;
  const answer=await generate();
  // Validation is the caller's job; failed generation never reaches the debit.
  const pending=receipt(answer);
  const runtime=(globalThis as {EdgeRuntime?:{waitUntil?:(job:Promise<unknown>)=>void}}).EdgeRuntime;
  // The pre-check already allowed this lookup. Record the debit after the response
  // when the runtime can keep that write alive and the check reported a remainder.
  if(cost>0&&typeof before.left==="number"&&typeof runtime?.waitUntil==="function"){
    runtime.waitUntil(pending.then(result=>{
      if(!result||result.status!=="replay")console.error("lookup_receipt_failed "+JSON.stringify({request_id:requestId,status:result?.status??"missing"}));
    },error=>{
      const code=error instanceof Error&&error.message==="quota_unavailable"?"quota_unavailable":"receipt_error";
      console.error("lookup_receipt_failed "+JSON.stringify({request_id:requestId,code}));
    }));
    return {status:"replay",answer,left:Math.max(0,before.left-cost),limit:before.limit};
  }
  return await pending;
}
export async function lookupFingerprint(input:unknown){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(input)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
