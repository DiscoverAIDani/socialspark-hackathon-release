/** Offline-only stop-aware judge pipeline checks in REAL local workerd. */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject} from 'cloudflare:test';
import {
  offlineIssueWithStop,offlineGenerateWithStop
} from '../cloudflare/judge-offline-shutdown-gate.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {
  JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture
} from '../cloudflare/judge-emergency-stop-core.mjs';
import {
  offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction
} from '../cloudflare/judge-session-core.mjs';
import {RATE_LIMIT_LEDGER_KEY,offlineRateFixture} from '../cloudflare/judge-rate-core.mjs';
import {JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState} from '../cloudflare/judge-quota-core.mjs';
import {TURNSTILE_JUDGE_ACTION} from '../cloudflare/judge-turnstile-core.mjs';

const ORIGIN='https://fictional-judge-offline.invalid';
const fakeSecret='FAKE_ONLY_DO_NOT_DEPLOY_SECURITY_TOKEN';
const binding=(b,n)=>b.get(b.idFromName(n));

async function makeState(label,{seedStop=true}={}){
  const stop=binding(env.TEST_STOP,'guard-stop-'+label);
  const sessions=binding(env.TEST_SESSIONS,'guard-session-'+label);
  const rate=binding(env.TEST_RATE,'guard-rate-'+label);
  const quota=binding(env.TEST_QUOTA,'guard-quota-'+label);
  if(seedStop)await runInDurableObject(stop,(_obj,state)=>{
    state.storage.kv.put(JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture());
  });
  await runInDurableObject(sessions,(_obj,state)=>{
    state.storage.kv.put(JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture());
  });
  await runInDurableObject(rate,(_obj,state)=>{
    state.storage.kv.put(RATE_LIMIT_LEDGER_KEY,offlineRateFixture());
  });
  await runInDurableObject(quota,(_obj,state)=>{
    state.storage.kv.put(JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState());
  });
  return {stop,sessions,rate,quota};
}

function setup(state){
  const nowMs=Date.now();
  let challengeCount=0,tokenCount=0,quotaCount=0;
  const services={
    stopStub:state.stop,
    nowMs,
    expectedOrigin:ORIGIN,expectedHostname:new URL(ORIGIN).hostname,
    turnstileSecret:fakeSecret,
    siteverifyTransport:async()=>{
      challengeCount++;
      return Response.json({
        success:true,hostname:new URL(ORIGIN).hostname,
        action:TURNSTILE_JUDGE_ACTION,
        challenge_ts:new Date(nowMs-1000).toISOString()
      });
    },
    reserveRateSlot:()=>state.rate.reserveForFutureSessionIssuer(),
    issueSessionDigest:args=>runInDurableObject(state.sessions,(_obj,ctx)=>
      ctx.storage.transactionSync(()=>issueJudgeSessionInTransaction(ctx.storage.kv,args))),
    consumeSessionDigest:args=>runInDurableObject(state.sessions,(_obj,ctx)=>
      ctx.storage.transactionSync(()=>consumeJudgeSessionInTransaction(ctx.storage.kv,args))),
    checkGenerateAbuse:async()=>true, // fake only
    measureInputTokens:async()=>{
      tokenCount++;
      return 120; // fake tokenizer, no provider
    },
    checkVerifiedPrice:async()=>true, // fake pricing verification
    reserveQuota:async()=>{
      quotaCount++;
      return state.quota.reserveAttemptForFutureGateway();
    }
  };
  return {services,counts:()=>({challengeCount,tokenCount,quotaCount})};
}

function issueRequest(){
  return new Request(ORIGIN+JUDGE_SESSION_PATH,{
    method:'POST',
    headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
    body:JSON.stringify({turnstileToken:'FICTIONAL-CHALLENGE-ONLY'})
  });
}
function generateRequest(issued){
  return new Request(ORIGIN+JUDGE_API_PATH,{
    method:'POST',
    headers:{
      Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',
      Cookie:issued.setCookieTemplate.split(';',1)[0],
      'X-SocialSpark-Csrf':issued.csrfToken
    },
    body:JSON.stringify({exampleId:'fictional-beginner-workshop'})
  });
}

