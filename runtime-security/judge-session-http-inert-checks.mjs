/**
 * Workerd/SQLite tests for the unbound HTTP adapter using FAKE Siteverify.
 * NO production route or paid model transport is invoked.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {offlineJudgeSessionHttp}
  from '../cloudflare/judge-session-http-inert.mjs';
import {JUDGE_TURNSTILE_PUBLIC}
  from '../judge-preview/turnstile-public-config.mjs';
import {LOCAL_JUDGE_CANONICAL_BINDINGS}
  from '../cloudflare/judge-local-binding-services.mjs';
import {JUDGE_TURNSTILE_SECRET_BINDING}
  from '../cloudflare/judge-turnstile-secret-binding-offline.mjs';
import {TURNSTILE_JUDGE_ACTION,TURNSTILE_VERIFY_ENDPOINT}
  from '../cloudflare/judge-turnstile-core.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY}
  from '../cloudflare/judge-session-core.mjs';
import {offlineRateFixture,RATE_LIMIT_LEDGER_KEY}
  from '../cloudflare/judge-rate-core.mjs';
import {offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY}
  from '../cloudflare/judge-quota-core.mjs';
import {offlineEmergencyStopFixture,JUDGE_STOP_LEDGER_KEY}
  from '../cloudflare/judge-emergency-stop-core.mjs';

const ORIGIN='https://'+JUDGE_TURNSTILE_PUBLIC.hostname;
const SECRET='LOCAL_FAKE_SERVER_SECRET_NOT_REAL_000000';
const CHALLENGE='FAKE_SITEVERIFY_HTTP_CHALLENGE';
const named=(binding,name)=>binding.get(binding.idFromName(name));
const bindings=()=>({
  TEST_SESSIONS:env.TEST_SESSIONS,
  TEST_RATE:env.TEST_RATE,
  TEST_QUOTA:env.TEST_QUOTA,
  TEST_STOP:env.TEST_STOP,
  [JUDGE_TURNSTILE_SECRET_BINDING]:SECRET
});
async function seed(){
  const entries=[
    [env.TEST_SESSIONS,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_SESSIONS,
      JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE,
      RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA,
      JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()],
    [env.TEST_STOP,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_STOP,
      JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture()]
  ];
  for(const [binding,name,key,value] of entries){
    await runInDurableObject(named(binding,name),(_obj,state)=>{
      state.storage.kv.put(key,value);
    });
  }
}
function request({path=JUDGE_SESSION_PATH,method='POST',origin=ORIGIN,token=CHALLENGE,query=''}={}){
  return new Request(ORIGIN+path+query,{
    method,
    headers:{
      Origin:origin,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json'
    },
    ...(method==='POST'?{body:JSON.stringify({turnstileToken:token})}:{})
  });
}
const fakeSiteverify=({valid=true}={})=>{
  let used=0;
  return {
    calls:()=>used,
    transport:async(url,options)=>{
      used++;
      expect(url).toBe(TURNSTILE_VERIFY_ENDPOINT);
      expect(options.method).toBe('POST');
      const body=JSON.parse(options.body);
      expect(body.secret).toBe(SECRET);
      expect(body.response).toBe(CHALLENGE);
      return Response.json({
        success:valid,
        hostname:JUDGE_TURNSTILE_PUBLIC.hostname,
        action:TURNSTILE_JUDGE_ACTION,
        challenge_ts:new Date(Date.now()-1000).toISOString()
      });
    }
  };
};

describe('unbound offline HTTP session adapter',()=>{
  it('issues no-store secure cookie from valid fake verification and no draft access',async()=>{
    await seed();
    const fake=fakeSiteverify();
    const response=await offlineJudgeSessionHttp(
      request(),bindings(),{siteverifyTransport:fake.transport}
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store, max-age=0');
    expect(response.headers.get('set-cookie')).toContain(
      'Path=/; Max-Age=120; Secure; HttpOnly; SameSite=Strict');
    const result=await response.json();
    expect(result.ok).toBe(true);
    expect(result.mode).toBe('offline-only-session-assembly');
    expect(result.providerCallsAuthorized).toBe(false);
    expect(result.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    expect(fake.calls()).toBe(1);

    const quota=named(env.TEST_QUOTA,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_QUOTA);
    expect((await quota.readLifetimeStatusForOwner()).attempts).toBe(0);
    const rate=named(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(1);

    const actual=await exports.default.fetch(request());
    expect(actual.status).toBe(404);
    expect((await exports.default.fetch(request({
      path:JUDGE_API_PATH
    }))).status).toBe(503);
  });

  it('missing test transport denies without calling anything or setting cookies',async()=>{
    await seed();
    const response=await offlineJudgeSessionHttp(request(),bindings());
    expect(response.status).toBe(503);
    expect(await response.json()).toStrictEqual({
      ok:false,code:'judge-session-unavailable',
      providerCallsAuthorized:false
    });
    expect(response.headers.has('set-cookie')).toBe(false);
    const rate=named(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(0);
  });

  it('malformed origin, unknown path and wrong method cannot issue sessions',async()=>{
    await seed();
    const fake=fakeSiteverify();
    for(const req of [
      request({origin:'https://attacker.invalid'}),
      request({path:'/api/judge-demo/unknown'}),
      request({query:'?prompt=private'}),
      request({method:'GET'})
    ]){
      const result=await offlineJudgeSessionHttp(
        req,bindings(),{siteverifyTransport:fake.transport}
      );
      expect(result.status).not.toBe(200);
      expect(result.headers.has('set-cookie')).toBe(false);
      expect((await result.json()).providerCallsAuthorized).toBe(false);
    }
    expect(fake.calls()).toBe(0);
  });

  it('Siteverify rejection never sets cookie or consumes rate/quota',async()=>{
    await seed();
    const fake=fakeSiteverify({valid:false});
    const response=await offlineJudgeSessionHttp(
      request(),bindings(),{siteverifyTransport:fake.transport}
    );
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
    const rate=named(env.TEST_RATE,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_RATE);
    expect((await rate.inspectForOwner()).lifetimeCount).toBe(0);
    expect(fake.calls()).toBe(1);
  });

  it('session issue survives eviction; no bearer token is stored in SQLite',async()=>{
    await seed();
    const fake=fakeSiteverify();
    const response=await offlineJudgeSessionHttp(
      request(),bindings(),{siteverifyTransport:fake.transport}
    );
    expect(response.status).toBe(200);
    const ses=named(env.TEST_SESSIONS,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_SESSIONS);
    await evictDurableObject(ses);
    const state=await runInDurableObject(ses,(_obj,ctx)=>
      ctx.storage.kv.get(JUDGE_SESSION_LEDGER_KEY));
    expect(state.issuedLifetime).toBe(1);
    expect(state.active).toHaveLength(1);
    expect(JSON.stringify(state)).not.toContain(CHALLENGE);
    const resp=await response.json();
    expect(JSON.stringify(state)).not.toContain(resp.csrfToken);
  });

  it('emergency-stop prevents HTTP session issuance before Siteverify',async()=>{
    await seed();
    const stop=named(env.TEST_STOP,LOCAL_JUDGE_CANONICAL_BINDINGS.TEST_STOP);
    expect((await stop.latchStopForFutureOwner()).stopped).toBe(true);
    const fake=fakeSiteverify();
    const response=await offlineJudgeSessionHttp(
      request(),bindings(),{siteverifyTransport:fake.transport}
    );
    expect(response.status).toBe(403);
    expect(response.headers.has('set-cookie')).toBe(false);
    expect(fake.calls()).toBe(0);
  });

  it('all generation HTTP requests remain permanently disabled',async()=>{
    const fake=fakeSiteverify();
    for(const method of ['GET','POST']){
      const response=await offlineJudgeSessionHttp(
        request({path:JUDGE_API_PATH,method}),bindings(),
        {siteverifyTransport:fake.transport}
      );
      expect(response.status).toBe(503);
      expect((await response.json()).code).toBe('judge-live-ai-disabled');
      expect(response.headers.has('set-cookie')).toBe(false);
    }
    expect(fake.calls()).toBe(0);
  });
});
