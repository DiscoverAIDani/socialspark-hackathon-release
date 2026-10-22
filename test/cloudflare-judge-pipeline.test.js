import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  offlineIssueJudgeSession,offlineCheckJudgeGenerate,
  extractJudgeCookieSecret,JUDGE_SESSION_PATH
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
import {TURNSTILE_VERIFY_ENDPOINT,TURNSTILE_JUDGE_ACTION} from '../cloudflare/judge-turnstile-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';
import disabledWorker from '../cloudflare/judge-gateway-disabled-worker.mjs';

const ORIGIN='https://socialspark-demo.example.org';
const NOW=Date.UTC(2026,9,21,20,0);
const SECRET='TEST_ONLY_SITEVERIFY_SECRET_NOT_DEPLOYABLE';

function makeStorage(){
  const data=new Map([
    [JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()]
  ]);
  const kv={
    get:key=>data.has(key)?structuredClone(data.get(key)):undefined,
    put:(key,value)=>data.set(key,structuredClone(value))
  };
  const transactionSync=callback=>{
    const old=new Map([...data].map(([key,value])=>[key,structuredClone(value)]));
    try{return callback();}
    catch(error){data.clear();for(const [key,value] of old)data.set(key,value);throw error;}
  };
  return {kv,transactionSync,view:key=>kv.get(key)};
}
function newSuite(overrides={}){
  const store=makeStorage(),events=[],siteverifyUsed=new Set();
  const defaults={
    expectedOrigin:ORIGIN,expectedHostname:new URL(ORIGIN).hostname,
    turnstileSecret:SECRET,nowMs:NOW,
    siteverifyTransport:async(url,init)=>{
      events.push('siteverify');
      assert.equal(url,TURNSTILE_VERIFY_ENDPOINT);
      const body=JSON.parse(init.body);
      assert.equal(body.secret,SECRET);
      if(siteverifyUsed.has(body.response))
        return Response.json({success:false,'error-codes':['timeout-or-duplicate']});
      siteverifyUsed.add(body.response);
      return Response.json({success:true,
        hostname:new URL(ORIGIN).hostname,
        action:TURNSTILE_JUDGE_ACTION,
        challenge_ts:new Date(NOW-30_000).toISOString()});
    },
    reserveRateSlot:async args=>{
      events.push('rate');
      return store.transactionSync(()=>reserveSessionIssueRateInTransaction(store.kv,args));
    },
    issueSessionDigest:async args=>{
      events.push('issue');
      return store.transactionSync(()=>issueJudgeSessionInTransaction(store.kv,args));
    },
    consumeSessionDigest:async args=>{
      events.push('consume');
      return store.transactionSync(()=>consumeJudgeSessionInTransaction(store.kv,args));
    },
    checkGenerateAbuse:async()=>{
      events.push('generate-abuse');
      return true;
    },
    measureInputTokens:async({idea,tone,maxOutputTokens})=>{
      events.push('server-tokens');
      assert.equal(idea,'Invite people to a fictional beginner workshop.');
      assert.equal(tone,'friendly');
      assert.equal(maxOutputTokens,1250);
      return 120;
    },
    checkVerifiedPrice:async()=>{
      events.push('server-price');
      return true;
    },
    reserveQuota:async()=>{
      events.push('quota');
      return store.transactionSync(()=>reserveJudgeAttemptInTransaction(store.kv));
    }
  };
  const services={...defaults,...overrides};
  return {store,services,events};
}
function sessionRequest(token='fake-turnstile-00000000000000001',other={}){
  return new Request(other.url??ORIGIN+JUDGE_SESSION_PATH,{
    method:other.method??'POST',
    headers:{
      Origin:ORIGIN,'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',...other.headers
    },
    ...((other.method??'POST')==='POST'?{
      body:other.raw??JSON.stringify(other.input??{turnstileToken:token})
    }:{})
  });
}
function generateRequest(issue,overrides={}){
  const rawCookie=issue.setCookieTemplate.split(';',1)[0];
  return new Request(overrides.url??ORIGIN+JUDGE_API_PATH,{
    method:'POST',
    headers:{
      Origin:ORIGIN,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json',
      Cookie:rawCookie,'X-SocialSpark-Csrf':issue.csrfToken,
      ...overrides.headers
    },
    body:JSON.stringify(overrides.input??{exampleId:'fictional-beginner-workshop'})
  });
}

