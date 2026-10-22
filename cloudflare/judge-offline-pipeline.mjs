/**
 * Step 14M — integrated OFFLINE ONLY simulation of a future judge-session
 * request flow. NO deployment, no HTTP entrypoint, no provider transport,
 * no credentials, and no production Durable Object binding.
 *
 * This composes the pre-existing Turnstile verifier, globally shared
 * rate-limiter reservation, hashed one-use CSRF session, and generation
 * preflight with mocked server checks and quota. Even a successful test
 * returns providerCallsAuthorized:false. No live activation flag exists.
 *
 * WARNING: injection callbacks are TEST DOUBLES. A future Worker must replace
 * them with real, secured, single-canonical-object Durable Object stubs;
 * enforce a separate pre-issuance abuse/DoS mechanism; verify actual Cloudflare
 * Turnstile Siteverify; and obtain distinct paid API authorization.
 */
import {
  verifyJudgeTurnstileOffline,
  TURNSTILE_JUDGE_ACTION, TURNSTILE_TOKEN_MAX_CHARS
} from './judge-turnstile-core.mjs';
import {generateJudgeSessionSecrets,hashJudgeSessionSecrets,
  formatSecureJudgeCookie,SESSION_COOKIE_NAME} from './judge-session-core.mjs';
import {offlineInspectJudgeRequest,JUDGE_API_PATH} from './judge-gateway-core.mjs';

export const JUDGE_SESSION_PATH='/api/judge-demo/session';
export const SESSION_REQUEST_MAX_BYTES=2304;
const HEX_256=/^[a-f0-9]{64}$/;
const deny=code=>Object.freeze({accepted:false,code,providerCallsAuthorized:false});

function trustedOrigin(value){
  if(typeof value!=='string'||value.length>256)return false;
  try {
    const parsed=new URL(value);
    return parsed.protocol==='https:' && parsed.origin===value &&
      parsed.username==='' && parsed.password==='' &&
      parsed.pathname==='/' && !parsed.search && !parsed.hash;
  }catch{return false;}
}
function correctPost(request,expectedOrigin,path){
  if(!(request instanceof Request)||!trustedOrigin(expectedOrigin))return false;
  let url;
  try{url=new URL(request.url);}catch{return false;}
  return request.method==='POST' && url.origin===expectedOrigin &&
    url.pathname===path && !url.search && !url.hash &&
    request.headers.get('origin')===expectedOrigin &&
    request.headers.get('sec-fetch-site')==='same-origin' &&
    /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(
      request.headers.get('content-type')??'');
}

async function readTinyJson(request){
  const supplied=request.headers.get('content-length');
  if(supplied!==null && (!/^[0-9]{1,6}$/.test(supplied)||
    Number(supplied)>SESSION_REQUEST_MAX_BYTES))return null;
  if(!request.body||typeof request.body.getReader!=='function')return null;
  const reader=request.body.getReader();
  let bytes=0;
  const pieces=[];
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))return null;
      bytes+=value.byteLength;
      if(bytes>SESSION_REQUEST_MAX_BYTES){
        await reader.cancel().catch(()=>{});
        return null;
      }
      pieces.push(value);
    }
    if(!bytes)return null;
    const joined=new Uint8Array(bytes);
    let offset=0;
    for(const part of pieces){joined.set(part,offset);offset+=part.byteLength;}
    const text=new TextDecoder('utf-8',{fatal:true}).decode(joined);
    const obj=JSON.parse(text);
    if(!obj || Object.getPrototypeOf(obj)!==Object.prototype ||
      Object.keys(obj).length!==1||!Object.hasOwn(obj,'turnstileToken')||
      typeof obj.turnstileToken!=='string'||obj.turnstileToken.length<1||
      obj.turnstileToken.length>TURNSTILE_TOKEN_MAX_CHARS)return null;
    return obj;
  }catch{return null;}
  finally{reader.releaseLock();}
}

/**
 * Offline sequence: exact browser request -> fake Siteverify -> mock global
 * rate-slot reservation -> generate two independent secrets -> persist
 * digests via mock session issuer -> safe cookie template + CSRF value.
 *
 * The returned values are ONLY test artifacts, not real HTTP response headers
 * or real authorizations. A real endpoint needs an independent security review.
 */
