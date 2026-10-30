/**
 * OFFLINE ONLY: compose signed Cloudflare Access JWT validation with
 * existing mock judge session and generation checks.
 *
 * This module is unbound, not imported by any Worker entrypoint, does not
 * create a login or remotely fetch JWKS, and NEVER calls a model. It is an
 * integration rehearsal, NOT an API gateway or release authorization.
 *
 * Each HTTP operation must independently authenticate a judge, including
 * generation on an already-issued CSRF session. Missing/corrupt/expired tokens,
 * absent keys or identities, and verifier failures deny BEFORE invoking
 * Turnstile, session ledgers, provider checks or mock quota reservations.
 *
 * NOTE: this prototype only checks each request's allowed identity; it does
 * not bind a particular judge's Access subject to a prior CSRF session.
 * Identity-to-session binding, signed-JWKS refresh, operator authorization,
 * actual Access policy, judge invitation delivery, and provider financial
 * controls are explicit unresolved blockers for a production gateway.
 */
import {inspectOfflineJudgeAccessJwt} from './judge-access-jwt-offline.mjs';
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate
} from './judge-offline-pipeline.mjs';

const deny=code=>Object.freeze({
  accepted:false,code,providerCallsAuthorized:false
});

async function requireOfflineJudgeIdentity(request,auth){
  if(!auth || typeof auth!=='object' || Array.isArray(auth))
    return false;
  try{
    // Never let a supplied configuration replace the actual HTTP request.
    const decision=await inspectOfflineJudgeAccessJwt({...auth,request});
    return decision?.allowed===true &&
      decision.providerCallsAuthorized===false;
  }catch{return false;}
}

/**
 * Simulated signed Access JWT -> fake Turnstile -> mock rate/session issuance.
 * A checked JWT never bypasses the old session security requirements.
 */
export async function offlineAuthenticatedIssueJudgeSession(request,{
  auth,session
}={}){
  if(!await requireOfflineJudgeIdentity(request,auth))
    return deny('judge-access-denied');
  if(!session || typeof session!=='object')
    return deny('judge-session-services-unavailable');
  try {
    const result=await offlineIssueJudgeSession(request,session);
    return result?.providerCallsAuthorized===false?result:
      deny('judge-session-failed-closed');
  }catch{return deny('judge-session-unavailable');}
}

/**
 * Simulated signed Access JWT -> mock cookie+CSRF consume -> mock
 * token/pricing/abuse/quota gates. Every operation re-checks the signed
 * Access proof, not merely the earlier login/session issuance.
 */
export async function offlineAuthenticatedCheckJudgeGenerate(request,{
  auth,generate
}={}){
  if(!await requireOfflineJudgeIdentity(request,auth))
    return deny('judge-access-denied');
  if(!generate || typeof generate!=='object')
    return deny('judge-generate-services-unavailable');
  try{
    const result=await offlineCheckJudgeGenerate(request,generate);
    return result?.providerCallsAuthorized===false?result:
      deny('judge-generate-failed-closed');
  }catch{return deny('judge-generate-unavailable');}
}
