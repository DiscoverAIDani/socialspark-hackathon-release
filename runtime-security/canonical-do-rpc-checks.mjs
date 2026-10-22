/**
 * LOCAL-ONLY Cloudflare workerd integration using real Durable Object RPC.
 * Mocked Siteverify/tokenizer/pricing; NO networked provider/API access.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {
  makeLocalJudgeBindingServices,LOCAL_JUDGE_CANONICAL_BINDINGS
} from '../cloudflare/judge-local-binding-services.mjs';
import {
  offlineIssueWithStop,offlineGenerateWithStop
} from '../cloudflare/judge-offline-shutdown-gate.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY}
  from '../cloudflare/judge-session-core.mjs';
import {RATE_LIMIT_LEDGER_KEY,offlineRateFixture}
  from '../cloudflare/judge-rate-core.mjs';
import {JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState}
  from '../cloudflare/judge-quota-core.mjs';
import {JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture}
  from '../cloudflare/judge-emergency-stop-core.mjs';
import {TURNSTILE_JUDGE_ACTION}
  from '../cloudflare/judge-turnstile-core.mjs';

const ORIGIN='https://fictional-judge-ci.invalid';
const stub=(binding,name)=>binding.get(binding.idFromName(name));

async function seedAll(){
  const names=LOCAL_JUDGE_CANONICAL_BINDINGS;
  const records=[
    [env.TEST_SESSIONS,names.TEST_SESSIONS,JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [env.TEST_RATE,names.TEST_RATE,RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [env.TEST_QUOTA,names.TEST_QUOTA,JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()],
    [env.TEST_STOP,names.TEST_STOP,JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture()]
  ];
  for(const [binding,name,key,value] of records){
    await runInDurableObject(stub(binding,name),(_obj,state)=>{
      state.storage.kv.put(key,value);
    });
  }
}

function fakeSecurity(services){
  const nowMs=Date.now();
  let siteverify=0,tokenizer=0,pricing=0;
  return {
    settings:{
      ...services,
      expectedOrigin:ORIGIN,
      expectedHostname:new URL(ORIGIN).hostname,
      turnstileSecret:'LOCAL_FAKE_TURNSTILE_NOT_A_LIVE_SECRET',
      nowMs,
      siteverifyTransport:async()=>{
        siteverify++;
        return Response.json({
          success:true,
          hostname:new URL(ORIGIN).hostname,
          action:TURNSTILE_JUDGE_ACTION,
          challenge_ts:new Date(nowMs-1000).toISOString()
        });
      },
      checkGenerateAbuse:async()=>true, // test-only
      measureInputTokens:async()=>{
        tokenizer++;
        return 300; // NOT an approved server tokenizer
      },
      checkVerifiedPrice:async()=>{
        pricing++;
        return true; // NOT provider-attested pricing
      }
    },
    counts:()=>({siteverify,tokenizer,pricing})
  };
}
function sessionRequest(origin=ORIGIN){
  return new Request(ORIGIN+JUDGE_SESSION_PATH,{
    method:'POST',
    headers:{
      Origin:origin,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({turnstileToken:'FICTIONAL_CI_CHALLENGE'})
  });
}
function generateRequest(session){
  return new Request(ORIGIN+JUDGE_API_PATH,{
    method:'POST',
    headers:{
      Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',
      Cookie:session.setCookieTemplate.split(';')[0],
      'X-SocialSpark-Csrf':session.csrfToken
    },
    body:JSON.stringify({exampleId:'fictional-beginner-workshop'})
  });
}

describe('canonical local DO-backed judge preflight — NO AI requests',()=>{
  it('uses fixed object names for all four bindings, never user/IP sharding',()=>{
    const seen={};
    const wrapped={};
    for(const key of Object.keys(LOCAL_JUDGE_CANONICAL_BINDINGS)){
      seen[key]=[];
      wrapped[key]={
        idFromName:name=>{
          seen[key].push(name);
          return env[key].idFromName(name);
        },
        get:id=>env[key].get(id)
      };
    }
    const state=makeLocalJudgeBindingServices(wrapped);
    expect(state).not.toBeNull();
    expect(state.providerCallsAuthorized).toBe(false);
    for(const key of Object.keys(LOCAL_JUDGE_CANONICAL_BINDINGS))
      expect(seen[key]).toStrictEqual([LOCAL_JUDGE_CANONICAL_BINDINGS[key]]);
    expect(makeLocalJudgeBindingServices(null)).toBeNull();
    expect(makeLocalJudgeBindingServices({TEST_QUOTA:env.TEST_QUOTA})).toBeNull();
  });

  it('real SQLite DO RPC persists issue/consume/quota and forbids replay after eviction',async()=>{
    await seedAll();
    const services=makeLocalJudgeBindingServices(env);
    expect(services).not.toBeNull();
    const fake=fakeSecurity(services);
    const session=await offlineIssueWithStop(sessionRequest(),fake.settings);
    expect(session.accepted).toBe(true);
    expect(session.providerCallsAuthorized).toBe(false);
    expect(session.setCookieTemplate).toContain('HttpOnly; SameSite=Strict');

    const req=generateRequest(session);
    const first=await offlineGenerateWithStop(req,fake.settings);
    expect(first.accepted).toBe(true);
    expect(first.providerCallsAuthorized).toBe(false);

    const sessionStub=stub(env.TEST_SESSIONS,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_SESSIONS);
    const quotaStub=stub(env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA);
    const rateStub=stub(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    await evictDurableObject(sessionStub);
    await evictDurableObject(quotaStub);
    const replay=await offlineGenerateWithStop(generateRequest(session),fake.settings);
    expect(replay.accepted).toBe(false);
    expect(replay.providerCallsAuthorized).toBe(false);

    expect((await quotaStub.readLifetimeStatusForOwner()).attempts).toBe(1);
    expect((await quotaStub.readLifetimeStatusForOwner()).reservedCents).toBe(5);
    expect((await rateStub.inspectForOwner()).lifetimeCount).toBe(1);
    expect(fake.counts()).toStrictEqual({siteverify:1,tokenizer:1,pricing:1});

    const actual=await exports.default.fetch(ORIGIN+JUDGE_API_PATH,{
      method:'POST',
      headers:{Origin:ORIGIN},body:'{}'
    });
    expect(actual.status).toBe(503);
    expect((await actual.json()).code).toBe('judge-live-ai-disabled');
    const sessionRoute=await exports.default.fetch(ORIGIN+JUDGE_SESSION_PATH);
    expect(sessionRoute.status).toBe(404);
  });

  it('the live-inference stop latch denies requests without invoking any pricing path',async()=>{
    const services=makeLocalJudgeBindingServices(env);
    const fake=fakeSecurity(services);
    const stop=stub(env.TEST_STOP,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_STOP);
    expect((await stop.latchStopForFutureOwner()).stopped).toBe(true);
    const blocked=await offlineIssueWithStop(sessionRequest(),fake.settings);
    expect(blocked.accepted).toBe(false);
    expect(blocked.code).toBe('judge-emergency-stop-active');
    expect(fake.counts()).toStrictEqual({siteverify:0,tokenizer:0,pricing:0});
    // No public route can reset the Durable Object latch or authorize a model.
    const reset=await exports.default.fetch(ORIGIN+'/api/stop/reset',{
      method:'POST'
    });
    expect(reset.status).toBe(404);
  });
});
