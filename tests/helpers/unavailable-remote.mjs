// No real external request leaves the isolated browser. Explicit CORS responses
// keep WebKit's route-abort access-control diagnostics out of pageerror checks.
// Callers still record every attempted URL, including forbidden paid lookups.
export function unavailableRemote(route){
  const request=route.request(),headers=request.headers(),preflight=request.method()==='OPTIONS';
  return route.fulfill({status:preflight?204:503,contentType:'application/json',
    headers:{'access-control-allow-origin':headers.origin||'*',
      'access-control-allow-methods':'GET, POST, OPTIONS',
      'access-control-allow-headers':headers['access-control-request-headers']||'*',
      'access-control-allow-credentials':'true'},
    body:preflight?'':'{"error":"synthetic_unavailable"}'});
}
