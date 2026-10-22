/**
 * End-to-end LOCAL workerd + SQLite judge rehearsal. The verification,
 * tokenizer, pricing and provider response are all FAKE / injected locally.
 *
 * This is intentionally a TEST, not a production Worker or HTTP handler.
 * No NVIDIA request, Cloudflare Siteverify request, billing or deployment.
 * A green test DOES NOT constitute working live judge access.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {
  LOCAL_JUDGE_CANONICAL_BINDINGS,makeLocalJudgeBindingServices
} from '../cloudflare/judge-local-binding-services.mjs';
import {offlineIssueWithStop,offlineGenerateWithStop}
  from '../cloudflare/judge-offline-shutdown-gate.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {buildOfflineNemotronEnvelope}
  from '../cloudflare/judge-nemotron-envelope-offline.mjs';
import {inspectOfflineProviderCompletion}
  from '../cloudflare/judge-provider-response-offline.mjs';
import {JUDGE_PRICING_REFERENCE,estimateOfflineJudgeMaximum}
  from '../cloudflare/judge-model-pricing-offline.mjs';
import {JUDGE_DEMO_POLICY} from '../security/judge-demo-policy.mjs';
import {FIXTURE_DRAFTS} from '../security/nebius-fake-session.mjs';
import {
  JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState
} from '../cloudflare/judge-quota-core.mjs';
import {
  RATE_LIMIT_LEDGER_KEY,offlineRateFixture
} from '../cloudflare/judge-rate-core.mjs';
import {
  JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture
} from '../cloudflare/judge-session-core.mjs';
import {
  JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture
} from '../cloudflare/judge-emergency-stop-core.mjs';
import {TURNSTILE_JUDGE_ACTION}
  from '../cloudflare/judge-turnstile-core.mjs';

const ORIGIN='https://fictional-judge-ci.invalid';
const EXAMPLE='fictional-beginner-workshop';
const get=(binding,name)=>binding.get(binding.idFromName(name));

async function initializeOnlyInTestFramework(){
  for(const [binding,canonical,key,value] of [
    [env.TEST_SESSIONS,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_SESSIONS,
      JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE,
      RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA,
      JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()],
    [env.TEST_STOP,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_STOP,
      JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture()]
  ]){
    await runInDurableObject(get(binding,canonical),(_object,state)=>{
      state.storage.kv.put(key,value);
    });
  }
}
function issueRequest(){
  return new Request(ORIGIN+JUDGE_SESSION_PATH,{
    method:'POST',
    headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json'},
    body:JSON.stringify({turnstileToken:'FAKE_ONE_USE_CHALLENGE_FOR_CI'})
  });
}
function generateRequest(session){
  return new Request(ORIGIN+JUDGE_API_PATH,{
    method:'POST',
    headers:{Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',
      Cookie:session.setCookieTemplate.split(';')[0],
      'X-SocialSpark-Csrf':session.csrfToken},
    body:JSON.stringify({exampleId:EXAMPLE})
  });
}
function mockTrustedServices(durable,{denyPricing=false}={}){
  const nowMs=Date.now();
  const calls={siteverify:0,tokenizer:0,pricing:0};
  return {
    calls,
    settings:{
      ...durable,expectedOrigin:ORIGIN,
      expectedHostname:new URL(ORIGIN).hostname,
      turnstileSecret:'CI_FAKE_SECRET_NO_REAL_CLOUDFLARE_ACCESS',
      nowMs,
      siteverifyTransport:async()=>{
        calls.siteverify++;
        return Response.json({
          success:true,hostname:new URL(ORIGIN).hostname,
          action:TURNSTILE_JUDGE_ACTION,
          challenge_ts:new Date(nowMs-1000).toISOString()
        });
      },
      checkGenerateAbuse:async()=>true, // LOCAL MOCK only, not security in prod
      measureInputTokens:async()=>{
        calls.tokenizer++;return 300; // LOCAL MOCK, NOT model-compatible
      },
      checkVerifiedPrice:async()=>{
        calls.pricing++;
        return !denyPricing; // LOCAL MOCK, not provider quote
      }
    }
  };
}
function pretendNebiusResponse(overrides={}){
  return {
    model:JUDGE_DEMO_POLICY.model,
    choices:[{index:0,finish_reason:'stop',message:{
      role:'assistant',content:JSON.stringify(FIXTURE_DRAFTS)
    }}],
    usage:{prompt_tokens:300,completion_tokens:500,total_tokens:800},
    ...overrides
  };
}

describe('complete fictional-only preflight -> mock request -> fake result',()=>{
  it('composes canonical SQLite security, fake request/response, and cost estimate',async()=>{
    await initializeOnlyInTestFramework();
    const durable=makeLocalJudgeBindingServices(env);
    const fake=mockTrustedServices(durable);
    const session=await offlineIssueWithStop(issueRequest(),fake.settings);
    expect(session.accepted).toBe(true);
    expect(session.providerCallsAuthorized).toBe(false);
    const approvedPreflight=await offlineGenerateWithStop(
      generateRequest(session),fake.settings
    );
    expect(approvedPreflight.accepted).toBe(true);
    expect(approvedPreflight.exampleId).toBe(EXAMPLE);
    expect(approvedPreflight.providerCallsAuthorized).toBe(false);

    // The request is assembled in local memory only, never sent anywhere.
    const body=await buildOfflineNemotronEnvelope({
      request:{exampleId:EXAMPLE},
      countTrustedTokens:async()=>300 // still an injected test counter
    });
    expect(body.ok).toBe(true);
    expect(body.providerCallsAuthorized).toBe(false);
    expect(body.auditedWireBytes).toBe(1038);
    expect(body.requestBody.max_tokens).toBe(1250);
    expect(body.requestBody.stream).toBe(false);

    const prices=estimateOfflineJudgeMaximum({
      model:JUDGE_DEMO_POLICY.model,
      pricing:{...JUDGE_PRICING_REFERENCE},
      maxInputTokens:2000,maxOutputTokens:1250,
      automaticRetries:0
    });
    expect(prices.ok).toBe(true);
    expect(prices.providerCallsAuthorized).toBe(false);
    expect(prices.perAttemptMicroUsd).toBe(420);

    // Fake provider response is NEVER allowed to reach a public route.
    const result=inspectOfflineProviderCompletion({
      envelope:pretendNebiusResponse(),exampleId:EXAMPLE
    });
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('offline-response-rehearsal-only');
    expect(result.providerCallsAuthorized).toBe(false);
    expect(result.estimatedMicroUsd).toBe(138);
    expect(result.drafts).toStrictEqual(FIXTURE_DRAFTS);
    expect(fake.calls).toStrictEqual({
      siteverify:1,tokenizer:1,pricing:1
    });

    const q=get(env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA);
    await evictDurableObject(q);
    expect((await q.readLifetimeStatusForOwner()).attempts).toBe(1);
    const replay=await offlineGenerateWithStop(
      generateRequest(session),fake.settings
    );
    expect(replay.accepted).toBe(false);
    expect((await q.readLifetimeStatusForOwner()).attempts).toBe(1);
  });

  it('bad fake provider output is blocked AFTER quota reservation, never refunded',async()=>{
    await initializeOnlyInTestFramework();
    const services=mockTrustedServices(makeLocalJudgeBindingServices(env));
    const session=await offlineIssueWithStop(issueRequest(),services.settings);
    expect(session.accepted).toBe(true);
    const preflight=await offlineGenerateWithStop(generateRequest(session),
      services.settings);
    expect(preflight.accepted).toBe(true);

    const bad=inspectOfflineProviderCompletion({
      envelope:pretendNebiusResponse({
        usage:{prompt_tokens:300,completion_tokens:500,total_tokens:799}
      }),exampleId:EXAMPLE
    });
    expect(bad.ok).toBe(false);
    expect(bad.reason).toBe('untrusted-or-excessive-provider-usage');
    expect(bad.providerCallsAuthorized).toBe(false);
    const q=get(env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA);
    expect((await q.readLifetimeStatusForOwner()).attempts).toBe(1);
    // This is NOT proof a genuine provider would refund an already billed call.
  });

  it('unverified price prevents reservation and all mock provider handling',async()=>{
    await initializeOnlyInTestFramework();
    const services=mockTrustedServices(makeLocalJudgeBindingServices(env),
      {denyPricing:true});
    const session=await offlineIssueWithStop(issueRequest(),services.settings);
    expect(session.accepted).toBe(true);
    const preflight=await offlineGenerateWithStop(
      generateRequest(session),services.settings
    );
    expect(preflight.accepted).toBe(false);
    expect(preflight.providerCallsAuthorized).toBe(false);
    const q=get(env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA);
    expect((await q.readLifetimeStatusForOwner()).attempts).toBe(0);
    expect(services.calls).toStrictEqual({siteverify:1,tokenizer:1,pricing:1});
  });

  it('latched stop blocks session before fake Siteverify; real route remains disabled',async()=>{
    await initializeOnlyInTestFramework();
    const durable=makeLocalJudgeBindingServices(env);
    const stop=get(env.TEST_STOP,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_STOP);
    expect((await stop.latchStopForFutureOwner()).stopped).toBe(true);
    const fake=mockTrustedServices(durable);
    const session=await offlineIssueWithStop(issueRequest(),fake.settings);
    expect(session.accepted).toBe(false);
    expect(fake.calls).toStrictEqual({siteverify:0,tokenizer:0,pricing:0});
    const actual=await exports.default.fetch(ORIGIN+JUDGE_API_PATH,{
      method:'POST',body:'{}'
    });
    expect(actual.status).toBe(503);
    const sessionRoute=await exports.default.fetch(ORIGIN+JUDGE_SESSION_PATH);
    expect(sessionRoute.status).toBe(404);
  });
});
