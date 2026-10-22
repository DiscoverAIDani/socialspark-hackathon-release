import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  JUDGE_PRICING_REFERENCE,
  estimateOfflineJudgeMaximum,
  assessOfflineReportedUsage
} from '../cloudflare/judge-model-pricing-offline.mjs';
import {
  JUDGE_DEMO_POLICY,judgeDemoLiveAccess
} from '../security/judge-demo-policy.mjs';

const valid=()=>({
  pricing:{...JUDGE_PRICING_REFERENCE},
  model:JUDGE_DEMO_POLICY.model,
  maxInputTokens:JUDGE_DEMO_POLICY.maximumInputTokensPerAttempt,
  maxOutputTokens:JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt
});

test('current public reference estimates $0.000420/request and $0.008400 for 20, NOT a cap',()=>{
  const result=estimateOfflineJudgeMaximum(valid());
  assert.deepEqual(result,{
    ok:true,mode:'offline-public-price-estimate-only',
    providerCallsAuthorized:false,
    perAttemptMicroUsd:420,
    lifetimeMicroUsdAtCurrentAttemptPolicy:8400,
    plannedAttempts:20,
    note:'No Nebius spend cap; provider/account billing can differ'
  });
  assert.equal(JUDGE_DEMO_POLICY.applicationBudgetCentsLifetime,100);
  assert.equal(JUDGE_DEMO_POLICY.liveAiEnabled,false);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('a smaller estimated envelope rounds UP to microdollars',()=>{
  const small=estimateOfflineJudgeMaximum({
    ...valid(),maxInputTokens:1,maxOutputTokens:1
  });
  assert.equal(small.perAttemptMicroUsd,1);
  assert.equal(small.providerCallsAuthorized,false);
});

test('untrusted model, retries, missing price and price drift all deny',()=>{
  const cases=[
    {...valid(),model:'nvidia/NVIDIA-Nemotron-3-Ultra-550B'},
    {...valid(),automaticRetries:1},
    {...valid(),automaticRetries:Infinity},
    {...valid(),pricing:undefined},
    {...valid(),pricing:{...JUDGE_PRICING_REFERENCE,
      outputMicroUsdPerMillion:240001}},
    {...valid(),pricing:{...JUDGE_PRICING_REFERENCE,
      inputMicroUsdPerMillion:59999}},
    {...valid(),pricing:{...JUDGE_PRICING_REFERENCE,
      source:'attacker-controlled'}},
    {...valid(),pricing:{...JUDGE_PRICING_REFERENCE,
      referenceCheckedOn:'tomorrow'}},
    {...valid(),pricing:{...JUDGE_PRICING_REFERENCE,
      suspiciousDiscount:true}},
    {...valid(),pricing:{...JUDGE_PRICING_REFERENCE,
      inputMicroUsdPerMillion:'60000'}}
  ];
  for(const value of cases){
    const result=estimateOfflineJudgeMaximum(value);
    assert.equal(result.ok,false,JSON.stringify(value));
    assert.equal(result.providerCallsAuthorized,false);
  }
});

test('token envelope denies oversize, zero, negative, fractions, NaN and huge integers',()=>{
  for(const n of [
    0,-1,2001,Number.MAX_SAFE_INTEGER,Infinity,-Infinity,
    Number.NaN,1.5,'2000',null
  ]){
    assert.equal(estimateOfflineJudgeMaximum({
      ...valid(),maxInputTokens:n
    }).ok,false,String(n));
  }
  for(const n of [
    0,-1,1251,Number.MAX_SAFE_INTEGER,Infinity,1.1,'1250'
  ]){
    assert.equal(estimateOfflineJudgeMaximum({
      ...valid(),maxOutputTokens:n
    }).ok,false,String(n));
  }
});

test('reported token accounting is an offline estimate and denies any cap violation',()=>{
  const params={
    model:JUDGE_DEMO_POLICY.model,
    pricing:{...JUDGE_PRICING_REFERENCE}
  };
  assert.deepEqual(assessOfflineReportedUsage({
    ...params,reportedInputTokens:2000,reportedOutputTokens:1250
  }),{
    ok:true,mode:'offline-reported-usage-estimate-only',
    estimatedMicroUsd:420,providerCallsAuthorized:false
  });
  assert.equal(assessOfflineReportedUsage({
    ...params,reportedInputTokens:1500,reportedOutputTokens:800
  }).estimatedMicroUsd,282);
  for(const [input,output] of [
    [2001,1250],[2000,1251],[-1,0],[1,-1],
    [undefined,100],[NaN,100],[0.7,8],['12',7]
  ]){
    const result=assessOfflineReportedUsage({
      ...params,reportedInputTokens:input,reportedOutputTokens:output
    });
    assert.equal(result.ok,false);
    assert.equal(result.providerCallsAuthorized,false);
  }
});

test('client-invented pricing or provider claims never turn reference into authorization',()=>{
  const estimate=estimateOfflineJudgeMaximum(valid());
  const pretend={
    ...estimate,providerCallsAuthorized:true,clientApproved:true
  };
  assert.equal(judgeDemoLiveAccess(pretend).allowed,false);
  assert.equal(assessOfflineReportedUsage({
    model:JUDGE_DEMO_POLICY.model,
    pricing:{...JUDGE_PRICING_REFERENCE,outputMicroUsdPerMillion:0},
    reportedInputTokens:2000,
    reportedOutputTokens:1250
  }).ok,false);
});

test('root production remains assets-only and model quote does not enter public assets',async()=>{
  const root=new URL('../',import.meta.url);
  const main=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(Object.hasOwn(main,'main'),false);
  assert.equal(Object.hasOwn(main,'durable_objects'),false);
  const current=await readFile(new URL(
    'cloudflare/judge-model-pricing-offline.mjs',root),'utf8');
  assert.doesNotMatch(current,/fetch\(/);
  assert.doesNotMatch(current,/NEBIUS_API_KEY/);
  assert.doesNotMatch(current,/api\.tokenfactory\.nebius\.com/);
});
