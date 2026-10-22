/**
 * OFFLINE ONLY: compose the simulated judge pipeline with a durable,
 * one-way emergency-stop check before every session and generation preflight.
 *
 * Absolutely NO upstream model call, Worker HTTP export, credentials,
 * production binding, or activation capability.
 *
 * stopStub must eventually come from the trusted server's one canonical
 * Cloudflare Durable Object binding, NEVER from client JSON. In these tests it
 * is an isolated local-workerd object. Other dependencies remain mock-only.
 *
 * This is not enough to provide production kill-switch guarantees: a future
 * live gateway needs a final trusted stop check immediately before inference
 * and explicit control of races with in-flight paid requests.
 */
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate
} from './judge-offline-pipeline.mjs';

const deny=code=>Object.freeze({
  accepted:false,code,providerCallsAuthorized:false
});

async function emergencyStopIsClear(stopStub){
  if(!stopStub||typeof stopStub.inspectForFutureGateway!=='function')return false;
  try{
    const state=await stopStub.inspectForFutureGateway();
    return state!==null&&typeof state==='object'&&
      state.valid===true&&state.stopped===false&&
      state.reason==='offline-latch-clear-only'&&
      state.providerCallsAuthorized===false;
  }catch{return false;}
}

/**
 * Fail closed before spending any Turnstile/rate/session resources.
 * Recheck after issuance to prevent handing out a session when the stop
 * was latched mid-flight. Any already-consumed slots remain consumed.
 */
export async function offlineIssueWithStop(request,{stopStub,...mockServices}={}){
  if(!await emergencyStopIsClear(stopStub))
    return deny('judge-emergency-stop-active');
  try {
    const result=await offlineIssueJudgeSession(request,mockServices);
    if(result.accepted!==true)return result;
    if(!await emergencyStopIsClear(stopStub))
      return deny('judge-emergency-stop-active');
    return Object.freeze({...result,providerCallsAuthorized:false});
  }catch{return deny('judge-security-unavailable');}
}

/**
 * Fail closed before any mocked generation work and recheck after quota
 * reservation. Never refund, retry or turn an offline preflight into a call.
 */
export async function offlineGenerateWithStop(request,{stopStub,...mockServices}={}){
  if(!await emergencyStopIsClear(stopStub))
    return deny('judge-emergency-stop-active');
  try{
    const result=await offlineCheckJudgeGenerate(request,mockServices);
    if(result.accepted!==true)return result;
    if(!await emergencyStopIsClear(stopStub))
      return deny('judge-emergency-stop-active');
    return Object.freeze({...result,providerCallsAuthorized:false});
  }catch{return deny('judge-security-unavailable');}
}
