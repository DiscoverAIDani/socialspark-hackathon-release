import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createFutureSiteverifyTransport}
  from '../cloudflare/judge-siteverify-outbound-contract.mjs';
import {
  TURNSTILE_VERIFY_ENDPOINT,verifyJudgeTurnstileOffline,
  TURNSTILE_JUDGE_ACTION
} from '../cloudflare/judge-turnstile-core.mjs';

const origin='socialspark-hackathon-release.daniellewilcott.workers.dev';
const secret='FAKE_CLOUDFLARE_SERVER_SECRET_FOR_TEST_ONLY';
const token='FAKE_CLOUDFLARE_TURNSTILE_RESPONSE_TEST_ONLY';
const NOW=Date.UTC(2026,9,22,18,0,0);
const payload=(override={})=>({
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({secret,response:token}),
  redirect:'error',
  cache:'no-store',
  signal:AbortSignal.timeout(2000),
  ...override
});
const siteverifyResponse=(data={},init={})=>Response.json({
  success:true,
  hostname:origin,
  action:TURNSTILE_JUDGE_ACTION,
  challenge_ts:new Date(NOW-1000).toISOString(),
  ...data
},init);

test('fail-closed contract refuses missing network sender',()=>{
  assert.equal(createFutureSiteverifyTransport(),null);
  assert.equal(createFutureSiteverifyTransport({send:'fetch'}),null);
  assert.equal(createFutureSiteverifyTransport({send:42}),null);
});

test('exact Siteverify POST is forwarded once, with no logging or arbitrary headers',async()=>{
  const sent=[];
  const transport=createFutureSiteverifyTransport({
    send:async(url,options)=>{
      sent.push({url,options});
      return siteverifyResponse();
    }
  });
  const response=await transport(TURNSTILE_VERIFY_ENDPOINT,payload());
  assert.equal(response.status,200);
  assert.equal(sent.length,1);
  assert.equal(sent[0].url,TURNSTILE_VERIFY_ENDPOINT);
  assert.deepEqual(JSON.parse(sent[0].options.body),{
    secret,response:token
  });
  assert.deepEqual(sent[0].options.headers,{'Content-Type':'application/json'});
  assert.equal(sent[0].options.redirect,'error');
  assert.equal(sent[0].options.cache,'no-store');
  assert.equal(sent[0].options.method,'POST');
  assert.equal(sent[0].options.signal.aborted,false);
});

test('no malicious endpoint, altered request, user metadata, or extra fields are sent',async()=>{
  let count=0;
  const transport=createFutureSiteverifyTransport({
    send:async()=>{count++;return siteverifyResponse();}
  });
  const cases=[
    ['https://evil.invalid/turnstile',payload()],
    [TURNSTILE_VERIFY_ENDPOINT,payload({method:'GET'})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({redirect:'follow'})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({cache:'default'})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({signal:null})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:'not-json'})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({secret,response:token,remoteip:'1.1.1.1'})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({secret,response:token,model:'paid-model'})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({secret,response:token,idempotency_key:'retry'})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({response:token})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({secret,response:token.repeat(100)})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({secret:'too-short',response:token})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({body:JSON.stringify({secret,response:secret})})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({headers:{'Content-Type':'text/plain'}})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({headers:{'Content-Type':'application/json',Authorization:'Bearer test'}})],
    [TURNSTILE_VERIFY_ENDPOINT,payload({signal:{aborted:true}})],
    [TURNSTILE_VERIFY_ENDPOINT,{...payload(),headers:new Headers({'Content-Type':'application/json'})}]
  ];
  for(const [url,options] of cases){
    await assert.rejects(()=>transport(url,options),/siteverify-request-rejected/);
  }
  assert.equal(count,0);
});

test('network failure becomes generic, no retries and no secrets in errors',async()=>{
  let count=0;
  const transport=createFutureSiteverifyTransport({
    send:async()=>{
      count++;
      throw Error('SECRET DEBUG '+secret+' '+token);
    }
  });
  await assert.rejects(()=>transport(TURNSTILE_VERIFY_ENDPOINT,payload()),error=>{
    assert.equal(error.message,'siteverify-transport-unavailable');
    assert.equal(error.message.includes(secret),false);
    assert.equal(error.message.includes(token),false);
    return true;
  });
  assert.equal(count,1);
});

test('real verifyJudgeTurnstileOffline validator accepts only matching mock Siteverify response',async()=>{
  let calls=0;
  const transport=createFutureSiteverifyTransport({
    send:async()=>{
      calls++;
      return siteverifyResponse();
    }
  });
  const result=await verifyJudgeTurnstileOffline({
    token,secret,expectedHostname:origin,expectedAction:TURNSTILE_JUDGE_ACTION,
    nowMs:NOW,fetchImpl:transport
  });
  assert.equal(result.valid,true);
  assert.equal(calls,1);
});

test('validator denies false, replay-shaped, wrong domain and stale responses',async()=>{
  let calls=0;
  for(const body of [
    {success:false,'error-codes':['timeout-or-duplicate']},
    {hostname:'attacker.invalid'},
    {action:'attacker_action'},
    {challenge_ts:new Date(NOW-301000).toISOString()}
  ]){
    const transport=createFutureSiteverifyTransport({
      send:async()=>{
        calls++;
        return siteverifyResponse(body);
      }
    });
    const result=await verifyJudgeTurnstileOffline({
      token,secret,expectedHostname:origin,
      expectedAction:TURNSTILE_JUDGE_ACTION,nowMs:NOW,fetchImpl:transport
    });
    assert.equal(result.valid,false,JSON.stringify(body));
  }
  assert.equal(calls,4);
});

test('production configuration remains assets-only; no secret or send function stored',async()=>{
  const root=new URL('../',import.meta.url);
  const prod=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(Object.hasOwn(prod,'main'),false);
  assert.equal(Object.hasOwn(prod,'durable_objects'),false);
  const code=await readFile(new URL(
    'cloudflare/judge-siteverify-outbound-contract.mjs',root),'utf8');
  assert.doesNotMatch(code,/\bglobalThis\.fetch\b|\bfetch\s*\(/);
  assert.doesNotMatch(code,/NEBIUS_API_KEY|TURNSTILE_SECRET_KEY|wrangler deploy/);
});