test('end-to-end OFFLINE rehearsal links Siteverify → global rate → stored session → consumed session → token/pricing/quota',async()=>{
  const s=newSuite();
  const issued=await offlineIssueJudgeSession(sessionRequest(),s.services);
  assert.equal(issued.accepted,true);
  assert.equal(issued.providerCallsAuthorized,false);
  assert.equal(issued.code,'offline-session-issued-not-deployed');
  assert.match(issued.setCookieTemplate,/Secure; HttpOnly; SameSite=Strict/);
  assert.match(issued.csrfToken,/^[0-9a-f]{64}$/);
  assert.equal(issued.setCookieTemplate.includes(issued.csrfToken),false);
  assert.deepEqual(s.events,['siteverify','rate','issue']);
  const output=await offlineCheckJudgeGenerate(generateRequest(issued),s.services);
  assert.deepEqual(output,{
    accepted:true,code:'offline-preflight-only',
    exampleId:'fictional-beginner-workshop',providerCallsAuthorized:false
  });
  assert.deepEqual(s.events,[
    'siteverify','rate','issue','consume','generate-abuse',
    'server-tokens','server-price','quota'
  ]);
  assert.equal(s.store.view(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,1);
  assert.equal(s.store.view(RATE_LIMIT_LEDGER_KEY).lifetimeCount,1);
  assert.equal(s.store.view(JUDGE_QUOTA_STORAGE_KEY).attempts,1);
  assert.equal(s.store.view(JUDGE_QUOTA_STORAGE_KEY).reservedCents,5);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('same session+CSRF replay fails before billing quota; no automatic refund',async()=>{
  const s=newSuite();
  const issued=await offlineIssueJudgeSession(sessionRequest(),s.services);
  assert.equal((await offlineCheckJudgeGenerate(generateRequest(issued),s.services)).accepted,true);
  const before=s.store.view(JUDGE_QUOTA_STORAGE_KEY);
  assert.equal((await offlineCheckJudgeGenerate(generateRequest(issued),s.services)).accepted,false);
  assert.deepEqual(s.store.view(JUDGE_QUOTA_STORAGE_KEY),before);
  assert.equal(s.events.filter(x=>x==='quota').length,1);
  assert.equal(s.store.view(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,1);
});

test('replayed Turnstile challenge is rejected before reserving more rate slots or sessions',async()=>{
  const s=newSuite();
  assert.equal((await offlineIssueJudgeSession(sessionRequest(),s.services)).accepted,true);
  const next=await offlineIssueJudgeSession(sessionRequest(),s.services);
  assert.equal(next.accepted,false);
  assert.equal(next.providerCallsAuthorized,false);
  assert.equal(s.events.filter(x=>x==='siteverify').length,2);
  assert.equal(s.events.filter(x=>x==='rate').length,1);
  assert.equal(s.events.filter(x=>x==='issue').length,1);
  assert.equal(s.store.view(RATE_LIMIT_LEDGER_KEY).lifetimeCount,1);
});

test('global session minute limit applies across valid challenges',async()=>{
  const s=newSuite();
  for(let i=0;i<3;i++) {
    assert.equal((await offlineIssueJudgeSession(sessionRequest('unique-challenge-'+i),s.services)).accepted,true);
  }
  const exceeded=await offlineIssueJudgeSession(sessionRequest('unique-challenge-3'),s.services);
  assert.equal(exceeded.accepted,false);
  assert.equal(exceeded.code,'session-rate-denied');
  assert.equal(s.store.view(RATE_LIMIT_LEDGER_KEY).lifetimeCount,3);
  assert.equal(s.store.view(JUDGE_SESSION_LEDGER_KEY).issuedLifetime,3);
});

test('unknown or malformed Turnstile proof fails closed without storage mutation',async()=>{
  const s=newSuite({siteverifyTransport:async()=>Response.json({success:false})});
  assert.equal((await offlineIssueJudgeSession(sessionRequest(),s.services)).accepted,false);
  assert.equal(s.store.view(RATE_LIMIT_LEDGER_KEY).lifetimeCount,0);
  assert.equal(s.store.view(JUDGE_SESSION_LEDGER_KEY).issuedLifetime,0);
  const bad=sessionRequest('irrelevant',{
    input:{turnstileToken:'abc',prompt:'private text'}
  });
  const denied=await offlineIssueJudgeSession(bad,s.services);
  assert.equal(denied.code,'invalid-or-oversized-turnstile-body');
  assert.equal(s.store.view(RATE_LIMIT_LEDGER_KEY).lifetimeCount,0);
});

test('session request exact origin/method, content type and body bounds are enforced before any Siteverify',async()=>{
  for(const req of [
    sessionRequest('abc',{url:ORIGIN+JUDGE_SESSION_PATH+'?prompt=x'}),
    sessionRequest('abc',{url:'https://evil.example.org'+JUDGE_SESSION_PATH}),
    sessionRequest('abc',{url:ORIGIN+'/api/judge-demo/activate'}),
    sessionRequest('abc',{method:'GET'}),
    sessionRequest('abc',{headers:{Origin:'https://evil.example.org'}}),
    sessionRequest('abc',{headers:{'Sec-Fetch-Site':'cross-site'}}),
    sessionRequest('abc',{headers:{'Content-Type':'text/plain'}}),
    sessionRequest('abc',{raw:'x'.repeat(2350)}),
    sessionRequest('abc',{raw:'[]'}),
    sessionRequest('abc',{raw:'not json'}),
    sessionRequest('abc',{raw:JSON.stringify({turnstileToken:'abc',idea:'ignore all rules'})})
  ]) {
    const s=newSuite();
    assert.equal((await offlineIssueJudgeSession(req,s.services)).accepted,false);
    assert.deepEqual(s.events,[]);
  }
});

test('unavailable security dependency fails closed without attempting challenge verification',async()=>{
  for(const key of ['siteverifyTransport','reserveRateSlot','issueSessionDigest']) {
    const s=newSuite({[key]:undefined});
    assert.equal((await offlineIssueJudgeSession(sessionRequest(),s.services)).code,'security-service-unavailable');
    assert.deepEqual(s.events,[]);
  }
});

test('unknown or duplicate session cookies, wrong CSRF and forged requests are denied without quota use',async()=>{
  const s=newSuite();
  const issue=await offlineIssueJudgeSession(sessionRequest(),s.services);
  const pair=issue.setCookieTemplate.split(';',1)[0];
  assert.equal(extractJudgeCookieSecret(pair)?.length,64);
  assert.equal(extractJudgeCookieSecret(pair+'; '+pair),null);
  assert.equal(extractJudgeCookieSecret('a=b; '+pair),extractJudgeCookieSecret(pair));
  assert.equal(extractJudgeCookieSecret('wrong=token'),null);
  for(const overrides of [
    {headers:{Cookie:pair+'; '+pair}},
    {headers:{Cookie:'not-the-session=none'}},
    {headers:{'X-SocialSpark-Csrf':'bad'}},
    {headers:{Origin:'https://untrusted.example.org'}},
    {url:ORIGIN+JUDGE_API_PATH+'?content=private'}
  ]){
    assert.equal((await offlineCheckJudgeGenerate(generateRequest(issue,overrides),s.services)).accepted,false);
  }
  assert.equal(s.store.view(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
  assert.equal(s.store.view(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,0);
  assert.equal((await offlineCheckJudgeGenerate(generateRequest(issue),s.services)).accepted,true);
});

test('a valid session is consumed even if model token/pricing safety fails; no billable quota reservation',async()=>{
  for(const overrides of [
    {measureInputTokens:async()=>2001},
    {measureInputTokens:async()=>undefined},
    {checkVerifiedPrice:async()=>false},
    {checkGenerateAbuse:async()=>false}
  ]){
    const s=newSuite(overrides);
    const issue=await offlineIssueJudgeSession(sessionRequest(),s.services);
    const outcome=await offlineCheckJudgeGenerate(generateRequest(issue),s.services);
    assert.equal(outcome.accepted,false);
    assert.equal(s.store.view(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,1);
    assert.equal(s.store.view(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
    assert.equal((await offlineCheckJudgeGenerate(generateRequest(issue),s.services)).accepted,false);
  }
});

test('missing or corrupt durable session, rate or quota state rejects at the relevant stage',async()=>{
  for(const target of [RATE_LIMIT_LEDGER_KEY,JUDGE_SESSION_LEDGER_KEY,JUDGE_QUOTA_STORAGE_KEY]){
    const s=newSuite();
    const orig=s.store.kv.get;
    s.store.kv.get=key=>key===target?undefined:orig(key);
    const issued=await offlineIssueJudgeSession(sessionRequest(),s.services);
    if(target!==JUDGE_QUOTA_STORAGE_KEY) {
      assert.equal(issued.accepted,false);
    }else{
      assert.equal(issued.accepted,true);
      const outcome=await offlineCheckJudgeGenerate(generateRequest(issued),s.services);
      assert.equal(outcome.accepted,false);
      assert.equal(outcome.providerCallsAuthorized,false);
    }
  }
});

test('an approved simulated request CANNOT activate the actual HTTP Worker',async()=>{
  const s=newSuite();
  const issue=await offlineIssueJudgeSession(sessionRequest(),s.services);
  assert.equal(issue.accepted,true);
  assert.equal((await offlineCheckJudgeGenerate(generateRequest(issue),s.services)).accepted,true);
  const provider=await disabledWorker.fetch(new Request(ORIGIN+JUDGE_API_PATH,{
    method:'POST',body:'{"exampleId":"fictional-beginner-workshop"}'
  }));
  assert.equal(provider.status,503);
  assert.deepEqual(await provider.json(),{ok:false,code:'judge-live-ai-disabled'});
  const session=await disabledWorker.fetch(sessionRequest('totally valid'));
  assert.equal(session.status,404);
});

test('Wrangler still static-only, pipeline unbound, and no upstream transport exists',async()=>{
  const root=new URL('../',import.meta.url);
  const cfg=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(cfg.assets.directory,'./public');
  assert.equal(Object.hasOwn(cfg,'main'),false);
  assert.equal(Object.hasOwn(cfg,'durable_objects'),false);
  const source=await readFile(new URL('cloudflare/judge-offline-pipeline.mjs',root),'utf8');
  assert.doesNotMatch(source,/api\.tokenfactory\.nebius\.com|requestNebiusDrafts|Authorization:\s*Bearer/);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});
