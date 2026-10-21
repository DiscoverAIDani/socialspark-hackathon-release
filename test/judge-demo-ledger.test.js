import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, open, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createLocalJudgeLedger,initializeLocalJudgeLedger} from '../security/judge-demo-ledger.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

async function fixture(t) {
  const dir=await mkdtemp(join(tmpdir(),'socialspark-quota-test-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  return join(dir,'judge-quota.json');
}

test('uninitialized ledger refuses all attempts; no implicit reset or initialization',async t=>{
  const path=await fixture(t);
  const gate=createLocalJudgeLedger(path);
  assert.deepEqual(await gate.reserveAttempt(1),{allowed:false,reason:'ledger-unavailable'});
  assert.equal(await gate.offlineSnapshot(),null);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('only explicit one-time initialization creates history; repeated initialization denied',async t=>{
  const path=await fixture(t);
  assert.equal((await initializeLocalJudgeLedger(path)).allowed,true);
  assert.equal((await initializeLocalJudgeLedger(path)).allowed,false);
  const gate=createLocalJudgeLedger(path);
  assert.equal((await gate.offlineSnapshot()).attempts,0);
});

test('20 lifetime attempts and reserved budget survive new instances/restarts',async t=>{
  const path=await fixture(t);
  assert.equal((await initializeLocalJudgeLedger(path)).allowed,true);
  for(let n=0;n<20;n++) {
    const gate=createLocalJudgeLedger(path);
    assert.deepEqual(await gate.reserveAttempt(1),{allowed:true,reason:'offline-attempt-reserved'});
  }
  const again=createLocalJudgeLedger(path);
  assert.deepEqual(await again.reserveAttempt(1),{allowed:false,reason:'lifetime-attempt-limit'});
  assert.deepEqual(await again.reserveAttempt(1),{allowed:false,reason:'lifetime-attempt-limit'});
  const state=await again.offlineSnapshot();
  assert.equal(state.attempts,20);
  assert.equal(state.reservedCents,20);
  assert.equal(state.revision,20);
});

test('reserves budget before every attempt and cannot exceed total 100 cents',async t=>{
  const path=await fixture(t);await initializeLocalJudgeLedger(path);
  const gate=createLocalJudgeLedger(path);
  assert.equal((await gate.reserveAttempt(75)).allowed,true);
  assert.deepEqual(await gate.reserveAttempt(26),{allowed:false,reason:'lifetime-application-budget'});
  assert.equal((await gate.reserveAttempt(25)).allowed,true);
  assert.deepEqual(await gate.reserveAttempt(1),{allowed:false,reason:'lifetime-application-budget'});
  assert.equal((await gate.offlineSnapshot()).reservedCents,100);
  assert.equal((await gate.offlineSnapshot()).attempts,2);
});

test('failed upstream attempts are never refunded by the counter',async t=>{
  const path=await fixture(t);await initializeLocalJudgeLedger(path);
  const gate=createLocalJudgeLedger(path);
  await gate.reserveAttempt(1);
  await gate.reserveAttempt(1);
  assert.equal((await gate.offlineSnapshot()).attempts,2);
});

test('simultaneous reservations never pass the 20-attempt cap',async t=>{
  const path=await fixture(t);await initializeLocalJudgeLedger(path);
  const gate=createLocalJudgeLedger(path);
  const requests=await Promise.all(Array.from({length:80},()=>gate.reserveAttempt(1)));
  const allowed=requests.filter(x=>x.allowed).length;
  const state=await gate.offlineSnapshot();
  assert.ok(allowed<=20);
  assert.equal(state.attempts,allowed);
  assert.ok(requests.every(x=>!x.allowed || x.reason==='offline-attempt-reserved'));
});

test('corrupt quota and stale crash lock deny requests without automatic repair',async t=>{
  const path=await fixture(t);await initializeLocalJudgeLedger(path);
  const gate=createLocalJudgeLedger(path);
  await writeFile(path,'{}');
  assert.deepEqual(await gate.reserveAttempt(1),{allowed:false,reason:'ledger-unavailable'});
  assert.deepEqual(await gate.reserveAttempt(1),{allowed:false,reason:'ledger-unavailable'});
  assert.equal(await gate.offlineSnapshot(),null);
});

test('active lock denies requests without breaking existing lock',async t=>{
  const path=await fixture(t);await initializeLocalJudgeLedger(path);
  const lock=await open(path+'.lock','wx');
  try {assert.deepEqual(await createLocalJudgeLedger(path).reserveAttempt(1),{allowed:false,reason:'ledger-unavailable'});}
  finally {await lock.close();}
});

test('refuses invalid reservations and never requires or contacts Nebius',async t=>{
  const path=await fixture(t);await initializeLocalJudgeLedger(path);
  const gate=createLocalJudgeLedger(path);
  for(const amount of [0,-1,1.4,101,NaN,Infinity,'1',null]) {
    assert.deepEqual(await gate.reserveAttempt(amount),{allowed:false,reason:'invalid-reservation'});
  }
  assert.equal((await gate.offlineSnapshot()).attempts,0);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});
