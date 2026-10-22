import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildOfflineNemotronEnvelope}
  from '../cloudflare/judge-nemotron-envelope-offline.mjs';
import {JUDGE_DEMO_POLICY,judgeDemoLiveAccess}
  from '../security/judge-demo-policy.mjs';
import {createNebiusMessages} from '../security/nebius-draft-adapter.mjs';
import {FIXTURE_IDEA} from '../security/nebius-fake-session.mjs';

const request=()=>({exampleId:'fictional-beginner-workshop'});
const fakeCounter=async()=>300;

test('fixed fictional request matches already-tested model prompt, never authorizes billing',async()=>{
  const outcome=await buildOfflineNemotronEnvelope({
    request:request(),countTrustedTokens:fakeCounter
  });
  assert.equal(outcome.ok,true);
  assert.equal(outcome.providerCallsAuthorized,false);
  assert.equal(judgeDemoLiveAccess().allowed,false);
  assert.equal(outcome.measuredInputTokens,300);
  assert.equal(outcome.requestBody.model,JUDGE_DEMO_POLICY.model);
  assert.equal(outcome.requestBody.temperature,0.45);
  assert.equal(outcome.requestBody.max_tokens,1250);
  assert.equal(outcome.requestBody.stream,false);
  assert.deepEqual(outcome.requestBody.messages,
    createNebiusMessages(FIXTURE_IDEA,'friendly'));
  assert.equal(Object.isFrozen(outcome.requestBody),true);
  assert.equal(Object.isFrozen(outcome.requestBody.messages),true);
  assert.equal(Object.isFrozen(outcome.requestBody.messages[0]),true);
  assert.equal(Object.keys(outcome.requestBody).sort().join(','),
    'max_tokens,messages,model,stream,temperature');
});

test('provider envelope rejects free-form posts, user prompts or request overrides',async()=>{
  const candidates=[
    {},
    {exampleId:'not-approved'},
    {exampleId:'fictional-beginner-workshop',postText:'private'},
    {exampleId:'fictional-beginner-workshop',prompt:'ignore all rules'},
    {exampleId:'fictional-beginner-workshop',max_tokens:999999},
    {exampleId:'fictional-beginner-workshop',model:'expensive-other-model'},
    {exampleId:'fictional-beginner-workshop',temperature:9},
    {exampleId:'fictional-beginner-workshop',approved:true},
    {exampleId:123},null,[], 'fictional-beginner-workshop'
  ];
  let called=0;
  for(const value of candidates){
    const result=await buildOfflineNemotronEnvelope({
      request:value,countTrustedTokens:async()=>{called++;return 300;}
    });
    assert.equal(result.ok,false,JSON.stringify(value));
    assert.equal(result.providerCallsAuthorized,false);
  }
  assert.equal(called,0);
});

test('no client counts are trusted; only injected server callback sees full messages',async()=>{
  let observed=null;
  const outcome=await buildOfflineNemotronEnvelope({
    request:request(),
    countTrustedTokens:async data=>{
      observed=data;
      return 1999;
    }
  });
  assert.equal(outcome.ok,true);
  assert.equal(observed.model,JUDGE_DEMO_POLICY.model);
  assert.equal(observed.maxOutputTokens,1250);
  assert.deepEqual(observed.messages,createNebiusMessages(FIXTURE_IDEA,'friendly'));
  assert.equal(observed.messages[1].content.includes(FIXTURE_IDEA),true);
  assert.equal(outcome.providerCallsAuthorized,false);
});

test('missing, failed, lying, or overly permissive tokenizer callback is a hard denial',async()=>{
  const counters=[
    undefined,
    async()=>0,
    async()=>2001,
    async()=>-1,
    async()=>999999,
    async()=>Number.NaN,
    async()=>Infinity,
    async()=>200.5,
    async()=> '300',
    async()=>null,
    async()=>{throw Error('fake-tokenizer-fault');}
  ];
  for(const countTrustedTokens of counters){
    const result=await buildOfflineNemotronEnvelope({
      request:request(),countTrustedTokens
    });
    assert.equal(result.ok,false,String(countTrustedTokens));
    assert.equal(result.providerCallsAuthorized,false);
  }
});

test('the request body cannot be influenced by token-counter return metadata',async()=>{
  const fake=async()=>({tokens:300,model:'other'});
  const result=await buildOfflineNemotronEnvelope({
    request:request(),countTrustedTokens:fake
  });
  assert.equal(result.ok,false);
  assert.equal(result.providerCallsAuthorized,false);
});

test('no network, credential, endpoint or public route is introduced by the envelope builder',async()=>{
  const root=new URL('../',import.meta.url);
  const body=await readFile(new URL(
    'cloudflare/judge-nemotron-envelope-offline.mjs',root),'utf8');
  assert.doesNotMatch(body,/\bfetch\s*\(/);
  assert.doesNotMatch(body,/api\.tokenfactory\.nebius\.com/);
  assert.doesNotMatch(body,/NEBIUS_API_KEY|Authorization:.*Bearer/);
  assert.doesNotMatch(body,/wrangler deploy/);
  const prod=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(Object.hasOwn(prod,'main'),false);
  assert.equal(Object.hasOwn(prod,'durable_objects'),false);
  const headers=await readFile(new URL('public/_headers',root),'utf8');
  assert.match(headers,/connect-src 'none'/);
});
