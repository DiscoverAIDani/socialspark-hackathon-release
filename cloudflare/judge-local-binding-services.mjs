/**
 * LOCAL WORKER BINDING ASSEMBLY — explicitly NONDEPLOYABLE integration adapter.
 *
 * Converts the four SQLite Durable Object TEST bindings into the callbacks
 * required by the existing offline judge pipeline. Every request uses one
 * CANONICAL object name per security service, shared across all visitors.
 *
 * This accepts NO user-controlled identity, session target, ledger ID, model,
 * prompt, key or URL. There is no fetch(), no Siteverify default transport,
 * no Nebius request, no owner activation and NO paid inference.
 *
 * It is intentionally pinned to TEST_* bindings, not a production Worker.
 * A real release requires a distinct reviewed server adapter, independent
 * authorizations, abuse protection, prices and a provider-enforced spend stop.
 */
import {JUDGE_QUOTA_INSTANCE_NAME}
  from './judge-quota-core.mjs';
import {JUDGE_SESSION_INSTANCE_NAME}
  from './judge-session-core.mjs';
import {RATE_LIMIT_INSTANCE_NAME}
  from './judge-rate-core.mjs';
import {JUDGE_STOP_INSTANCE_NAME}
  from './judge-emergency-stop-core.mjs';

const bindings=Object.freeze({
  TEST_QUOTA:JUDGE_QUOTA_INSTANCE_NAME,
  TEST_SESSIONS:JUDGE_SESSION_INSTANCE_NAME,
  TEST_RATE:RATE_LIMIT_INSTANCE_NAME,
  TEST_STOP:JUDGE_STOP_INSTANCE_NAME
});

export const LOCAL_JUDGE_CANONICAL_BINDINGS=bindings;

function fixedStub(binding,objectName){
  if(!binding || typeof binding.idFromName!=='function' ||
      typeof binding.get!=='function')return null;
  try{
    // No identity, IP, cookie, pathname or caller-provided shard is used.
    return binding.get(binding.idFromName(objectName));
  }catch{return null;}
}

/** Always deny on missing storage. No fallback to mock-in-memory quotas. */
export function makeLocalJudgeBindingServices(env){
  if(!env||typeof env!=='object')return null;
  const sessions=fixedStub(env.TEST_SESSIONS,bindings.TEST_SESSIONS);
  const rate=fixedStub(env.TEST_RATE,bindings.TEST_RATE);
  const quota=fixedStub(env.TEST_QUOTA,bindings.TEST_QUOTA);
  const stop=fixedStub(env.TEST_STOP,bindings.TEST_STOP);
  if(!sessions||!rate||!quota||!stop||
      typeof sessions.issueDigestForOfflineGateway!=='function'||
      typeof sessions.consumeDigestForOfflineGateway!=='function'||
      typeof rate.reserveForFutureSessionIssuer!=='function'||
      typeof quota.reserveAttemptForFutureGateway!=='function'||
      typeof stop.inspectForFutureGateway!=='function')return null;

  return Object.freeze({
    stopStub:stop,
    reserveRateSlot:()=>rate.reserveForFutureSessionIssuer(),
    issueSessionDigest:({sessionHash,csrfHash})=>
      sessions.issueDigestForOfflineGateway({sessionHash,csrfHash}),
    consumeSessionDigest:({sessionHash,csrfHash})=>
      sessions.consumeDigestForOfflineGateway({sessionHash,csrfHash}),
    reserveQuota:()=>quota.reserveAttemptForFutureGateway(),
    providerCallsAuthorized:false
  });
}