describe('local emergency-stop gating wraps simulated judge checks',()=>{
  it('clear local latch permits offline preflight but actual Worker stays disabled',async()=>{
    const state=await makeState('baseline');
    const s=setup(state);
    const session=await offlineIssueWithStop(issueRequest(),s.services);
    expect(session.accepted).toBe(true);
    expect(session.providerCallsAuthorized).toBe(false);
    const result=await offlineGenerateWithStop(generateRequest(session),s.services);
    expect(result.accepted).toBe(true);
    expect(result.providerCallsAuthorized).toBe(false);
    expect(s.counts()).toStrictEqual({
      challengeCount:1,tokenCount:1,quotaCount:1
    });
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    const actual=await exports.default.fetch(ORIGIN+JUDGE_API_PATH,{
      method:'POST',body:'{}'
    });
    expect(actual.status).toBe(503);
  });

  it('missing shutdown ledger blocks session before any challenge or quota',async()=>{
    const state=await makeState('missing-stop',{seedStop:false});
    const s=setup(state);
    const result=await offlineIssueWithStop(issueRequest(),s.services);
    expect(result).toStrictEqual({
      accepted:false,code:'judge-emergency-stop-active',providerCallsAuthorized:false
    });
    expect(s.counts()).toStrictEqual({
      challengeCount:0,tokenCount:0,quotaCount:0
    });
    expect((await state.rate.inspectForOwner()).lifetimeCount).toBe(0);
  });

  it('stopping after session issuance prevents generation and quota reservation',async()=>{
    const state=await makeState('stopped-between');
    const s=setup(state);
    const issued=await offlineIssueWithStop(issueRequest(),s.services);
    expect(issued.accepted).toBe(true);
    expect((await state.stop.latchStopForFutureOwner()).stopped).toBe(true);
    const blocked=await offlineGenerateWithStop(generateRequest(issued),s.services);
    expect(blocked).toStrictEqual({
      accepted:false,code:'judge-emergency-stop-active',providerCallsAuthorized:false
    });
    expect(s.counts().tokenCount).toBe(0);
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(0);
  });

  it('stop racing during quota reservation denies the final preflight, with no refund',async()=>{
    const state=await makeState('stopped-midflight');
    const s=setup(state);
    const issued=await offlineIssueWithStop(issueRequest(),s.services);
    expect(issued.accepted).toBe(true);
    const priorReserve=s.services.reserveQuota;
    s.services.reserveQuota=async()=>{
      const outcome=await priorReserve();
      expect((await state.stop.latchStopForFutureOwner()).stopped).toBe(true);
      return outcome;
    };
    const result=await offlineGenerateWithStop(generateRequest(issued),s.services);
    expect(result).toStrictEqual({
      accepted:false,code:'judge-emergency-stop-active',providerCallsAuthorized:false
    });
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    expect((await state.quota.readLifetimeStatusForOwner()).reservedCents).toBe(5);
    expect(s.counts().quotaCount).toBe(1);
  });

  it('unavailable or forged stop service never grants offline preflight',async()=>{
    const state=await makeState('unavailable-service');
    const s=setup(state);
    for(const stopStub of [
      undefined,
      {inspectForFutureGateway:async()=>{throw Error('storage-fault');}},
      {inspectForFutureGateway:async()=>({
        valid:true,stopped:false,
        reason:'offline-latch-clear-only',
        providerCallsAuthorized:true
      })},
      {inspectForFutureGateway:async()=>({
        valid:true,stopped:true,
        reason:'emergency-stop-latched',
        providerCallsAuthorized:false
      })}
    ]){
      const response=await offlineIssueWithStop(issueRequest(),{
        ...s.services,stopStub
      });
      expect(response.accepted).toBe(false);
      expect(response.providerCallsAuthorized).toBe(false);
    }
    expect(s.counts().challengeCount).toBe(0);
  });
});
