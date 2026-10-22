/**
 * OFFLINE judge pipeline integration in real local workerd + SQLite Durable Objects.
 *
 * NEVER A PUBLIC ROUTE. This test uses injected fake Turnstile, tokenizer,
 * pricing, and anti-abuse decisions. It contains NO Nebius transport or secret.
 * Passing these tests does not enable live AI or prove production readiness.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject} from 'cloudflare:test';
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate,JUDGE_SESSION_PATH
} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {
  JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction
} from '../cloudflare/judge-session-core.mjs';
import {RATE_LIMIT_LEDGER_KEY,offlineRateFixture} from '../cloudflare/judge-rate-core.mjs';
import {JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState} from '../cloudflare/judge-quota-core.mjs';
import {TURNSTILE_VERIFY_ENDPOINT,TURNSTILE_JUDGE_ACTION}
  from '../cloudflare/judge-turnstile-core.mjs';

const ORIGIN='https://socialspark-test.invalid';
const FIXED_EXAMPLE='fictional-beginner-workshop';
const FAKE_SECRET='LOCAL_TEST_ONLY_FAKE_TURNSTILE_SECRET';
const makeStub=(binding,name)=>binding.get(binding.idFromName(name));

async function fixtures(name,{seedQuota=true}={}) {
  const sessions=makeStub(env.TEST_SESSIONS,'offline-integration-sessions-'+name);
  const rate=makeStub(env.TEST_RATE,'offline-integration-rate-'+name);
  const quota=makeStub(env.TEST_QUOTA,'offline-integration-quota-'+name);
  // Explicit test-framework-only initialization: NO public provisioning route.
  await runInDurableObject(sessions,(_obj,state)=>{
    state.storage.kv.put(JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture());
  });
  await runInDurableObject(rate,(_obj,state)=>{
    state.storage.kv.put(RATE_LIMIT_LEDGER_KEY,offlineRateFixture());
  });
  if(seedQuota) {
    await runInDurableObject(quota,(_obj,state)=>{
      state.storage.kv.put(JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState());
    });
  }
  return {sessions,rate,quota};
}

function services({sessions,rate,quota},{rejectSiteverify=false}={}) {
  const nowMs=Date.now();
  let challengeCalls=0,pricingCalls=0,tokenCalls=0;
  const settings={
    expectedOrigin:ORIGIN,
    expectedHostname:new URL(ORIGIN).hostname,
    nowMs,
    turnstileSecret:FAKE_SECRET,
    siteverifyTransport:async (url,init)=>{
      challengeCalls++;
      expect(url).toBe(TURNSTILE_VERIFY_ENDPOINT);
      expect(init.method).toBe('POST');
      expect(JSON.parse(init.body).secret).toBe(FAKE_SECRET);
      return Response.json({
        success:!rejectSiteverify,
        hostname:new URL(ORIGIN).hostname,
        action:TURNSTILE_JUDGE_ACTION,
        challenge_ts:new Date(nowMs-1_000).toISOString()
      });
    },
    reserveRateSlot:async()=>rate.reserveForFutureSessionIssuer(),
    issueSessionDigest:args=>runInDurableObject(sessions,(_obj,state)=>
      state.storage.transactionSync(()=>
        issueJudgeSessionInTransaction(state.storage.kv,args))),
    consumeSessionDigest:args=>runInDurableObject(sessions,(_obj,state)=>
      state.storage.transactionSync(()=>
        consumeJudgeSessionInTransaction(state.storage.kv,args))),
    checkGenerateAbuse:async()=>true, // FAKE — not a real bot or DoS protection
    measureInputTokens:async({idea,tone,maxOutputTokens})=>{
      tokenCalls++;
      expect(idea).toBe('Invite people to a fictional beginner workshop.');
      expect(tone).toBe('friendly');
      expect(maxOutputTokens).toBe(1250);
      return 120; // FAKE — no production tokenizer wired
    },
    checkVerifiedPrice:async()=>{
      pricingCalls++;
      return true; // FAKE — no authoritative Nebius price assertion
    },
    reserveQuota:()=>quota.reserveAttemptForFutureGateway()
  };
  return {settings,counts:()=>({challengeCalls,pricingCalls,tokenCalls})};
}

function sessionRequest(token='FAKE_OFFLINE_CHALLENGE_ONLY') {
  return new Request(ORIGIN+JUDGE_SESSION_PATH,{
    method:'POST',
    headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
    body:JSON.stringify({turnstileToken:token})
  });
}
function generationRequest(issued,overrides={}) {
  return new Request(ORIGIN+JUDGE_API_PATH,{
    method:'POST',
    headers:{
      Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',
      Cookie:issued.setCookieTemplate.split(';',1)[0],
      'X-SocialSpark-Csrf':overrides.csrf??issued.csrfToken
    },
    body:JSON.stringify({exampleId:overrides.exampleId??FIXED_EXAMPLE})
  });
}

describe('local workerd — integrated offline judge safeguards, never model inference',()=>{
  it('connects fake challenge to REAL Durable Object rate, one-use session and quota',async()=>{
    const state=await fixtures('successful-one');
    const service=services(state);
    const issued=await offlineIssueJudgeSession(sessionRequest(),service.settings);
    expect(issued.accepted).toBe(true);
    expect(issued.providerCallsAuthorized).toBe(false);
    expect(issued.setCookieTemplate).toContain('HttpOnly; SameSite=Strict');

    const checked=await offlineCheckJudgeGenerate(generationRequest(issued),service.settings);
    expect(checked).toStrictEqual({
      accepted:true,code:'offline-preflight-only',
      exampleId:FIXED_EXAMPLE,providerCallsAuthorized:false
    });
    expect(service.counts()).toStrictEqual({challengeCalls:1,pricingCalls:1,tokenCalls:1});
    expect((await state.rate.inspectForOwner()).lifetimeCount).toBe(1);
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    expect((await state.quota.readLifetimeStatusForOwner()).reservedCents).toBe(5);

    // The ACTUAL Worker HTTP route remains permanently OFF, even after
    // a preflight simulation succeeded using injected fake dependencies.
    const publicResponse=await exports.default.fetch(ORIGIN+JUDGE_API_PATH,{
      method:'POST',
      headers:{Origin:ORIGIN,'Content-Type':'application/json'},
      body:JSON.stringify({exampleId:FIXED_EXAMPLE})
    });
    expect(publicResponse.status).toBe(503);
    expect(await publicResponse.json()).toStrictEqual({
      ok:false,code:'judge-live-ai-disabled'
    });
  });

  it('replayed CSRF pair cannot reserve a second attempt',async()=>{
    const state=await fixtures('replayed-one');
    const service=services(state);
    const issued=await offlineIssueJudgeSession(sessionRequest(),service.settings);
    expect(issued.accepted).toBe(true);
    expect((await offlineCheckJudgeGenerate(
      generationRequest(issued),service.settings)).accepted).toBe(true);
    const replay=await offlineCheckJudgeGenerate(
      generationRequest(issued),service.settings);
    expect(replay.accepted).toBe(false);
    expect(replay.providerCallsAuthorized).toBe(false);
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    expect(service.counts().tokenCalls).toBe(1);
  });

  it('missing persistent quota ledger fails closed after one-time session consumption',async()=>{
    const state=await fixtures('missing-quota',{seedQuota:false});
    const service=services(state);
    const issued=await offlineIssueJudgeSession(sessionRequest(),service.settings);
    expect(issued.accepted).toBe(true);
    const result=await offlineCheckJudgeGenerate(
      generationRequest(issued),service.settings);
    expect(result).toStrictEqual({
      accepted:false,code:'quota-reservation-denied',providerCallsAuthorized:false
    });
    expect(await state.quota.readLifetimeStatusForOwner()).toBeNull();
    expect((await offlineCheckJudgeGenerate(
      generationRequest(issued),service.settings)).accepted).toBe(false);
  });

  it('mock Siteverify rejection prevents rate and session issuance',async()=>{
    const state=await fixtures('siteverify-denial');
    const service=services(state,{rejectSiteverify:true});
    const result=await offlineIssueJudgeSession(sessionRequest(),service.settings);
    expect(result.accepted).toBe(false);
    expect(result.providerCallsAuthorized).toBe(false);
    expect((await state.rate.inspectForOwner()).lifetimeCount).toBe(0);
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(0);
  });
});
