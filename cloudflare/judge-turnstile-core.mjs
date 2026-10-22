/**
 * Step 14L — UNBOUND server-side Cloudflare Turnstile Siteverify adapter.
 *
 * This module is not deployed, exported as an HTTP endpoint, called by a
 * Worker, or connected to Nebius. It MUST NOT be used as permission to run AI.
 * Only the future server can access the TURNSTILE SECRET (via Worker secret
 * binding). Never put the secret in HTML, source, browser, or URLs.
 *
 * It performs one non-retrying Siteverify POST with injected fetchImpl ONLY.
 * All checks fail closed; no raw token, secret, response body, IP, or metadata
 * are returned/logged. Turnstile is anti-abuse, NOT user authentication, a
 * provider billing guard, or a substitute for one-use CSRF sessions.
 *
 * Cloudflare docs: token max 2048 characters, 300-second expiry, single-use,
 * required server-side Siteverify; verify response.hostname and action.
 */
export const TURNSTILE_VERIFY_ENDPOINT =
  'https://challenges.cloudflare.com/turnstile/v0/siteverify';
export const TURNSTILE_JUDGE_ACTION='socialspark_judge_session';
export const TURNSTILE_TOKEN_MAX_CHARS=2048;
export const TURNSTILE_TOKEN_TTL_MS=300_000;
export const TURNSTILE_MAX_RESPONSE_BYTES=4096;
export const TURNSTILE_TIMEOUT_MS=8000;

const deny=code=>Object.freeze({valid:false,code});
const valid=()=>Object.freeze({valid:true,code:'siteverify-verified-offline-integration-only'});

function validSecret(secret){
  return typeof secret==='string' && secret.length>=16 && secret.length<=512 &&
    /^[\x21-\x7e]+$/.test(secret);
}
function validToken(token){
  return typeof token==='string' && token.length>0 &&
    token.length<=TURNSTILE_TOKEN_MAX_CHARS &&
    /^[\x21-\x7e]+$/.test(token);
}
function validHostname(host){
  // Supply the exact deployed hostname from trusted server configuration.
  // No ports, scheme, wildcard, path, user-info, or query parameters.
  if(typeof host!=='string' || host.length<4 || host.length>253 ||
     host!==host.toLowerCase() || host.includes('..'))return false;
  return host.split('.').length>=2 && host.split('.').every(label=>
    label.length>=1 && label.length<=63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  );
}
function validAction(action){
  return typeof action==='string' && action===TURNSTILE_JUDGE_ACTION;
}
async function boundedResponseJson(response){
  if(!response || response.ok!==true || response.status!==200 ||
     typeof response.headers?.get!=='function' ||
     !/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type')??'') ||
     typeof response.body?.getReader!=='function')return null;
  const reader=response.body.getReader();
  const chunks=[];
  let bytes=0;
  try{
    while(true){
      const {done,value}=await reader.read();
      if(done)break;
      if(!(value instanceof Uint8Array))return null;
      bytes+=value.byteLength;
      if(bytes>TURNSTILE_MAX_RESPONSE_BYTES){
        await reader.cancel().catch(()=>{});
        return null;
      }
      chunks.push(value);
    }
    if(bytes===0)return null;
    const joined=new Uint8Array(bytes);
    let offset=0;
    for(const piece of chunks){joined.set(piece,offset);offset+=piece.byteLength;}
    const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(joined));
    return data && Object.getPrototypeOf(data)===Object.prototype ? data : null;
  }catch{return null;}
  finally{reader.releaseLock();}
}

/**
 * Offline-only injectable transport adapter.
 * There is intentionally NO default fetch: explicit injected mock transport
 * is required in the current version, making real Siteverify calls impossible
 * without separate future code review and approval.
 */
export async function verifyJudgeTurnstileOffline({
  token,secret,expectedHostname,expectedAction=TURNSTILE_JUDGE_ACTION,
  fetchImpl,nowMs=Date.now()
}={}){
  if(!validToken(token))return deny('invalid-turnstile-token');
  if(!validSecret(secret))return deny('turnstile-secret-unavailable');
  if(!validHostname(expectedHostname) || !validAction(expectedAction))
    return deny('turnstile-origin-unconfigured');
  if(!Number.isSafeInteger(nowMs) || nowMs<=0)return deny('turnstile-clock-unavailable');
  if(typeof fetchImpl!=='function')return deny('turnstile-transport-unavailable');

  let response;
  try{
    response=await fetchImpl(TURNSTILE_VERIFY_ENDPOINT,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({secret,response:token}),
      redirect:'error',
      cache:'no-store',
      signal:AbortSignal.timeout(TURNSTILE_TIMEOUT_MS)
    });
  }catch{return deny('siteverify-unavailable');}
  const result=await boundedResponseJson(response);
  if(!result)return deny('siteverify-unavailable');
  if(result.success!==true)return deny('turnstile-rejected');
  if(result.hostname!==expectedHostname)return deny('turnstile-hostname-mismatch');
  if(result.action!==expectedAction)return deny('turnstile-action-mismatch');
  if(typeof result.challenge_ts!=='string' ||
     !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(result.challenge_ts))
    return deny('turnstile-timestamp-invalid');
  const issuedAt=Date.parse(result.challenge_ts);
  const age=nowMs-issuedAt;
  if(!Number.isFinite(issuedAt) || !Number.isSafeInteger(age) ||
     age < -30_000 || age>=TURNSTILE_TOKEN_TTL_MS)
    return deny('turnstile-expired-or-future');
  // Siteverify's own single-use redemption is the authoritative replay check.
  // A future caller must not retry a failed or uncertain verification.
  return valid();
}
