import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  JUDGE_QUOTA_STORAGE_KEY, JUDGE_QUOTA_INSTANCE_NAME,
  RESERVED_CENTS_PER_ATTEMPT,
  offlineFixtureState, reserveJudgeAttemptInTransaction, inspectJudgeQuotaState
} from '../cloudflare/judge-quota-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

function mockedTransactionalStorage(seed) {
  const state = new Map();
  if (seed !== undefined) state.set(JUDGE_QUOTA_STORAGE_KEY,structuredClone(seed));
  const kv = {
    get(key) {return state.has(key)?structuredClone(state.get(key)):undefined;},
    put(key,value) {state.set(key,structuredClone(value));}
  };
  const transactionSync = fn => {
    const snapshot=new Map([...state].map(([k,v])=>[k,structuredClone(v)]));
    try {return fn();}
    catch(error) {
      state.clear();
      for (const [k,v] of snapshot) state.set(k,v);
      throw error;
    }
  };
  const reserve=()=>transactionSync(()=>reserveJudgeAttemptInTransaction(kv));
  return {kv,transactionSync,reserve};
}

test('unprovisioned Durable Object quota storage fails closed',()=>{
  const store=mockedTransactionalStorage();
  assert.deepEqual(store.reserve(),{allowed:false,reason:'quota-missing-or-invalid'});
  assert.equal(inspectJudgeQuotaState(store.kv),null);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('lifetime cap is 20 attempts with 5 cents reserved per attempt, 100 cents total',()=>{
  const store=mockedTransactionalStorage(offlineFixtureState());
  assert.equal(RESERVED_CENTS_PER_ATTEMPT,5);
  for(let n=0;n<20;n++) {
    assert.deepEqual(store.reserve(),{allowed:true,reason:'quota-reserved-offline-prototype'});
  }
  assert.deepEqual(store.reserve(),{allowed:false,reason:'lifetime-attempt-limit'});
  const status=inspectJudgeQuotaState(store.kv);
  assert.equal(status.attempts,20);
  assert.equal(status.reservedCents,100);
  assert.equal(status.revision,20);
});

test('quota persists across simulated object restarts (shared durable storage)',()=>{
  const backing=mockedTransactionalStorage(offlineFixtureState());
  backing.reserve();
  const newInstance = ()=>({
    reserve:()=>backing.transactionSync(()=>reserveJudgeAttemptInTransaction(backing.kv))
  });
  for(let n=1;n<20;n++) assert.equal(newInstance().reserve().allowed,true);
  assert.equal(newInstance().reserve().allowed,false);
  assert.equal(inspectJudgeQuotaState(backing.kv).attempts,20);
});

test('concurrent attempts are serialized in the synchronous transactional simulation',async()=>{
  const store=mockedTransactionalStorage(offlineFixtureState());
  const responses=await Promise.all(Array.from({length:100},async()=>store.reserve()));
  assert.equal(responses.filter(x=>x.allowed).length,20);
  assert.equal(inspectJudgeQuotaState(store.kv).attempts,20);
  assert.equal(inspectJudgeQuotaState(store.kv).reservedCents,100);
});

test('invalid, corrupt and inconsistent ledger records deny without reset',()=>{
  for(const bad of [{},null,[],{...offlineFixtureState(),reservedCents:1},
    {...offlineFixtureState(),attempts:21},
    {...offlineFixtureState(),reservedCents:101},
    {...offlineFixtureState(),revision:1},
    {...offlineFixtureState(),maxBudgetCents:500}]) {
    const store=mockedTransactionalStorage(bad);
    assert.deepEqual(store.reserve(),{allowed:false,reason:'quota-missing-or-invalid'});
    assert.equal(inspectJudgeQuotaState(store.kv),null);
  }
});

test('storage failure throws so the enclosing transaction can roll back',()=>{
  const store=mockedTransactionalStorage(offlineFixtureState());
  store.kv.put=()=>{throw new Error('disk failure');};
  assert.throws(()=>store.reserve(),/quota-storage-failed/);
  assert.equal(inspectJudgeQuotaState(store.kv).attempts,0);
});

test('no automatic refund or retry after an attempted call fails elsewhere',()=>{
  const store=mockedTransactionalStorage(offlineFixtureState());
  assert.equal(store.reserve().allowed,true);
  // Caller failure does not decrement an already durably reserved attempt.
  assert.equal(inspectJudgeQuotaState(store.kv).attempts,1);
  assert.equal(inspectJudgeQuotaState(store.kv).reservedCents,5);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('quota prototype is unbound, disconnected and not a deployed Cloudflare gateway',async()=>{
  const root=new URL('../',import.meta.url);
  const cfg=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const code=await readFile(new URL('cloudflare/judge-quota-do.mjs',root),'utf8');
  assert.equal(cfg.assets.directory,'./public');
  assert.equal(Object.hasOwn(cfg,'main'),false);
  assert.equal(Object.hasOwn(cfg,'durable_objects'),false);
  assert.equal(JUDGE_QUOTA_INSTANCE_NAME,'socialspark-judge-lifetime-quota-v1');
  assert.match(code,/import \{DurableObject\} from 'cloudflare:workers'/);
  assert.match(code,/extends DurableObject/);
  assert.match(code,/transactionSync/);
  assert.match(code,/storage\.sync\(\)/);
  assert.doesNotMatch(code,/\bfetch\s*\(|requestNebiusDrafts|api\.tokenfactory\.nebius\.com/);
});
