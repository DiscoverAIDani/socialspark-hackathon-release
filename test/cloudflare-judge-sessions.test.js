import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  JUDGE_SESSION_LEDGER_KEY, JUDGE_SESSION_INSTANCE_NAME, SESSION_COOKIE_NAME,
  SESSION_TTL_MS, MAX_ACTIVE_SESSIONS, MAX_ISSUED_SESSIONS_LIFETIME,
  offlineSessionFixture,generateJudgeSessionSecrets,hashJudgeSessionSecrets,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction,
  formatSecureJudgeCookie
} from '../cloudflare/judge-session-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

function storage(seed=offlineSessionFixture()) {
  const kvState=new Map();
  if(seed!==undefined)kvState.set(JUDGE_SESSION_LEDGER_KEY,structuredClone(seed));
  const kv={
    get:key=>kvState.has(key)?structuredClone(kvState.get(key)):undefined,
    put:(key,value)=>kvState.set(key,structuredClone(value))
  };
  function transactionSync(callback){
    const snapshot=new Map([...kvState].map(([key,value])=>[key,structuredClone(value)]));
    try {return callback();}
    catch(error){kvState.clear();for(const [key,value] of snapshot)kvState.set(key,value);throw error;}
  }
  return {
    kv,transactionSync,
    state:()=>kv.get(JUDGE_SESSION_LEDGER_KEY),
    issue:(hashes,nowMs)=>transactionSync(()=>issueJudgeSessionInTransaction(kv,{...hashes,nowMs})),
    consume:(hashes,nowMs)=>transactionSync(()=>consumeJudgeSessionInTransaction(kv,{...hashes,nowMs}))
  };
}
const hashed=async()=>hashJudgeSessionSecrets(generateJudgeSessionSecrets());

test('two separate unpredictable 256-bit secrets are generated; only hashes enter storage',async()=>{
  const a=generateJudgeSessionSecrets(),b=generateJudgeSessionSecrets();
  assert.match(a.cookieSecret,/^[0-9a-f]{64}$/);
  assert.match(a.csrfSecret,/^[0-9a-f]{64}$/);
  assert.notEqual(a.cookieSecret,a.csrfSecret);
  assert.notEqual(a.cookieSecret,b.cookieSecret);
  const digest=await hashJudgeSessionSecrets(a);
  assert.match(digest.sessionHash,/^[a-f0-9]{64}$/);
  assert.match(digest.csrfHash,/^[a-f0-9]{64}$/);
  assert.notEqual(digest.sessionHash,a.cookieSecret);
  assert.notEqual(digest.csrfHash,a.csrfSecret);
  const state=storage();
  assert.equal(state.issue(digest,1000).allowed,true);
  assert.doesNotMatch(JSON.stringify(state.state()),new RegExp(a.cookieSecret+'|'+a.csrfSecret));
  assert.equal(state.state().active.length,1);
});

test('single-use: correct cookie+CSRF pair consumes session exactly once',async()=>{
  const store=storage(),tokens=await hashed();
  assert.equal(store.issue(tokens,1000).allowed,true);
  assert.deepEqual(store.consume(tokens,1001),{allowed:true,reason:'offline-session-consumed'});
  assert.deepEqual(store.consume(tokens,1002),{allowed:false,reason:'session-not-found-or-replayed'});
  assert.equal(store.state().issuedLifetime,1);
  assert.equal(store.state().consumedLifetime,1);
  assert.equal(store.state().active.length,0);
});

test('wrong CSRF or cookie does not consume a valid session',async()=>{
  const store=storage(),a=await hashed(),b=await hashed();
  store.issue(a,1000);
  assert.equal(store.consume({sessionHash:a.sessionHash,csrfHash:b.csrfHash},1001).allowed,false);
  assert.equal(store.consume({sessionHash:b.sessionHash,csrfHash:a.csrfHash},1001).allowed,false);
  assert.equal(store.consume(a,1001).allowed,true);
});

test('two-minute TTL expires exactly at deadline; issue prunes expired records',async()=>{
  const store=storage(),a=await hashed(),b=await hashed();
  assert.equal(store.issue(a,1000).allowed,true);
  assert.equal(store.consume(a,1000+SESSION_TTL_MS).reason,'session-expired');
  assert.equal(store.issue(b,1001+SESSION_TTL_MS).allowed,true);
  assert.equal(store.state().active.length,1);
  assert.equal(store.consume(a,1002+SESSION_TTL_MS).allowed,false);
  assert.equal(store.consume(b,1002+SESSION_TTL_MS).allowed,true);
});

