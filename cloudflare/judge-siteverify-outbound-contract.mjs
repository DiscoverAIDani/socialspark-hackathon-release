/**
 * UNDEPLOYED Cloudflare Siteverify transport boundary.
 *
 * Future server-side code can pass the platform network primitive as "send",
 * but no current Worker entrypoint imports or calls this module.
 * The adapter has NO default network function, no secret, no token storage,
 * no retry, no logging, no ability to call Nebius and no owner activation.
 *
 * An injected SEND function is intended for fake unit/workerd tests here.
 * A genuine network sender must NOT be connected until reviewed and
 * separately approved; successful Siteverify is not paid-AI authorization.
 *
 * Contract based on Cloudflare docs: JSON POST to the exact Siteverify
 * endpoint with only secret/response; 2048 maximum token chars; enforce
 * same fixed destination and no redirects or cache. Upstream validation
 * in judge-turnstile-core.mjs checks hostname, action and challenge age.
 */
import {
  TURNSTILE_VERIFY_ENDPOINT,TURNSTILE_TOKEN_MAX_CHARS
} from './judge-turnstile-core.mjs';

const KEYS=['secret','response'];
const SECRET_RE=/^[\x21-\x7e]{16,512}$/;
const TOKEN_RE=/^[\x21-\x7e]{1,2048}$/;
const plain=value=>value!==null&&typeof value==='object'&&
  !Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;

function validRequest(url,init){
  if(url!==TURNSTILE_VERIFY_ENDPOINT || !plain(init))return null;
  if(init.method!=='POST'||init.redirect!=='error'||
     init.cache!=='no-store'||!plain(init.headers)||
     Object.keys(init.headers).length!==1||
     init.headers['Content-Type']!=='application/json')return null;
  if(typeof init.body!=='string'||init.body.length>3000)return null;
  if(init.signal==null || typeof init.signal.aborted!=='boolean')return null;
  if(init.signal.aborted===true)return null;
  try{
    const data=JSON.parse(init.body);
    if(!plain(data)||Object.keys(data).length!==KEYS.length||
       !KEYS.every(k=>Object.hasOwn(data,k))||
       !SECRET_RE.test(data.secret)||
       !TOKEN_RE.test(data.response)||
       data.response.length>TURNSTILE_TOKEN_MAX_CHARS ||
       data.secret===data.response)return null;
    return data;
  }catch{return null;}
}

/**
 * Always reconstruct canonical request options, dropping any accidental
 * extra headers or properties. Do not record any content in failures.
 *
 * This function never chooses a network implementation: send is REQUIRED.
 * No default to global fetch. Call only through trusted server code.
 */
export function createFutureSiteverifyTransport({send}={}){
  if(typeof send!=='function')return null;
  return async (url,init)=>{
    const data=validRequest(url,init);
    if(!data)throw Error('siteverify-request-rejected');
    try{
      // Caller owns AbortSignal.timeout; forward it but never retry.
      return await send(TURNSTILE_VERIFY_ENDPOINT,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({secret:data.secret,response:data.response}),
        redirect:'error',
        cache:'no-store',
        signal:init.signal
      });
    }catch{
      // Never expose token, secret, upstream response, or network diagnostics.
      throw Error('siteverify-transport-unavailable');
    }
  };
}
