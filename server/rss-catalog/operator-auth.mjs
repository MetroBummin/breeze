// Verify the caller through the existing same-project PostgREST operator RPC.
// The public API key only routes the request; it never substitutes for the
// incoming Authorization. Do not decode or trust unverified JWT role claims.
/** @param {Request} request
 * @param {{url:string,apiKey:string,fetcher?:typeof fetch}} options */
export async function operatorAuthorized(request,{url,apiKey,fetcher=fetch}){
  const authorization=request.headers.get('Authorization');
  // This path supports the existing legacy JWT service credential only.
  // Modern secret keys, apikey-only requests and malformed Bearer values fail.
  if(!url||!apiKey||!authorization||
    !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/i.test(authorization))return false;
  try{
    const response=await fetcher(`${url}/rest/v1/rpc/rss_quality_operator_authorized`,{
      method:'POST',headers:{apikey:apiKey,Authorization:authorization,'Content-Type':'application/json'},
      body:'{}',redirect:'error',signal:AbortSignal.timeout(5000)
    });
    return response.ok&&await response.json()===true;
  }catch{return false;}
}
