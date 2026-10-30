/**
 * IDENTITY-BOUND OFFLINE MOCK. No route, Worker, actual Cloudflare Access
 * policy, server secret, production storage, provider calls or deployment.
 *
 * Unlike the older test wrapper, this v2 rehearsal derives a server-keyed
 * digest from the cryptographically verified Access JWT and supplies it to
 * the distinct bound-session v2 ledger on BOTH issue and consume. It will
 * not fall back to the v1 unbound session callbacks.
 *
 * The injected storage callbacks are test doubles, not an authority check.
 * This is not a released judge gateway; paid inference always stays OFF.
 */
import {inspectOfflineJudgeAccessJwt} from './judge-access-jwt-offline.mjs';
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate
} from './judge-offline-pipeline.mjs';
const deny=code=>Object.freeze({accepted:false,code,providerCallsAuthorized:false});
const DIGEST=/^[a-f0-9]{64}$/;
async function checkJudgeIdentity(request,auth){
  if(!auth||typeof auth!=='object'||Array.isArray(auth)||
     !(auth.identityBindingKey instanceof Uint8Array)||
     auth.identityBindingKey.byteLength!==32)return null;
  try{
    // The real incoming request ALWAYS overrides a config-supplied request.
    const proof=await inspectOfflineJudgeAccessJwt({...auth,request});
    return proof?.allowed===true&&proof.providerCallsAuthorized===false&&
      DIGEST.test(proof.judgeBindingDigest)?proof.judgeBindingDigest:null;
  }catch{return null;}
}
export async function offlineBoundIssueJudgeSession(request,{auth,session}={}){
  const binding=await checkJudgeIdentity(request,auth);
  if(!binding)return deny('judge-access-or-binding-denied');
  if(!session||typeof session!=='object'||
     typeof session.issueBoundSessionDigest!=='function')
    return deny('bound-session-service-missing');
  try{
    const {issueBoundSessionDigest,...rest}=session;
    const result=await offlineIssueJudgeSession(request,{
      ...rest,
      issueSessionDigest:args=>issueBoundSessionDigest({
        ...args,judgeBindingDigest:binding
      })
    });
    return result?.providerCallsAuthorized===false?result:
      deny('bound-session-issuance-denied');
  }catch{return deny('bound-session-issuance-unavailable');}
}
export async function offlineBoundCheckJudgeGenerate(request,{auth,generate}={}){
  const binding=await checkJudgeIdentity(request,auth);
  if(!binding)return deny('judge-access-or-binding-denied');
  if(!generate||typeof generate!=='object'||
     typeof generate.consumeBoundSessionDigest!=='function')
    return deny('bound-session-service-missing');
  try{
    const {consumeBoundSessionDigest,...rest}=generate;
    const result=await offlineCheckJudgeGenerate(request,{
      ...rest,
      consumeSessionDigest:args=>consumeBoundSessionDigest({
        ...args,judgeBindingDigest:binding
      })
    });
    return result?.providerCallsAuthorized===false?result:
      deny('bound-session-generation-denied');
  }catch{return deny('bound-session-generation-unavailable');}
}
