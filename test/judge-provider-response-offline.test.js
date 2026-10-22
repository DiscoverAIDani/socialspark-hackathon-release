import test from 'node:test';
import assert from 'node:assert/strict';
import {
  inspectOfflineProviderCompletion
} from '../cloudflare/judge-provider-response-offline.mjs';
import {JUDGE_DEMO_POLICY,judgeDemoLiveAccess}
  from '../security/judge-demo-policy.mjs';
import {JUDGE_PRICING_REFERENCE}
  from '../cloudflare/judge-model-pricing-offline.mjs';
import {FIXTURE_DRAFTS}
  from '../security/nebius-fake-session.mjs';

const exampleId='fictional-beginner-workshop';
const completion=()=>({
  model:JUDGE_DEMO_POLICY.model,
  choices:[{
    index:0,finish_reason:'stop',
    message:{role:'assistant',content:JSON.stringify(FIXTURE_DRAFTS)}
  }],
  usage:{prompt_tokens:500,completion_tokens:500,total_tokens:1000}
});
const check=envelope=>inspectOfflineProviderCompletion({envelope,exampleId});

test('fictional response validates real four-platform draft safety with fake usage only',()=>{
  const result=check(completion());
  assert.equal(result.ok,true);
  assert.equal(result.providerCallsAuthorized,false);
  assert.equal(result.estimatedMicroUsd,150);
  assert.deepEqual(result.drafts,FIXTURE_DRAFTS);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('reasoning usage, if included, is a subset of reported completion tokens',()=>{
  const v=completion();
  v.usage.completion_tokens_details={reasoning_tokens:300};
  assert.equal(check(v).ok,true);
  v.usage.completion_tokens_details={reasoning_tokens:501};
  assert.equal(check(v).reason,'untrusted-reasoning-usage');
  v.usage.completion_tokens_details={reasoning_tokens:-1};
  assert.equal(check(v).reason,'untrusted-reasoning-usage');
});

test('refuse missing billing usage, incorrect totals and excess tokens',()=>{
  for(const v of [
    {},
    {prompt_tokens:500,completion_tokens:500},
    {prompt_tokens:500,completion_tokens:500,total_tokens:999},
    {prompt_tokens:2001,completion_tokens:500,total_tokens:2501},
    {prompt_tokens:500,completion_tokens:1251,total_tokens:1751},
    {prompt_tokens:0,completion_tokens:500,total_tokens:500},
    {prompt_tokens:500,completion_tokens:0,total_tokens:500},
    {prompt_tokens:100.5,completion_tokens:500,total_tokens:600.5},
    {prompt_tokens:'500',completion_tokens:500,total_tokens:1000},
    {prompt_tokens:500,completion_tokens:500,total_tokens:Infinity}
  ]){
    const value=completion();value.usage=v;
    const result=check(value);
    assert.equal(result.ok,false,JSON.stringify(v));
    assert.equal(result.providerCallsAuthorized,false);
  }
});

test('refuse changed model, response truncation, unknown role and multiple choices',()=>{
  const modified=[
    v=>v.model='other/provider',
    v=>v.choices[0].finish_reason='length',
    v=>v.choices[0].finish_reason=null,
    v=>v.choices[0].index=1,
    v=>v.choices[0].message.role='tool',
    v=>v.choices[0].message.content=undefined,
    v=>v.choices.push(v.choices[0]),
    v=>v.choices=[]
  ];
  for(const change of modified){
    const value=completion();change(value);
    assert.equal(check(value).ok,false);
  }
});

test('refuse changed price snapshot without permitting model access',()=>{
  const v=completion();
  const changed={
    ...JUDGE_PRICING_REFERENCE,outputMicroUsdPerMillion:240001
  };
  const result=inspectOfflineProviderCompletion({
    envelope:v,exampleId,verifiedReference:changed
  });
  assert.equal(result.ok,false);
  assert.equal(result.reason,'pricing-or-usage-requires-review');
  assert.equal(result.providerCallsAuthorized,false);
});

test('refuse unsafe or nonconforming outputs even with apparently valid usage',()=>{
  for(const content of [
    'not json',
    JSON.stringify({facebook:'Only one platform'}),
    JSON.stringify({...FIXTURE_DRAFTS,
      facebook:'Email secret@example.com for details'}),
    JSON.stringify({...FIXTURE_DRAFTS,
      tiktok:'Check out https://example.com/latest'})
  ]){
    const value=completion();
    value.choices[0].message.content=content;
    assert.equal(check(value).reason,'output-failed-local-review');
  }
});

test('unknown example or unsafe input cannot be used to request live access',()=>{
  const result=inspectOfflineProviderCompletion({
    envelope:completion(),exampleId:'user-supplied-post'
  });
  assert.equal(result.reason,'unapproved-fixture');
  assert.equal(result.providerCallsAuthorized,false);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});
