const CLIENT_LOOKUP_FAILURE=/^(clicked_index_missing|session_timeout|fetch_error|scope_mismatch|timeout|server_status_[1-5][0-9]{2})$/;

// Records a client-side lookup failure in the function log. The reason is an
// allow-listed code. Raw request fields are never written, so a bad payload
// cannot put a token, word, or sentence into the log.
export function clientLookupFailureResponse(body:unknown):{status:number;body:{ok?:boolean;error?:string}}{
  const reason=String((body as {reason?:unknown})?.reason??"").trim().slice(0,40);
  if(!CLIENT_LOOKUP_FAILURE.test(reason))return {status:400,body:{error:"bad_reason"}};
  console.error("client_lookup_failure",JSON.stringify({reason}));
  return {status:200,body:{ok:true}};
}
