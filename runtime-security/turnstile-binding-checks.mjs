/**
 * REAL local Cloudflare workerd + SQLite Durable Objects.
 * ZERO Cloudflare Siteverify network calls and ZERO paid AI requests.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {
  makeOfflineTurnstileSessionServices,
  issueOfflineJudgeSessionWithTurnstile,
  JUDGE_TURNSTILE_SECRET_BINDING
} from '../cloudflare/judge-turnstile-secret-binding-offline.mjs';
import {LOCAL_JUDGE_CANONICAL_BINDINGS}
  from '../cloudflare/judge-local-binding-services.mjs';
import {JUDGE_TURNSTILE_PUBLIC}
  from '../judge-preview/turnstile-public-config.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {TURNSTILE_JUDGE_ACTION,TURNSTILE_VERIFY_ENDPOINT}
  from '../cloudflare/judge-turnstile-core.mjs';
import {offlineRateFixture,RATE_LIMIT_LEDGER_KEY}
  from '../cloudflare/judge-rate-core.mjs';
import {offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY}
  from '../cloudflare/judge-session-core.mjs';
import {offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY}
  from '../cloudflare/judge-quota-core.mjs';
import {offlineEmergencyStopFixture,JUDGE_STOP_LEDGER_KEY}
  from '../cloudflare/judge-emergency-stop-core.mjs';

const ORIGIN='https://'+JUDGE_TURNSTILE_PUBLIC.hostname;
const FAKE_SECRET='FAKE_SERVER_ONLY_SECRET_FOR_TESTS_NOT_PRODUCTION';
const FAKE_CHALLENGE='FAKE_BROWSER_CHALLENGE_TOKEN_ONLY';
const stub=(binding,name)=>binding.get(binding.idFromName(name));

function fixtureEnv(secret=FAKE_SECRET){
  return {
    TEST_QUOTA:env.TEST_QUOTA,TEST_SESSIONS:env.TEST_SESSIONS,
    TEST_RATE:env.TEST_RATE,TEST_STOP:env.TEST_STOP,
    [JUDGE_TURNSTILE_SECRET_BINDING]:secret
  };
}
async function initializeLocalSqlite(){
  const names=LOCAL_JUDGE_CANONICAL_BINDINGS;
  const fixtures=[
    [env.TEST_QUOTA,names.TEST_QUOTA,JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()],
    [env.TEST_SESSIONS,names.TEST_SESSIONS,JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [env.TEST_RATE,names.TEST_RATE,RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [env.TEST_STOP,names.TEST_STOP,JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture()]
  ];
  for(const [binding,name,key,value] of fixtures){
    await runInDurableObject(stub(binding,name),(_obj,state)=>{
      state.storage.kv.put(key,value);
    });
  }
}
function request({origin=ORIGIN,token=FAKE_CHALLENGE,extra={}}={}){
  return new Request(ORIGIN+JUDGE_SESSION_PATH,{
    method:'POST',
    headers:{
      Origin:origin,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({turnstileToken:token,...extra})
  });
}
function fakeSiteverify({success=true,hostname=JUDGE_TURNSTILE_PUBLIC.hostname,
  action=TURNSTILE_JUDGE_ACTION,replay=false}={}){
  let calls=0;
  const transport=async(url,init)=>{
    calls++;
    expect(url).toBe(TURNSTILE_VERIFY_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const body=JSON.parse(init.body);
    expect(body.secret).toBe(FAKE_SECRET);
    expect(body.response).toBe(FAKE_CHALLENGE);
    // This is ONLY a fake Cloudflare response: NEVER real Siteverify.
    return Response.json({
      success:success&&(!replay||calls===1),
      hostname,action,
      challenge_ts:new Date(Date.now()-500).toISOString()
    });
  };
  return {transport,calls:()=>calls};
}

describe('offline Turnstile secret binding + canonical durable session',()=>{
  it('uses a secret from server-only env and a mock Siteverify; no AI enabled',async()=>{
    await initializeLocalSqlite();
    const verify=fakeSiteverify();
    const services=makeOfflineTurnstileSessionServices(fixtureEnv(),{
      siteverifyTransport:verify.transport
    });
    expect(services).not.toBeNull();
    expect(services.providerCallsAuthorized).toBe(false);
    expect(services.expectedOrigin).toBe(ORIGIN);
    expect(services.expectedHostname).toBe(JUDGE_TURNSTILE_PUBLIC.hostname);
    expect(services.turnstileSecret).toBe(FAKE_SECRET);
    const issued=await issueOfflineJudgeSessionWithTurnstile(
      request(),fixtureEnv(),{siteverifyTransport:verify.transport});
    expect(issued.accepted).toBe(true);
    expect(issued.providerCallsAuthorized).toBe(false);
    expect(issued.setCookieTemplate).toContain('Secure; HttpOnly; SameSite=Strict');
    expect(issued.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(verify.calls()).toBe(1);
    const rate=stub(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    const sessions=stub(env.TEST_SESSIONS,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_SESSIONS);
    await evictDurableObject(sessions);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(1);
    const stored=await runInDurableObject(sessions,(_obj,state)=>
      state.storage.kv.get(JUDGE_SESSION_LEDGER_KEY));
    expect(stored.issuedLifetime).toBe(1);
    expect(stored.active).toHaveLength(1);
    expect(JSON.stringify(stored)).not.toContain(FAKE_CHALLENGE);
    const actual=await exports.default.fetch(ORIGIN+JUDGE_API_PATH,{
      method:'POST',body:'{}'});
    expect(actual.status).toBe(503);
    expect((await actual.json()).code).toBe('judge-live-ai-disabled');
    const noSession=await exports.default.fetch(ORIGIN+JUDGE_SESSION_PATH);
    expect(noSession.status).toBe(404);
  });

  it('missing or mistaken secret and missing transport fail before any lookup',async()=>{
    await initializeLocalSqlite();
    const verify=fakeSiteverify();
    for(const secret of [undefined,'',JUDGE_TURNSTILE_PUBLIC.siteKey,
      'x',123,FAKE_SECRET+'\n']){
      const result=await issueOfflineJudgeSessionWithTurnstile(
        request(),fixtureEnv(secret),{siteverifyTransport:verify.transport});
      expect(result.accepted).toBe(false);
      expect(result.providerCallsAuthorized).toBe(false);
    }
    const missingTransport=await issueOfflineJudgeSessionWithTurnstile(
      request(),fixtureEnv());
    expect(missingTransport.accepted).toBe(false);
    expect(verify.calls()).toBe(0);
    const rate=stub(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(0);
  });

  it('forged origin or extra content never reaches verification',async()=>{
    await initializeLocalSqlite();
    const verify=fakeSiteverify();
    for(const req of [
      request({origin:'https://attacker.invalid'}),
      request({extra:{postText:'private unreviewed post'}})
    ]){
      const value=await issueOfflineJudgeSessionWithTurnstile(
        req,fixtureEnv(),{siteverifyTransport:verify.transport});
      expect(value.accepted).toBe(false);
      expect(value.providerCallsAuthorized).toBe(false);
    }
    expect(verify.calls()).toBe(0);
  });

  it('Siteverify rejection, wrong hostname and wrong action block session issuance',async()=>{
    await initializeLocalSqlite();
    for(const options of [
      {success:false},
      {hostname:'attacker.invalid'},
      {action:'something_else'}
    ]){
      const fake=fakeSiteverify(options);
      const result=await issueOfflineJudgeSessionWithTurnstile(
        request(),fixtureEnv(),{siteverifyTransport:fake.transport});
      expect(result.accepted).toBe(false);
      expect(result.providerCallsAuthorized).toBe(false);
      expect(fake.calls()).toBe(1);
    }
    const rate=stub(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(0);
  });

  it('duplicate challenge redemption is rejected without reissuing a session',async()=>{
    await initializeLocalSqlite();
    const fake=fakeSiteverify({replay:true});
    const first=await issueOfflineJudgeSessionWithTurnstile(
      request(),fixtureEnv(),{siteverifyTransport:fake.transport});
    expect(first.accepted).toBe(true);
    const replay=await issueOfflineJudgeSessionWithTurnstile(
      request(),fixtureEnv(),{siteverifyTransport:fake.transport});
    expect(replay.accepted).toBe(false);
    expect(fake.calls()).toBe(2);
    const rate=stub(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(1);
  });

  it('latched emergency stop denies before contacting even mocked Siteverify',async()=>{
    await initializeLocalSqlite();
    const stop=stub(env.TEST_STOP,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_STOP);
    expect((await stop.latchStopForFutureOwner()).stopped).toBe(true);
    const fake=fakeSiteverify();
    const outcome=await issueOfflineJudgeSessionWithTurnstile(
      request(),fixtureEnv(),{siteverifyTransport:fake.transport});
    expect(outcome.accepted).toBe(false);
    expect(outcome.providerCallsAuthorized).toBe(false);
    expect(fake.calls()).toBe(0);
  });
});
