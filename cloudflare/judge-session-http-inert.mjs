/**
 * RESTRICTED / OFFLINE-TEST-ONLY HTTP response adapter for a FUTURE judge
 * session route. No Worker entrypoint imports this module. No public route,
 * live site, API key, provider fetch, or billable inference is enabled.
 *
 * The only optional transport is a test-injected fake Siteverify transport.
 * Without it, every call fails closed. This module does NOT export a Worker
 * fetch handler and cannot be deployed by the production assets-only config.
 * Crucially, even a successful test response has providerCallsAuthorized:false.
 */
import {JUDGE_SESSION_PATH} from './judge-offline-pipeline.mjs';
import {JUDGE_API_PATH,disabledJudgeGatewayResponse}
  from './judge-gateway-core.mjs';
import {issueOfflineJudgeSessionWithTurnstile}
  from './judge-turnstile-secret-binding-offline.mjs';

const headers=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'DENY',
  'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'"
});
const json=(status,payload,extra={})=>new Response(JSON.stringify(payload),{
  status,headers:{...headers,...extra}
});
const deny=(status,code)=>json(status,Object.freeze({
  ok:false,code,providerCallsAuthorized:false
}));

/**
 * A local-workerd exercise of response composition around the immutable
 * session issuance checks. No production Worker route references this.
 * Never pass globalThis.fetch as siteverifyTransport without a separate
 * review/authorization and actual secret-binding architecture.
 */
export async function offlineJudgeSessionHttp(
  request,env,{siteverifyTransport}={}
){
  if(!(request instanceof Request))
    return deny(400,'invalid-request');
  let target;
  try{target=new URL(request.url);}catch{
    return deny(400,'invalid-request');
  }
  // Always use the existing disabled response, even when test dependencies
  // are configured. This is not a model proxy.
  if(target.pathname===JUDGE_API_PATH)
    return disabledJudgeGatewayResponse();
  if(target.pathname!==JUDGE_SESSION_PATH || target.search || target.hash)
    return deny(404,'not-found');
  if(request.method!=='POST')
    return deny(405,'method-not-allowed');
  if(typeof siteverifyTransport!=='function')
    return deny(503,'judge-session-unavailable');

  try{
    const result=await issueOfflineJudgeSessionWithTurnstile(
      request,env,{siteverifyTransport}
    );
    if(result.accepted!==true)
      return deny(403,'judge-session-not-authorized');
    if(typeof result.csrfToken!=='string' ||
       !/^[a-f0-9]{64}$/.test(result.csrfToken) ||
       typeof result.setCookieTemplate!=='string'||
       !/^__Host-SocialSparkJudge=[a-f0-9]{64}; Path=\/; Max-Age=120; Secure; HttpOnly; SameSite=Strict$/.test(result.setCookieTemplate))
      return deny(503,'judge-session-unavailable');
    return json(200,{
      ok:true,
      mode:'offline-only-session-assembly',
      csrfToken:result.csrfToken,
      providerCallsAuthorized:false
    },{'Set-Cookie':result.setCookieTemplate});
  }catch{
    return deny(503,'judge-session-unavailable');
  }
}
