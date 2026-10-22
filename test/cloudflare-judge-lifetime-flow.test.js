import test from 'node:test';
import assert from 'node:assert/strict';
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate,
  JUDGE_SESSION_PATH
} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {
  offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction
} from '../cloudflare/judge-session-core.mjs';
import {
  offlineRateFixture,RATE_LIMIT_LEDGER_KEY,
  reserveSessionIssueRateInTransaction
} from '../cloudflare/judge-rate-core.mjs';
import {
  offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY,
  reserveJudgeAttemptInTransaction
} from '../cloudflare/judge-quota-core.mjs';
import {TURNSTILE_JUDGE_ACTION} from '../cloudflare/judge-turnstile-core.mjs';

const origin='https://socialspark-demo.example.org';
const epoch=Date.UTC(2026,9,21,20,0,0);

test('full offline pipeline reserves exactly 20 lifetime attempts and 100 cents; 21st denies despite a valid session',async()=>{
  const entries=new Map([
    [JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()]
  ]);
  const kv={
    get:key=>entries.has(key)?structuredClone(entries.get(key)):undefined,
    put:(key,value)=>entries.set(key,structuredClone(value))
  };
  const transactionSync=cb=>{
    const before=new Map([...entries].map(([key,value])=>[key,structuredClone(value)]));
    try{return cb();}catch(err){entries.clear();for(const [key,value] of before)entries.set(key,value);throw err;}
  };
  const service={
    expectedOrigin:origin,expectedHostname:new URL(origin).hostname,
    turnstileSecret:'TEST_ONLY_NEVER_DEPLOYED_SITEVERIFY_SECRET',
    nowMs:epoch,
    siteverifyTransport:async()=>Response.json({
      success:true,
      hostname:new URL(origin).hostname,
      action:TURNSTILE_JUDGE_ACTION,
      challenge_ts:new Date(service.nowMs-15_000).toISOString()
    }),
    reserveRateSlot:async args=>
      transactionSync(()=>reserveSessionIssueRateInTransaction(kv,args)),
    issueSessionDigest:async args=>
      transactionSync(()=>issueJudgeSessionInTransaction(kv,args)),
    consumeSessionDigest:async args=>
      transactionSync(()=>consumeJudgeSessionInTransaction(kv,args)),
    checkGenerateAbuse:async()=>true,
    measureInputTokens:async()=>2000,
    checkVerifiedPrice:async()=>true,
    reserveQuota:async()=>transactionSync(()=>reserveJudgeAttemptInTransaction(kv))
  };

  const results=[];
  for(let n=0;n<21;n++){
    // No more than 3 sessions per minute; no more than 20/hour.
    service.nowMs=epoch+(n===20?3_600_000:Math.floor(n/3)*60_000);
    const sessionReq=new Request(origin+JUDGE_SESSION_PATH,{
      method:'POST',
      headers:{Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json'},
      body:JSON.stringify({turnstileToken:'offline-fictional-turnstile-'+n})
    });
    const session=await offlineIssueJudgeSession(sessionReq,service);
    assert.equal(session.accepted,true,'session '+n);
    assert.equal(session.providerCallsAuthorized,false);

    const generationReq=new Request(origin+JUDGE_API_PATH,{
      method:'POST',
      headers:{
        Origin:origin,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',
        Cookie:session.setCookieTemplate.split(';',1)[0],
        'X-SocialSpark-Csrf':session.csrfToken
      },
      body:JSON.stringify({exampleId:'fictional-beginner-workshop'})
    });
    const outcome=await offlineCheckJudgeGenerate(generationReq,service);
    assert.equal(outcome.providerCallsAuthorized,false);
    results.push(outcome);
  }

  assert.equal(results.filter(x=>x.accepted).length,20);
  assert.equal(results[20].accepted,false);
  assert.equal(results[20].code,'quota-reservation-denied');
  assert.equal(kv.get(JUDGE_QUOTA_STORAGE_KEY).attempts,20);
  assert.equal(kv.get(JUDGE_QUOTA_STORAGE_KEY).reservedCents,100);
  assert.equal(kv.get(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,21);
  assert.equal(kv.get(RATE_LIMIT_LEDGER_KEY).lifetimeCount,21);
  // This entire test used fake Siteverify and made ZERO model/API calls.
});
