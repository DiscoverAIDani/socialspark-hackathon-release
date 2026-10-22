/**
 * RESTRICTED JUDGE GATEWAY — OFFLINE DESIGN / NOT DEPLOYED.
 *
 * No Worker entrypoint imports this module. No public HTTP route, Nebius
 * transport, provider credentials, paid authorization or live inference.
 * The only HTTP response implemented here is a permanently disabled 503.
 *
 * offlineInspectJudgeRequest is a testable *simulation* of a future sequence
 * with injected, offline-only verifiers. Its accepted=true response is NEVER
 * permission to make a billable provider call. It cannot activate live AI.
 *
 * Production blockers: secure issuance and ONE-TIME durable consumption of
 * session+CSRF tokens, distributed abuse check, approved model tokenizer,
 * verified provider pricing, atomic durable quota, authenticated owner
 * activation, provider billing-risk review, Cloudflare runtime tests.
 */
import {
  JUDGE_DEMO_POLICY, getApprovedJudgeExample, checkProposedTokenLimits,
  judgeDemoLiveAccess
} from '../security/judge-demo-policy.mjs';

export const JUDGE_API_PATH = '/api/judge-demo/generate';
export const JUDGE_REQUEST_BYTES_LIMIT = 384;
const TOKEN_SHAPE = /^[a-zA-Z0-9_-]{32,128}$/;
const denial = code => Object.freeze({accepted:false,code,providerCallsAuthorized:false});
const pass = exampleId => Object.freeze({
  accepted:true,code:'offline-preflight-only',exampleId,providerCallsAuthorized:false
});

function trustedHttpsOrigin(origin) {
  if (typeof origin!=='string' || origin.length>256) return false;
  try {
    const url=new URL(origin);
    return url.protocol==='https:' && url.origin===origin &&
      url.username==='' && url.password==='' && !url.pathname.replaceAll('/','') &&
      !url.search && !url.hash && url.hostname.length>3;
  } catch {return false;}
}

async function boundedJson(request) {
  const declared=request.headers.get('content-length');
  if (declared!==null && (!/^[0-9]{1,6}$/.test(declared) ||
      Number(declared)>JUDGE_REQUEST_BYTES_LIMIT)) return null;
  if (!request.body || typeof request.body.getReader!=='function') return null;
  const reader=request.body.getReader();
  const chunks=[];
  let bytes=0;
  try {
    while(true) {
      const part=await reader.read();
      if(part.done)break;
      if(!(part.value instanceof Uint8Array))return null;
      bytes+=part.value.byteLength;
      if(bytes>JUDGE_REQUEST_BYTES_LIMIT)return null;
      chunks.push(part.value);
    }
    if(bytes===0)return null;
    const joined=new Uint8Array(bytes);
    let offset=0;
    for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(joined);
    const obj=JSON.parse(text);
    if (!obj || Object.getPrototypeOf(obj)!==Object.prototype ||
        Object.keys(obj).length!==1 || !Object.hasOwn(obj,'exampleId') ||
        typeof obj.exampleId!=='string') return null;
    return obj;
  } catch {
    return null;
  } finally {
    try {reader.releaseLock();} catch {}
    // Cancel to stop oversized/aborted uploads. Do not retry or log text.
    try {await request.body.cancel?.();} catch {}
  }
}

/**
 * Simulate a future request's full safety-gate ordering with *mock* callbacks.
 * Never pass real billing transports to these callbacks; never invoke from
 * a deployed request handler. They MUST be replaced by authenticated
 * Cloudflare/Durable Object services and reviewed before live activation.
 */
export async function offlineInspectJudgeRequest(request,{
  expectedOrigin,
  verifyOneTimeSession,
  recordAbuseCheck,
  countServerTokens,
  verifyCurrentPricing,
  reserveMockQuota
}={}) {
  if (!(request instanceof Request))return denial('invalid-request');
  if (!trustedHttpsOrigin(expectedOrigin))return denial('server-origin-unconfigured');
  let url;
  try {url=new URL(request.url);} catch {return denial('invalid-url');}
  if(url.origin!==expectedOrigin || url.pathname!==JUDGE_API_PATH ||
      url.search || url.hash || url.protocol!=='https:')
    return denial('untrusted-target');
  if(request.method!=='POST')return denial('method-not-allowed');
  if(request.headers.get('origin')!==expectedOrigin ||
     request.headers.get('sec-fetch-site')!=='same-origin')
    return denial('cross-origin-request');
  if(!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type')??''))
    return denial('unsupported-content-type');
  const csrf=request.headers.get('x-socialspark-csrf');
  if (typeof csrf!=='string' || !TOKEN_SHAPE.test(csrf)) return denial('missing-session-token');
  const body=await boundedJson(request);
  if(!body)return denial('invalid-or-oversized-body');
  const example=getApprovedJudgeExample(body.exampleId);
  if(!example)return denial('unapproved-example');

  // Missing any independent server dependency is a hard denial.
  const verifiers=[verifyOneTimeSession,recordAbuseCheck,countServerTokens,verifyCurrentPricing,reserveMockQuota];
  if(!verifiers.every(fn=>typeof fn==='function'))return denial('security-service-unavailable');
  try {
    if(await verifyOneTimeSession({csrf,exampleId:body.exampleId})!==true)
      return denial('invalid-or-replayed-session');
    if(await recordAbuseCheck({exampleId:body.exampleId})!==true)
      return denial('rate-or-abuse-blocked');

    // The model prompt is composed only from trusted, fixed server-side text.
    // The client has NO opportunity to supply post text, prompt or token count.
    const measured=await countServerTokens({
      idea:example.idea,tone:example.tone,
      model:JUDGE_DEMO_POLICY.model,
      maxOutputTokens:JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt
    });
    const checked=checkProposedTokenLimits({
      serverMeasuredInputTokens:measured,
      requestedMaxOutputTokens:JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt
    });
    if(!checked.allowed)return denial(checked.reason);
    if(await verifyCurrentPricing({model:JUDGE_DEMO_POLICY.model})!==true)
      return denial('price-verification-unavailable');

    // Mock quota reservation for offline sequencing tests only. This is NOT
    // bound to the Durable Object or exposed as a Worker API.
    const reservation=await reserveMockQuota();
    if(!reservation || reservation.allowed!==true)
      return denial('quota-reservation-denied');
    // A successful preflight remains strictly NON-LIVE.
    if(judgeDemoLiveAccess().allowed!==false) return denial('unexpected-live-authorization');
    return pass(body.exampleId);
  } catch {
    return denial('security-check-unavailable');
  }
}

/** Permanent fail-closed response if a future route is accidentally wired. */
export function disabledJudgeGatewayResponse() {
  return new Response(JSON.stringify({ok:false,code:'judge-live-ai-disabled'}),{
    status:503,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store, max-age=0',
      'Referrer-Policy':'no-referrer',
      'X-Content-Type-Options':'nosniff',
      'X-Frame-Options':'DENY',
      'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'"
    }
  });
}
