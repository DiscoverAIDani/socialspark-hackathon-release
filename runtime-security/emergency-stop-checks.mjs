/**
 * Local workerd tests of a one-way persistent emergency stop.
 * REAL SQLite Durable Object, but NO public route, NO model call or costs.
 */
import {describe,it,expect} from 'vitest';
import {env,exports} from 'cloudflare:workers';
import {runInDurableObject,evictDurableObject} from 'cloudflare:test';
import {
  JUDGE_STOP_LEDGER_KEY,offlineEmergencyStopFixture
} from '../cloudflare/judge-emergency-stop-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

const make=name=>env.TEST_STOP.get(env.TEST_STOP.idFromName('judge-emergency-stop-'+name));
const seed=async(stub,state=offlineEmergencyStopFixture())=>
  runInDurableObject(stub,(_obj,ctx)=>ctx.storage.kv.put(JUDGE_STOP_LEDGER_KEY,state));

describe('one-way emergency stop — REAL local SQLite storage, OFFLINE ONLY',()=>{
  it('fails closed with missing storage and never initializes a record',async()=>{
    const stub=make('missing');
    expect(await stub.inspectForFutureGateway()).toStrictEqual({
      valid:false,stopped:true,reason:'shutdown-ledger-missing-or-invalid',
      providerCallsAuthorized:false
    });
    expect((await stub.latchStopForFutureOwner()).valid).toBe(false);
    expect((await stub.inspectForFutureGateway()).stopped).toBe(true);
  });

  it('an initialized clear latch is not an authorization for AI generation',async()=>{
    const stub=make('clear-does-not-enable');
    await seed(stub);
    expect(await stub.inspectForFutureGateway()).toStrictEqual({
      valid:true,stopped:false,reason:'offline-latch-clear-only',
      providerCallsAuthorized:false
    });
    expect(judgeDemoLiveAccess().allowed).toBe(false);
    const worker=await exports.default.fetch(
      'https://fictional.example.org/api/judge-demo/generate',{method:'POST'});
    expect(worker.status).toBe(503);
    expect((await worker.json()).code).toBe('judge-live-ai-disabled');
  });

  it('one-way kill persists through object eviction and rejects any re-opening',async()=>{
    const stub=make('persisted-latch');
    await seed(stub);
    const stopped=await stub.latchStopForFutureOwner();
    expect(stopped).toStrictEqual({
      valid:true,stopped:true,reason:'emergency-stop-latched',
      providerCallsAuthorized:false
    });
    await evictDurableObject(stub);
    expect(await stub.inspectForFutureGateway()).toStrictEqual(stopped);
    expect(await stub.latchStopForFutureOwner()).toStrictEqual(stopped);
    const saved=await runInDurableObject(stub,(_obj,ctx)=>ctx.storage.kv.get(JUDGE_STOP_LEDGER_KEY));
    expect(saved).toStrictEqual({version:1,stopped:true,revision:1});
    const activation=await exports.default.fetch(
      'https://fictional.example.org/api/activate',{method:'POST'});
    expect(activation.status).toBe(404);
    const reset=await exports.default.fetch(
      'https://fictional.example.org/api/stop/reset',{method:'POST'});
    expect(reset.status).toBe(404);
  });

  it('concurrent emergency-stop requests remain latched with revision exactly one',async()=>{
    const stub=make('concurrent-stop');
    await seed(stub);
    const results=await Promise.all(Array.from({length:20},()=>stub.latchStopForFutureOwner()));
    expect(results.every(r=>r.valid&&r.stopped&&!r.providerCallsAuthorized)).toBe(true);
    const saved=await runInDurableObject(stub,(_obj,ctx)=>ctx.storage.kv.get(JUDGE_STOP_LEDGER_KEY));
    expect(saved).toStrictEqual({version:1,stopped:true,revision:1});
  });

  it('rejects malformed and reset-looking ledger states without automatic repair',async()=>{
    const candidates=[
      {version:1,stopped:false,revision:1},
      {version:1,stopped:true,revision:0},
      {version:2,stopped:false,revision:0},
      {version:1,stopped:'false',revision:0},
      {version:1,stopped:false,revision:0,allowLive:true},
      []
    ];
    for(let index=0;index<candidates.length;index++){
      const stub=make('corrupt-'+index);
      await seed(stub,candidates[index]);
      expect(await stub.inspectForFutureGateway()).toStrictEqual({
        valid:false,stopped:true,reason:'shutdown-ledger-missing-or-invalid',
        providerCallsAuthorized:false
      });
      expect((await stub.latchStopForFutureOwner()).valid).toBe(false);
    }
  });
});
