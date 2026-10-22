/**
 * OFFLINE-ONLY Cloudflare Turnstile secret-binding contract.
 *
 * IMPORTANT: This is NOT a live Worker route and is NOT referenced by
 * the root, production Wrangler config. It does not deploy, perform fetch,
 * contact Siteverify or authorize NVIDIA/Nebius usage.
 *
 * The public site key is in judge-preview/turnstile-public-config.mjs.
 * The PRIVATE key must eventually come from a separately owner-approved
 * Cloudflare Worker secret binding named JUDGE_TURNSTILE_SECRET.
 * Never put a real secret in source code, browser files, wrangler vars,
 * chat, screenshots, or logs.
 *
 * The ONLY transport accepted here is an explicitly injected fake transport
 * for local workerd tests. There is deliberately no fallback to global fetch.
 * All four Durable Objects use canonical local TEST_* bindings.
 */
import {JUDGE_TURNSTILE_PUBLIC}
  from '../judge-preview/turnstile-public-config.mjs';
import {makeLocalJudgeBindingServices}
  from './judge-local-binding-services.mjs';
import {offlineIssueWithStop}
  from './judge-offline-shutdown-gate.mjs';

export const JUDGE_TURNSTILE_SECRET_BINDING='JUDGE_TURNSTILE_SECRET';
const deny=(code)=>Object.freeze({
  accepted:false,code,providerCallsAuthorized:false
});

/**
 * Build an entirely local, strictly typed rehearsal dependency set.
 * Binding checks are only an early guard; Siteverify itself validates
 * the real token/secret/hostname/action/timestamp before any session issue.
 */
export function makeOfflineTurnstileSessionServices(env,{
  siteverifyTransport
}={}){
  if(!env || typeof env!=='object' ||
     typeof siteverifyTransport!=='function')return null;
  const secret=env[JUDGE_TURNSTILE_SECRET_BINDING];
  if(typeof secret!=='string'||secret.length<16||secret.length>512||
     !/^[\x21-\x7e]+$/.test(secret)||
     secret===JUDGE_TURNSTILE_PUBLIC.siteKey)return null;

  const durable=makeLocalJudgeBindingServices(env);
  if(!durable)return null;
  return Object.freeze({
    ...durable,
    turnstileSecret:secret,
    siteverifyTransport,
    expectedOrigin:'https://'+JUDGE_TURNSTILE_PUBLIC.hostname,
    expectedHostname:JUDGE_TURNSTILE_PUBLIC.hostname,
    nowMs:Date.now(),
    providerCallsAuthorized:false
  });
}

/**
 * Test-only request rehearsal, with the already-implemented emergency stop,
 * fake Siteverify transport, global rate and one-time hash session issuance.
 * No HTTP handler imports this function; nothing calls the paid model.
 */
export async function issueOfflineJudgeSessionWithTurnstile(
  request,env,{siteverifyTransport}={}
){
  try{
    const services=makeOfflineTurnstileSessionServices(env,{
      siteverifyTransport
    });
    if(!services)return deny('judge-siteverify-binding-unavailable');
    const result=await offlineIssueWithStop(request,services);
    if(result.accepted!==true)return deny('judge-session-not-authorized');
    // Accepted means ONLY that a simulated one-use session was issued.
    // No provider call, inference entitlement or live API is possible.
    return Object.freeze({...result,providerCallsAuthorized:false});
  }catch{
    return deny('judge-siteverify-failed-closed');
  }
}
