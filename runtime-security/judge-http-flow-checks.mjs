/**
 * LOCAL TEST ONLY — HTTP-shaped judge demo rehearsal, never deployed.
 *
 * The external response shape and HTTP protections are exercised here using
 * real local Cloudflare SQLite-backed Durable Objects and fake security
 * dependencies. The actual Worker's default fetch handler is unchanged and
 * continues to return 503 for generation and 404 for session issuance.
 *
 * No provider transport, credentials, HTTP activation, or real Turnstile
 * Siteverify exists in this file. Do NOT export the localRoute helper from
 * the deployed fixture Worker or copy mock services into a public Worker.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject} from 'cloudflare:test';
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate,JUDGE_SESSION_PATH
} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {
  offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction
} from '../cloudflare/judge-session-core.mjs';
import {
  offlineRateFixture,RATE_LIMIT_LEDGER_KEY
} from '../cloudflare/judge-rate-core.mjs';
import {
  offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY
} from '../cloudflare/judge-quota-core.mjs';
import {
  TURNSTILE_VERIFY_ENDPOINT,TURNSTILE_JUDGE_ACTION
} from '../cloudflare/judge-turnstile-core.mjs';

const ORIGIN='https://socialspark-offline-contract.invalid';
const EXAMPLE='fictional-beginner-workshop';
const FAKE_SECRET='LOCAL_ONLY_FAKE_SITEVERIFY_SECRET_000';
const SAFE_HEADERS=Object.freeze({
  'Content-Type':'application/json; charset=utf-8',
  'Cache-Control':'no-store, max-age=0',
  'Referrer-Policy':'no-referrer',
  'X-Content-Type-Options':'nosniff',
  'Content-Security-Policy':"default-src 'none'; connect-src 'none'; frame-ancestors 'none'"
});
const stub=(binding,name)=>binding.get(binding.idFromName(name));

/** Only the test framework may initialize ledgers. No HTTP init route. */
async function testStorage(label,{withQuota=true}={}) {
  const sessions=stub(env.TEST_SESSIONS,'http-sessions-'+label);
  const rate=stub(env.TEST_RATE,'http-rate-'+label);
  const quota=stub(env.TEST_QUOTA,'http-quota-'+label);
  await runInDurableObject(sessions,(_object,state)=>{
    state.storage.kv.put(JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture());
  });
  await runInDurableObject(rate,(_object,state)=>{
    state.storage.kv.put(RATE_LIMIT_LEDGER_KEY,offlineRateFixture());
  });
  if(withQuota) {
    await runInDurableObject(quota,(_object,state)=>{
      state.storage.kv.put(JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState());
    });
  }
  return {sessions,rate,quota};
}

function dependencies(state,{rejectChallenge=false}={}) {
  const nowMs=Date.now();
  let verified=0,tokenChecks=0,priceChecks=0;
  return {
    counts:()=>({verified,tokenChecks,priceChecks}),
    settings:{
      expectedOrigin:ORIGIN,
      expectedHostname:new URL(ORIGIN).hostname,
      turnstileSecret:FAKE_SECRET,
      nowMs,
      siteverifyTransport:async(url,init)=>{
        verified++;
        expect(url).toBe(TURNSTILE_VERIFY_ENDPOINT);
        expect(init.method).toBe('POST');
        expect(JSON.parse(init.body).secret).toBe(FAKE_SECRET);
        return Response.json({
          success:!rejectChallenge,
          hostname:new URL(ORIGIN).hostname,
          action:TURNSTILE_JUDGE_ACTION,
          challenge_ts:new Date(nowMs-1000).toISOString()
        });
      },
      reserveRateSlot:()=>state.rate.reserveForFutureSessionIssuer(),
      issueSessionDigest:args=>runInDurableObject(state.sessions,(_object,ctx)=>
        ctx.storage.transactionSync(()=>
          issueJudgeSessionInTransaction(ctx.storage.kv,args))),
      consumeSessionDigest:args=>runInDurableObject(state.sessions,(_object,ctx)=>
        ctx.storage.transactionSync(()=>
          consumeJudgeSessionInTransaction(ctx.storage.kv,args))),
      checkGenerateAbuse:async()=>true, // fake only
      measureInputTokens:async()=>{
        tokenChecks++;
        return 120; // fake only; NOT a model tokenizer
      },
      checkVerifiedPrice:async()=>{
        priceChecks++;
        return true; // fake only; NOT verified provider pricing
      },
      reserveQuota:()=>state.quota.reserveAttemptForFutureGateway()
    }
  };
}

function jsonResponse(status,data,extra={}) {
  return new Response(JSON.stringify(data),{
    status,headers:{...SAFE_HEADERS,...extra}
  });
}

/**
 * This function is deliberately PRIVATE TO THE TEST FILE.
 * It models HTTP response boundaries, NOT an internet-facing Worker.
 */
async function localRoute(request,settings) {
  let path;
  try {path=new URL(request.url).pathname;} catch {
    return jsonResponse(404,{ok:false,code:'not-found',providerCallsAuthorized:false});
  }
  if(path===JUDGE_SESSION_PATH) {
    const result=await offlineIssueJudgeSession(request,settings);
    if(result.accepted!==true) {
      return jsonResponse(403,{
        ok:false,code:'judge-demo-not-authorized',providerCallsAuthorized:false
      });
    }
    return jsonResponse(200,{
      ok:true,mode:'offline-test-only',
      csrfToken:result.csrfToken,
      providerCallsAuthorized:false
    },{'Set-Cookie':result.setCookieTemplate});
  }
  if(path===JUDGE_API_PATH) {
    const result=await offlineCheckJudgeGenerate(request,settings);
    if(result.accepted!==true) {
      return jsonResponse(403,{
        ok:false,code:'judge-demo-not-authorized',providerCallsAuthorized:false
      });
    }
    return jsonResponse(200,{
      ok:true,mode:'offline-preflight-only',
      providerCallsAuthorized:false
    });
  }
  return jsonResponse(404,{ok:false,code:'not-found',providerCallsAuthorized:false});
}

