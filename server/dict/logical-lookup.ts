// Durable quota decisions live in Postgres, never in an Edge isolate's memory.
export type Receipt={status:string;answer?:Record<string,unknown>;left?:number;limit?:number};
export async function logicalLookup(
  receipt:(answer?:Record<string,unknown>)=>Promise<Receipt>,
  generate:()=>Promise<Record<string,unknown>>
):Promise<Receipt>{
  const before=await receipt();
  if(before.status!=="ok")return before;
  const answer=await generate();
  // Validation is the caller's job; failed generation never reaches the debit.
  return await receipt(answer);
}
export async function lookupFingerprint(input:unknown){
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(input)));
  return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,"0")).join("");
}
