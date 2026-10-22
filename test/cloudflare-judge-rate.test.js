import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  RATE_LIMIT_INSTANCE_NAME,RATE_LIMIT_LEDGER_KEY,RATE_LIMIT_POLICY,
  offlineRateFixture,reserveSessionIssueRateInTransaction,
  inspectSessionIssueRate
} from '../cloudflare/judge-rate-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

const START=Date.UTC(2026,9,21,12,34,0);
function store(seed=offlineRateFixture()){
  const entries=new Map();
  if(seed!==undefined)entries.set(RATE_LIMIT_LEDGER_KEY,structuredClone(seed));
  const kv={
    get:key=>entries.has(key)?structuredClone(entries.get(key)):undefined,
    put:(key,val)=>entries.set(key,structuredClone(val))
  };
  function transactionSync(fn) {
    const old=new Map([...entries].map(([k,v])=>[k,structuredClone(v)]));
    try{return fn();}catch(error){entries.clear();for(const [k,v] of old)entries.set(k,v);throw error;}
  }
  return {
    kv,transactionSync,
    reserve:nowMs=>transactionSync(()=>reserveSessionIssueRateInTransaction(kv,{nowMs})),
    snapshot:()=>inspectSessionIssueRate(kv)
  };
}

test('approved design has global session rate caps, no user identifiers, and NO live AI',()=>{
  assert.deepEqual(RATE_LIMIT_POLICY,{
    perMinute:3,perHour:20,perDay:60,lifetime:1000,
    windowType:'fixed-utc',liveEnabled:false
  });
  assert.equal(judgeDemoLiveAccess().allowed,false);
  assert.equal(Object.isFrozen(RATE_LIMIT_POLICY),true);
});

test('missing or corrupt ledger fails closed, without automatic initialization',()=>{
  const missing=store();
  missing.kv.get=()=>undefined;
  assert.deepEqual(missing.reserve(START),{allowed:false,reason:'rate-ledger-missing-or-invalid'});
  assert.equal(missing.snapshot(),null);
  const invalid=[
    {},null,[],{...offlineRateFixture(),revision:2},
    {...offlineRateFixture(),minuteCount:1},
    {...offlineRateFixture(),maxAttempts:20},
    {...offlineRateFixture(),lifetimeCount:1001,revision:1001},
    {...offlineRateFixture(),minuteCount:4},
    {...offlineRateFixture(),dayCount:70},
    {...offlineRateFixture(),minuteBucket:123,hourBucket:2,dayBucket:0},
  ];
  for(const sample of invalid)assert.equal(store(sample).reserve(START).allowed,false);
});

test('at most 3 session-issuance attempts per fixed UTC minute',()=>{
  const gate=store();
  for(let i=0;i<3;i++)assert.equal(gate.reserve(START+i*1000).allowed,true);
  assert.deepEqual(gate.reserve(START+3000),{allowed:false,reason:'global-minute-limit'});
  assert.equal(gate.reserve(START+60_000).allowed,true);
  assert.equal(gate.snapshot().minuteCount,1);
  assert.equal(gate.snapshot().hourCount,4);
  assert.equal(gate.snapshot().lifetimeCount,4);
});

test('at most 20 session-issuance attempts across one UTC hour',()=>{
  const gate=store();
  for(let i=0;i<20;i++){
    assert.equal(gate.reserve(START+Math.floor(i/3)*60_000).allowed,true);
  }
  assert.equal(gate.reserve(START+7*60_000).reason,'global-hour-limit');
  assert.equal(gate.snapshot().hourCount,20);
  // Following hour is allowed; the lifetime total does not reset.
  assert.equal(gate.reserve(START+60*60_000).allowed,true);
  assert.equal(gate.snapshot().lifetimeCount,21);
});

