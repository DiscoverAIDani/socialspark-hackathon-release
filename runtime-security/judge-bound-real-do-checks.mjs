/**
 * REAL LOCAL CLOUDFLARE WORKERD + SQLITE Durable Object tests, but:
 * - no production deployment / production Wrangler bindings
 * - no user credentials, judge emails, real Turnstile, Nebius call or cost
 * - no live JWT keys, no live Access team or operator provisioning
 *
 * This validates a v2 judge-bound ledger's atomic RPC semantics and the
 * offline identity+session+quota composition using synthetic signed tokens.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {
  BOUND_SESSION_LEDGER_KEY,offlineBoundSessionFixture
} from '../cloudflare/judge-bound-session-core.mjs';
import {offlineBoundIssueJudgeSession,offlineBoundCheckJudgeGenerate}
 from '../cloudflare/judge-bound-auth-offline-pipeline.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {inspectOfflineJudgeAccessJwt} from '../cloudflare/judge-access-jwt-offline.mjs';
import {TURNSTILE_JUDGE_ACTION} from '../cloudflare/judge-turnstile-core.mjs';
import {JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState} from '../cloudflare/judge-quota-core.mjs';
import {RATE_LIMIT_LEDGER_KEY,offlineRateFixture}
 from '../cloudflare/judge-rate-core.mjs';

const hex=c=>c.repeat(64);
const alice=hex('a'),bob=hex('b'),sessionHash=hex('c'),csrfHash=hex('d');
const bindingName='local-only-identity-bound-session-v2';
const stub=(name=bindingName)=>env.TEST_BOUND_SESSIONS.get(
  env.TEST_BOUND_SESSIONS.idFromName(name));
const init=async(name=bindingName)=>runInDurableObject(stub(name),(_obj,ctx)=>{
  ctx.storage.kv.put(BOUND_SESSION_LEDGER_KEY,offlineBoundSessionFixture());
});
const issue=async(s,bind=alice,session=sessionHash,csrf=csrfHash)=>
  s.issueBoundDigestForOfflineGateway({
    sessionHash:session,csrfHash:csrf,judgeBindingDigest:bind
  });
const consume=async(s,bind=alice,session=sessionHash,csrf=csrfHash)=>
  s.consumeBoundDigestForOfflineGateway({
    sessionHash:session,csrfHash:csrf,judgeBindingDigest:bind
  });
const view=async(s)=>runInDurableObject(s,(_obj,ctx)=>
  ctx.storage.kv.get(BOUND_SESSION_LEDGER_KEY));

describe('real local SQLite DO — identity-bound one-use sessions, NO DEPLOY',()=>{
  it('fails closed without provisioning, with no automatic reset/init',async()=>{
    const s=stub('missing-bound-ledger');
    expect((await issue(s)).allowed).toBe(false);
    expect((await consume(s)).allowed).toBe(false);
    expect(await view(s)).toBeUndefined();
  });

  it('only bound judge can consume; other approved identity does not burn session',async()=>{
    await init();const s=stub();
    expect((await issue(s)).allowed).toBe(true);
    expect((await consume(s,bob)).allowed).toBe(false);
    expect((await view(s)).consumedLifetime).toBe(0);
    expect((await view(s)).active).toHaveLength(1);
    expect((await consume(s,alice)).allowed).toBe(true);
    expect((await consume(s,alice)).allowed).toBe(false);
    const data=await view(s);
    expect(data.consumedLifetime).toBe(1);
    expect(data.active).toHaveLength(0);
    expect(JSON.stringify(data)).not.toContain('judge@example.org');
  });

  it('persists denial of replays after object eviction/restart',async()=>{
    await init();const s=stub();
    expect((await issue(s)).allowed).toBe(true);
    expect((await consume(s,alice)).allowed).toBe(true);
    await evictDurableObject(s);
    expect((await consume(s,alice)).allowed).toBe(false);
    expect((await view(s)).consumedLifetime).toBe(1);
  });

  it('concurrent replay of ONE pair permits exactly one consume',async()=>{
    await init();const s=stub();
    expect((await issue(s)).allowed).toBe(true);
    const results=await Promise.all(Array.from({length:25},()=>consume(s)));
    expect(results.filter(r=>r.allowed===true)).toHaveLength(1);
    expect(results.filter(r=>r.allowed===false)).toHaveLength(24);
    expect((await view(s)).consumedLifetime).toBe(1);
  });

  it('separate subjects cannot consume one another in a concurrent burst',async()=>{
    await init();const s=stub();
    expect((await issue(s)).allowed).toBe(true);
    const denied=await Promise.all(
      Array.from({length:15},()=>consume(s,bob)));
    expect(denied.every(r=>r.allowed===false)).toBe(true);
    expect((await consume(s,alice)).allowed).toBe(true);
    expect((await view(s)).consumedLifetime).toBe(1);
  });

  it('corrupted or legacy v1 ledgers fail closed instead of resetting',async()=>{
    await init();const s=stub();
    await runInDurableObject(s,(_obj,ctx)=>{
      ctx.storage.kv.put(BOUND_SESSION_LEDGER_KEY,{version:1,active:[]});
    });
    expect((await issue(s)).allowed).toBe(false);
    expect((await consume(s)).allowed).toBe(false);
    expect((await view(s)).version).toBe(1);
  });

  it('invalid zero/missing and mismatched digests fail before SQLite write',async()=>{
    await init();const s=stub();
    for(const args of [
      {sessionHash:'bad',csrfHash,judgeBindingDigest:alice},
      {sessionHash:csrfHash,csrfHash,judgeBindingDigest:alice},
      {sessionHash,csrfHash,judgeBindingDigest:'bad'},
      {sessionHash,csrfHash},
      {sessionHash:'0'.repeat(64),csrfHash,judgeBindingDigest:'bad'}
    ]){
      expect((await s.issueBoundDigestForOfflineGateway(args)).allowed).toBe(false);
    }
    expect((await view(s)).issuedLifetime).toBe(0);
  });

  it('actual fixture HTTP always 404/503, never exposes v2 ledger or AI',async()=>{
    const session=await exports.default.fetch(
      'https://judge.example.org'+JUDGE_SESSION_PATH,{method:'POST'});
    const generation=await exports.default.fetch(
      'https://judge.example.org'+JUDGE_API_PATH,{method:'POST'});
    expect(session.status).toBe(404);
    expect(generation.status).toBe(503);
    expect((await generation.json()).code).toBe('judge-live-ai-disabled');
  });
});

describe('local real DO with synthetic signed JWT + mock security pipeline',()=>{
  it('a signed judge may issue; a different signed judge cannot consume',async()=>{
    const s=stub('local-bound-pipeline-flow');
    const quota=env.TEST_QUOTA.get(env.TEST_QUOTA.idFromName(
      'local-bound-pipeline-quota'));
    const rate=env.TEST_RATE.get(env.TEST_RATE.idFromName(
      'local-bound-pipeline-rate'));
    await runInDurableObject(s,(_obj,ctx)=>
      ctx.storage.kv.put(BOUND_SESSION_LEDGER_KEY,offlineBoundSessionFixture()));
    await runInDurableObject(quota,(_obj,ctx)=>
      ctx.storage.kv.put(JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()));
    await runInDurableObject(rate,(_obj,ctx)=>
      ctx.storage.kv.put(RATE_LIMIT_LEDGER_KEY,offlineRateFixture()));

    const kp=await crypto.subtle.generateKey(
      {name:'RSASSA-PKCS1-v1_5',modulusLength:2048,
        publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},
      true,['sign','verify']);
    const pub={...await crypto.subtle.exportKey('jwk',kp.publicKey),
      kid:'local-kid-1',use:'sig',alg:'RS256'};
    const at=Date.now(),now=Math.floor(at/1000);
    const origin='https://judge.example.org';
    const issuer='https://fictionalteam.cloudflareaccess.com';
    const audience='a'.repeat(32);
    const header={kid:'local-kid-1',alg:'RS256',typ:'JWT'};
    const jwt=async (who)=>{
      const claims={iss:issuer,aud:[audience],type:'app',
        sub:who==='A'?'stable-a':'stable-b',
        email:who==='A'?'a@example.org':'b@example.org',
        iat:now-30,nbf:now-30,exp:now+600};
      const enc=o=>btoa(JSON.stringify(o)).replace(/\+/g,'-')
        .replace(/\//g,'_').replace(/=+$/,'');
      const contents=enc(header)+'.'+enc(claims);
      const signature=await crypto.subtle.sign(
        'RSASSA-PKCS1-v1_5',kp.privateKey,new TextEncoder().encode(contents));
      const str=String.fromCharCode(...new Uint8Array(signature));
      return contents+'.'+btoa(str).replace(/\+/g,'-')
        .replace(/\//g,'_').replace(/=+$/,'');
    };
    const a=await jwt('A'),b=await jwt('B');
    const auth={
      expectedIssuer:issuer,expectedAudience:audience,
      approvedJudgeEmails:['a@example.org','b@example.org'],
      trustedJwks:{keys:[pub]},nowMs:at,
      identityBindingKey:new Uint8Array(32).fill(17),
      cryptoImpl:crypto
    };
    const make=(path,token,extra={})=>new Request(origin+path,{
      method:'POST',
      headers:{
        Origin:origin,'Sec-Fetch-Site':'same-origin',
        'Content-Type':'application/json',
        'Cf-Access-Jwt-Assertion':token,...extra
      },
      body:JSON.stringify(path===JUDGE_SESSION_PATH?
        {turnstileToken:'synthetic-local-turnstile'}:
        {exampleId:'fictional-beginner-workshop'})
    });
    const proof=await inspectOfflineJudgeAccessJwt({request:make(JUDGE_SESSION_PATH,a),...auth});
    expect(proof.allowed, JSON.stringify({proof,publicKeyShape:{
      kty:pub.kty,kid:pub.kid,alg:pub.alg,use:pub.use,
      e:pub.e,modulusChars:pub.n?.length,
      prototypeOk:Object.getPrototypeOf(pub)===Object.prototype,
      hasPrivateParts:['d','p','q','dp','dq','qi','oth','k'].filter(x=>Object.hasOwn(pub,x))
    }})).toBe(true);
    const issued=await offlineBoundIssueJudgeSession(make(JUDGE_SESSION_PATH,a),{
      auth,session:{
        expectedOrigin:origin,expectedHostname:'judge.example.org',nowMs:at,
        turnstileSecret:'SYNTHETIC_ONLY_SECRET',
        siteverifyTransport:async()=>Response.json({
          success:true,hostname:'judge.example.org',
          action:TURNSTILE_JUDGE_ACTION,
          challenge_ts:new Date(at-1000).toISOString()
        }),
        reserveRateSlot:()=>rate.reserveForFutureSessionIssuer(),
        issueBoundSessionDigest:args=>
          s.issueBoundDigestForOfflineGateway(args)
      }
    });
    expect(issued.accepted, JSON.stringify(issued)).toBe(true);
    expect(issued.providerCallsAuthorized).toBe(false);
    const forGen=who=>make(JUDGE_API_PATH,who,{
      Cookie:issued.setCookieTemplate.split(';')[0],
      'X-SocialSpark-Csrf':issued.csrfToken
    });
    const opts={auth,generate:{
      expectedOrigin:origin,nowMs:at,
      consumeBoundSessionDigest:args=>
        s.consumeBoundDigestForOfflineGateway(args),
      checkGenerateAbuse:async()=>true,
      measureInputTokens:async()=>120, // fake tokenizer
      checkVerifiedPrice:async()=>true, // fake provider pricing
      reserveQuota:()=>quota.reserveAttemptForFutureGateway()
    }};
    const stolen=await offlineBoundCheckJudgeGenerate(forGen(b),opts);
    expect(stolen.accepted).toBe(false);
    expect(stolen.providerCallsAuthorized).toBe(false);
    expect((await quota.readLifetimeStatusForOwner()).attempts).toBe(0);
    const legitimate=await offlineBoundCheckJudgeGenerate(forGen(a),opts);
    expect(legitimate.accepted).toBe(true);
    expect(legitimate.providerCallsAuthorized).toBe(false);
    expect((await quota.readLifetimeStatusForOwner()).attempts).toBe(1);
    await evictDurableObject(s);
    expect((await offlineBoundCheckJudgeGenerate(forGen(a),opts)).accepted)
      .toBe(false);
  });
});
