/**
 * Cloudflare workerd runtime verification (LOCAL ONLY, Vitest plugin).
 * This file is intentionally not named *.test.js so the existing Node
 * npm test suite never mistakenly interprets Vitest runtime tests.
 *
 * No outbound network, live credentials, Nebius inference, provisioning
 * route, or Cloudflare deployment is performed.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY} from '../cloudflare/judge-quota-core.mjs';
import {offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY} from '../cloudflare/judge-session-core.mjs';
import {offlineRateFixture,RATE_LIMIT_LEDGER_KEY} from '../cloudflare/judge-rate-core.mjs';

const quota=name=>env.TEST_QUOTA.get(env.TEST_QUOTA.idFromName(name));
const sessions=name=>env.TEST_SESSIONS.get(env.TEST_SESSIONS.idFromName(name));
const rate=name=>env.TEST_RATE.get(env.TEST_RATE.idFromName(name));

describe('local Cloudflare workerd: no AI and real SQLite Durable Objects',()=>{
  it('the actually running default Worker refuses AI and has no session route',async()=>{
    const ai=await exports.default.fetch('https://fixture.invalid/api/judge-demo/generate',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({exampleId:'fictional-beginner-workshop'})
    });
    expect(ai.status).toBe(503);
    expect(await ai.json()).toStrictEqual({ok:false,code:'judge-live-ai-disabled'});
    expect(ai.headers.get('access-control-allow-origin')).toBeNull();
    const session=await exports.default.fetch('https://fixture.invalid/api/judge-demo/session');
    expect(session.status).toBe(404);
    const activate=await exports.default.fetch('https://fixture.invalid/api/activate');
    expect(activate.status).toBe(404);
  });

  it('new SQLite quota object fails closed if the ledger was never provisioned',async()=>{
    const stub=quota('missing-unprovisioned');
    const decision=await stub.reserveAttemptForFutureGateway();
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe('quota-missing-or-invalid');
  });

  it('real SQLite quota transaction admits 20 simultaneous attempts, no more',async()=>{
    const stub=quota('concurrency-20-only');
    await runInDurableObject(stub,(_instance,state)=>{
      state.storage.kv.put(JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState());
    });
    const outcome=await Promise.all(Array.from({length:32},()=>stub.reserveAttemptForFutureGateway()));
    expect(outcome.filter(x=>x.allowed).length).toBe(20);
    const state=await stub.readLifetimeStatusForOwner();
    expect(state.attempts).toBe(20);
    expect(state.reservedCents).toBe(100);
    expect((await stub.reserveAttemptForFutureGateway()).allowed).toBe(false);
  });

  it('real SQLite quota survives Durable Object eviction without resetting',async()=>{
    const stub=quota('eviction-preserves-ledger');
    await runInDurableObject(stub,(_instance,state)=>{
      state.storage.kv.put(JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState());
    });
    expect((await stub.reserveAttemptForFutureGateway()).allowed).toBe(true);
    expect((await stub.readLifetimeStatusForOwner()).attempts).toBe(1);
    await evictDurableObject(stub);
    const recovered=await stub.readLifetimeStatusForOwner();
    expect(recovered.attempts).toBe(1);
    expect(recovered.reservedCents).toBe(5);
    expect((await stub.reserveAttemptForFutureGateway()).allowed).toBe(true);
    expect((await stub.readLifetimeStatusForOwner()).attempts).toBe(2);
  });

  it('real SQLite session tokens can be redeemed once, never replayed',async()=>{
    const stub=sessions('one-time-csrf-pair');
    // Explicit test-only seeding, with no HTTP seeding route in deployed code.
    await runInDurableObject(stub,(_instance,state)=>{
      state.storage.kv.put(JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture());
    });
    const issued=await stub.issueForFutureGateway();
    expect(issued.allowed).toBe(true);
    expect(issued.cookieSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.csrfSecret).toMatch(/^[a-f0-9]{64}$/);
    expect(issued.cookieSecret).not.toBe(issued.csrfSecret);
    const bad=await stub.consumeForFutureGateway(issued.cookieSecret,'a'.repeat(64));
    expect(bad.allowed).toBe(false);
    const valid=await stub.consumeForFutureGateway(issued.cookieSecret,issued.csrfSecret);
    expect(valid.allowed).toBe(true);
    const replay=await stub.consumeForFutureGateway(issued.cookieSecret,issued.csrfSecret);
    expect(replay.allowed).toBe(false);
    await evictDurableObject(stub);
    expect((await stub.consumeForFutureGateway(issued.cookieSecret,issued.csrfSecret)).allowed).toBe(false);
  });

  it('real SQLite global rate slot is shared and capped at three per minute',async()=>{
    const stub=rate('global-minute');
    expect((await stub.reserveForFutureSessionIssuer()).allowed).toBe(false);
    await runInDurableObject(stub,(_instance,state)=>{
      state.storage.kv.put(RATE_LIMIT_LEDGER_KEY,offlineRateFixture());
    });
    const outcomes=await Promise.all(Array.from({length:10},()=>stub.reserveForFutureSessionIssuer()));
    expect(outcomes.filter(x=>x.allowed).length).toBe(3);
    const status=await stub.inspectForOwner();
    expect(status.minuteCount).toBe(3);
    expect(status.lifetimeCount).toBe(3);
    await evictDurableObject(stub);
    expect((await stub.inspectForOwner()).lifetimeCount).toBe(3);
  });

  it('missing session and rate ledgers deny even with real storage bindings',async()=>{
    expect((await sessions('uninitialized').issueForFutureGateway()).allowed).toBe(false);
    expect((await rate('uninitialized').reserveForFutureSessionIssuer()).allowed).toBe(false);
  });
});