test('at most 60 attempts per UTC day, across multiple hours',()=>{
  const gate=store();
  for(let i=0;i<60;i++) {
    const elapsedHours=Math.floor(i/15);
    const minuteWithinHour=Math.floor((i%15)/3);
    assert.equal(gate.reserve(START+elapsedHours*3_600_000+minuteWithinHour*60_000).allowed,true);
  }
  assert.equal(gate.reserve(START+5*3_600_000).reason,'global-day-limit');
  assert.equal(gate.snapshot().dayCount,60);
  const nextDay=START+24*3_600_000;
  assert.equal(gate.reserve(nextDay).allowed,true);
  assert.equal(gate.snapshot().lifetimeCount,61);
});

test('simulated restarts share the ledger and never reset lifetime usage',()=>{
  const old=store();
  for(let i=0;i<3;i++)old.reserve(START);
  const restarted=store(old.snapshot());
  assert.equal(restarted.reserve(START).allowed,false);
  assert.equal(restarted.reserve(START+60_000).allowed,true);
  assert.equal(restarted.snapshot().lifetimeCount,4);
});

test('clock rollback is rejected rather than resetting a quota',()=>{
  const gate=store();
  gate.reserve(START);
  assert.equal(gate.reserve(START-60_000).reason,'clock-moved-backward');
  assert.equal(gate.snapshot().lifetimeCount,1);
});

test('lifetime 1000 issuance ceiling remains enforced across any later date',()=>{
  const prior={
    version:1,
    minuteBucket:Math.floor(START/60000),
    hourBucket:Math.floor(START/3600000),
    dayBucket:Math.floor(START/86400000),
    minuteCount:1,hourCount:1,dayCount:1,
    lifetimeCount:1000,revision:1000
  };
  const gate=store(prior);
  assert.equal(gate.reserve(START+90*86400000).reason,'session-issuance-lifetime-exhausted');
  assert.equal(gate.snapshot().lifetimeCount,1000);
});

test('bursty concurrent offline reservations are serialized by transaction simulation',async()=>{
  const gate=store();
  const results=await Promise.all(Array.from({length:120},async()=>gate.reserve(START)));
  assert.equal(results.filter(x=>x.allowed).length,3);
  assert.equal(gate.snapshot().minuteCount,3);
  assert.equal(gate.snapshot().lifetimeCount,3);
});

test('failed storage write rolls back and does not report a successful allowance',()=>{
  const gate=store();
  gate.kv.put=()=>{throw Error('test disk failure')};
  assert.throws(()=>gate.reserve(START),/rate-storage-write-failed/);
  assert.equal(gate.snapshot().lifetimeCount,0);
});

test('invalid clock or missing storage fails closed',()=>{
  const gate=store();
  for(const time of [0,-1,null,NaN,Infinity,'2026-10-21',1.5]) {
    assert.equal(gate.reserve(time).allowed,false);
  }
  assert.deepEqual(reserveSessionIssueRateInTransaction(null,{nowMs:START}),{
    allowed:false,reason:'rate-storage-unavailable'
  });
  assert.equal(gate.snapshot().lifetimeCount,0);
});

test('rate limiter is unbound and no provider route or token secret is introduced',async()=>{
  const root=new URL('../',import.meta.url);
  const cfg=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const core=await readFile(new URL('cloudflare/judge-rate-core.mjs',root),'utf8');
  const wrapper=await readFile(new URL('cloudflare/judge-rate-do.mjs',root),'utf8');
  assert.equal(RATE_LIMIT_INSTANCE_NAME,'socialspark-global-session-rate-v1');
  assert.equal(Object.hasOwn(cfg,'main'),false);
  assert.equal(Object.hasOwn(cfg,'durable_objects'),false);
  assert.match(wrapper,/transactionSync/);
  assert.match(wrapper,/storage\.sync\(\)/);
  assert.doesNotMatch(core+wrapper,/requestNebiusDrafts|api\.tokenfactory\.nebius\.com|Authorization:\s*Bearer|fetch\(/);
});