function sessionRequest({origin=ORIGIN,token='fake-challenge-123',extra={}}={}) {
  return new Request(ORIGIN+JUDGE_SESSION_PATH,{
    method:'POST',headers:{
      Origin:origin,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json'
    },
    body:JSON.stringify({turnstileToken:token,...extra})
  });
}
function generateRequest(cookie,csrf,{origin=ORIGIN,extra={}}={}) {
  return new Request(ORIGIN+JUDGE_API_PATH,{
    method:'POST',
    headers:{
      Origin:origin,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',
      Cookie:cookie.split(';',1)[0],
      'X-SocialSpark-Csrf':csrf
    },
    body:JSON.stringify({exampleId:EXAMPLE,...extra})
  });
}

describe('LOCAL-ONLY HTTP response contract: no inference, no deployment',()=>{
  it('issues a secure test cookie; fake preflight gives no drafts or paid authorization',async()=>{
    const state=await testStorage('success');
    const service=dependencies(state);
    const session=await localRoute(sessionRequest(),service.settings);
    expect(session.status).toBe(200);
    expect(session.headers.get('cache-control')).toContain('no-store');
    expect(session.headers.get('access-control-allow-origin')).toBeNull();
    expect(session.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Strict');
    const sessionBody=await session.json();
    expect(sessionBody.providerCallsAuthorized).toBe(false);
    expect(sessionBody.csrfToken).toMatch(/^[0-9a-f]{64}$/);

    const check=await localRoute(generateRequest(
      session.headers.get('set-cookie'),sessionBody.csrfToken),service.settings);
    expect(check.status).toBe(200);
    expect(await check.json()).toStrictEqual({
      ok:true,mode:'offline-preflight-only',providerCallsAuthorized:false
    });
    expect(check.headers.get('set-cookie')).toBeNull();
    expect(service.counts()).toStrictEqual({
      verified:1,tokenChecks:1,priceChecks:1
    });
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    expect((await state.quota.readLifetimeStatusForOwner()).reservedCents).toBe(5);
    expect((await state.rate.inspectForOwner()).lifetimeCount).toBe(1);

    // Crucially, the actually configured default Worker has NOT been replaced.
    const actual=await exports.default.fetch(ORIGIN+JUDGE_API_PATH,{
      method:'POST',body:JSON.stringify({exampleId:EXAMPLE})
    });
    expect(actual.status).toBe(503);
    expect(await actual.json()).toStrictEqual({
      ok:false,code:'judge-live-ai-disabled'
    });
    const actualSession=await exports.default.fetch(ORIGIN+JUDGE_SESSION_PATH);
    expect(actualSession.status).toBe(404);
  });

  it('never allows replaying a used cookie+CSRF pair or replaying quota',async()=>{
    const state=await testStorage('one-use');
    const service=dependencies(state);
    const issued=await localRoute(sessionRequest(),service.settings);
    const body=await issued.json();
    const cookie=issued.headers.get('set-cookie');
    const first=await localRoute(generateRequest(cookie,body.csrfToken),service.settings);
    expect(first.status).toBe(200);
    const replay=await localRoute(generateRequest(cookie,body.csrfToken),service.settings);
    expect(replay.status).toBe(403);
    expect(await replay.json()).toStrictEqual({
      ok:false,code:'judge-demo-not-authorized',providerCallsAuthorized:false
    });
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    expect(service.counts().tokenChecks).toBe(1);
  });

  it('rejects forged origin and extra prompts without revealing internals',async()=>{
    const state=await testStorage('forged');
    const service=dependencies(state);
    const forged=await localRoute(sessionRequest({origin:'https://attacker.invalid'}),service.settings);
    expect(forged.status).toBe(403);
    const unexpected=await localRoute(sessionRequest({extra:{postText:'private text'}}),service.settings);
    expect(unexpected.status).toBe(403);
    expect(forged.headers.get('set-cookie')).toBeNull();
    expect(service.counts().verified).toBe(0);
    expect((await state.rate.inspectForOwner()).lifetimeCount).toBe(0);
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(0);
  });

  it('missing quota state denies with no provider call and does not initialize it',async()=>{
    const state=await testStorage('unprovisioned',{withQuota:false});
    const service=dependencies(state);
    const issued=await localRoute(sessionRequest(),service.settings);
    expect(issued.status).toBe(200);
    const body=await issued.json();
    const preflight=await localRoute(generateRequest(
      issued.headers.get('set-cookie'),body.csrfToken),service.settings);
    expect(preflight.status).toBe(403);
    expect(await preflight.json()).toStrictEqual({
      ok:false,code:'judge-demo-not-authorized',providerCallsAuthorized:false
    });
    expect(await state.quota.readLifetimeStatusForOwner()).toBeNull();
  });

  it('fake Turnstile rejection prevents sessions and quotas, default Worker remains off',async()=>{
    const state=await testStorage('turnstile-rejected');
    const service=dependencies(state,{rejectChallenge:true});
    const response=await localRoute(sessionRequest(),service.settings);
    expect(response.status).toBe(403);
    expect(response.headers.get('set-cookie')).toBeNull();
    expect((await state.rate.inspectForOwner()).lifetimeCount).toBe(0);
    expect((await state.quota.readLifetimeStatusForOwner()).attempts).toBe(0);
    expect(service.counts().tokenChecks).toBe(0);
  });
});
