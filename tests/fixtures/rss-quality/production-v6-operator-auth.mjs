export async function operatorAuthorized(request,{url,apiKey,fetcher=fetch}){
  const authorization=request.headers.get('Authorization');
  if(!url || !apiKey || !authorization || !/^Bearer [^\s]+$/i.test(authorization))return false;
  try {
    // PostgREST verifies the caller JWT; the INVOKER RPC checks current_user.
    // Never substitute admin Authorization or trust decoded JWT claims.
    const response=await fetcher(`${url}/rest/v1/rpc/rss_quality_operator_authorized`,{
      method:'POST',headers:{apikey:apiKey,Authorization:authorization,'Content-Type':'application/json'},
      body:'{}',redirect:'error',signal:AbortSignal.timeout(5000),
    });
    return response.ok && await response.json()===true;
  }catch{return false;}
}