export async function offlineIssueJudgeSession(request,{
  expectedOrigin,turnstileSecret,expectedHostname,siteverifyTransport,
  reserveRateSlot,issueSessionDigest,nowMs
}={}){
  if(!correctPost(request,expectedOrigin,JUDGE_SESSION_PATH))
    return deny('invalid-session-request');
  if(typeof siteverifyTransport!=='function'||
     typeof reserveRateSlot!=='function'||
     typeof issueSessionDigest!=='function'||
     typeof turnstileSecret!=='string'||
     typeof expectedHostname!=='string'||
     !Number.isSafeInteger(nowMs)||nowMs<=0)
    return deny('security-service-unavailable');
  const body=await readTinyJson(request);
  if(!body)return deny('invalid-or-oversized-turnstile-body');
  try{
    const result=await verifyJudgeTurnstileOffline({
      token:body.turnstileToken,secret:turnstileSecret,
      expectedHostname,expectedAction:TURNSTILE_JUDGE_ACTION,
      nowMs,fetchImpl:siteverifyTransport
    });
    if(result.valid!==true)return deny('turnstile-verification-denied');

    // Reserving a rate slot, including subsequent failures, is deliberate.
    const rate=await reserveRateSlot({nowMs});
    if(!rate||rate.allowed!==true)return deny('session-rate-denied');

    const secrets=generateJudgeSessionSecrets();
    const hashes=await hashJudgeSessionSecrets(secrets);
    const issued=await issueSessionDigest({...hashes,nowMs});
    if(!issued||issued.allowed!==true)return deny('session-issue-denied');
    return Object.freeze({
      accepted:true,code:'offline-session-issued-not-deployed',
      setCookieTemplate:formatSecureJudgeCookie(secrets.cookieSecret),
      csrfToken:secrets.csrfSecret,providerCallsAuthorized:false
    });
  }catch{return deny('session-security-unavailable');}
}

/** Parse one and only one valid __Host- session cookie. Reject duplicates. */
export function extractJudgeCookieSecret(cookie){
  if(typeof cookie!=='string'||cookie.length>4096)return null;
  const parts=cookie.split(';');
  if(parts.length>48)return null;
  const candidates=[];
  for(const part of parts){
    const trimmed=part.trim();
    const equals=trimmed.indexOf('=');
    if(equals<0)continue;
    if(trimmed.slice(0,equals).trim()===SESSION_COOKIE_NAME)
      candidates.push(trimmed.slice(equals+1));
  }
  if(candidates.length!==1||!HEX_256.test(candidates[0]))return null;
  return candidates[0];
}

/**
 * Offline generation preflight: fail-closed cookie+CSRF pairing is atomically
 * consumed by mock storage, followed by mock anti-abuse, trusted server token
 * count, pricing and global 20-call quota. The pre-existing gateway's final
 * result always keeps providerCallsAuthorized:false.
 */
export async function offlineCheckJudgeGenerate(request,{
  expectedOrigin,consumeSessionDigest,checkGenerateAbuse,
  measureInputTokens,checkVerifiedPrice,reserveQuota,nowMs
}={}){
  if(!correctPost(request,expectedOrigin,JUDGE_API_PATH))
    return deny('invalid-generate-request');
  const cookieSecret=extractJudgeCookieSecret(request.headers.get('cookie'));
  const csrfSecret=request.headers.get('x-socialspark-csrf');
  if(!cookieSecret||typeof csrfSecret!=='string'||!HEX_256.test(csrfSecret))
    return deny('missing-or-ambiguous-csrf');
  if([consumeSessionDigest,checkGenerateAbuse,measureInputTokens,
      checkVerifiedPrice,reserveQuota].some(fn=>typeof fn!=='function')||
      !Number.isSafeInteger(nowMs)||nowMs<=0)
    return deny('security-service-unavailable');
  try{
    const hashes=await hashJudgeSessionSecrets({cookieSecret,csrfSecret});
    return await offlineInspectJudgeRequest(request,{
      expectedOrigin,
      verifyOneTimeSession:async({csrf})=>{
        if(csrf!==csrfSecret)return false;
        const result=await consumeSessionDigest({...hashes,nowMs});
        return result?.allowed===true;
      },
      recordAbuseCheck:checkGenerateAbuse,
      countServerTokens:measureInputTokens,
      verifyCurrentPricing:checkVerifiedPrice,
      reserveMockQuota:reserveQuota
    });
  }catch{return deny('generate-security-unavailable');}
}