test('one shared ledger survives simulated restart; no reset on reconstruction',async()=>{
  const store=storage(),a=await hashed();
  store.issue(a,10_000);
  const secondInstance=()=>storage(store.state());
  const newObject=secondInstance();
  assert.equal(newObject.consume(a,10_001).allowed,true);
  const thirdInstance=storage(newObject.state());
  assert.equal(thirdInstance.consume(a,10_002).allowed,false);
  assert.equal(thirdInstance.state().issuedLifetime,1);
});

test('bounded active sessions prevent unbounded unauthenticated issuance',async()=>{
  const store=storage();
  for(let i=0;i<MAX_ACTIVE_SESSIONS;i++) {
    assert.equal(store.issue(await hashed(),1000).allowed,true);
  }
  assert.deepEqual(store.issue(await hashed(),1000),{
    allowed:false,reason:'too-many-outstanding-sessions'
  });
  assert.equal(store.state().active.length,MAX_ACTIVE_SESSIONS);
});

test('lifetime issuance limit persists even after earlier sessions expire',async()=>{
  const state=offlineSessionFixture();
  state.issuedLifetime=MAX_ISSUED_SESSIONS_LIFETIME;
  state.consumedLifetime=0;
  state.revision=MAX_ISSUED_SESSIONS_LIFETIME;
  const store=storage(state);
  assert.equal(store.issue(await hashed(),1_000_000).reason,'session-issuance-exhausted');
  assert.equal(store.state().issuedLifetime,MAX_ISSUED_SESSIONS_LIFETIME);
});

test('missing and corrupted storage fail closed; no implicit initialization',async()=>{
  const missing=storage(undefined);
  // Passing undefined triggers default fixture; explicitly clear via absent get.
  missing.kv.get=()=>undefined;
  assert.equal(missing.issue(await hashed(),1000).reason,'session-ledger-missing-or-invalid');
  assert.equal(missing.consume(await hashed(),1000).reason,'session-ledger-missing-or-invalid');
  for(const corrupt of [{},null,[],{...offlineSessionFixture(),active:'oops'},
      {...offlineSessionFixture(),revision:5},
      {...offlineSessionFixture(),consumedLifetime:1}]) {
    const store=storage(corrupt);
    assert.equal(store.issue(await hashed(),1000).allowed,false);
    assert.equal(store.consume(await hashed(),1000).allowed,false);
  }
});

test('failed storage write causes transaction rollback, and never returns success',async()=>{
  const store=storage(),a=await hashed();
  store.kv.put=()=>{throw Error('disk-write-failure')};
  assert.throws(()=>store.issue(a,1000),/session-storage-write-failed/);
  assert.equal(store.state().issuedLifetime,0);
  assert.equal(store.state().active.length,0);
});

test('malformed tokens, invalid clocks and absent storage are denied',async()=>{
  const a=await hashed(),store=storage();
  const badHashes=[
    {sessionHash:'abc',csrfHash:a.csrfHash},
    {sessionHash:a.sessionHash,csrfHash:a.sessionHash},
    {sessionHash:a.sessionHash,csrfHash:'invalid'}
  ];
  for(const hashes of badHashes)assert.equal(store.issue(hashes,1000).allowed,false);
  for(const nowMs of [NaN,0,-1,Infinity,2**53]) {
    assert.equal(store.issue(a,nowMs).allowed,false);
    assert.equal(store.consume(a,nowMs).allowed,false);
  }
  assert.equal(issueJudgeSessionInTransaction(null,{...a,nowMs:1000}).allowed,false);
  assert.equal(consumeJudgeSessionInTransaction(null,{...a,nowMs:1000}).allowed,false);
});

test('Secure HttpOnly SameSite Strict __Host- cookie must not expose CSRF secret',()=>{
  const secret=generateJudgeSessionSecrets();
  const cookie=formatSecureJudgeCookie(secret.cookieSecret);
  assert.match(cookie,new RegExp('^'+SESSION_COOKIE_NAME+'='));
  assert.match(cookie,/Path=\/; Max-Age=120; Secure; HttpOnly; SameSite=Strict/);
  assert.ok(!cookie.includes(secret.csrfSecret));
  assert.throws(()=>formatSecureJudgeCookie('bad'));
});

test('Cloudflare session coordinator remains UNBOUND and no provider calls exist',async()=>{
  const root=new URL('../',import.meta.url);
  const cfg=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const source=await readFile(new URL('cloudflare/judge-session-do.mjs',root),'utf8');
  assert.equal(JUDGE_SESSION_INSTANCE_NAME,'socialspark-judge-session-coordinator-v1');
  assert.equal(Object.hasOwn(cfg,'main'),false);
  assert.equal(Object.hasOwn(cfg,'durable_objects'),false);
  assert.match(source,/extends DurableObject/);
  assert.match(source,/transactionSync/);
  assert.match(source,/storage\.sync\(\)/);
  assert.doesNotMatch(source,/fetch\(|requestNebiusDrafts|api\.tokenfactory\.nebius\.com/);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});
