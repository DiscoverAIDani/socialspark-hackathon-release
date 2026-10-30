/**
 * Offline, synthetic judge email/AUD tests. Does not access Cloudflare
 * externally, invite real people, make provider requests, or use secrets.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {inspectOfflineExternalJudge as inspect}
  from '../cloudflare/judge-external-eligibility-offline.mjs';

const AUD='A'.repeat(32);
const BEGIN=Date.UTC(2026,11,9,8);
const END=Date.UTC(2026,11,24,8); // Dec 23 11:59:59 PST last allowed day
const NOW=Date.UTC(2026,11,11,12);
const config=(overrides={})=>({
  approvedJudgeEmails:['judge-one@fictional.invalid','judge.two+team@fictional.invalid'],
  expectedAudience:AUD,opensAtMs:BEGIN,closesAtMs:END,nowMs:NOW,
  ...overrides
});
const ctx=(email='judge-one@fictional.invalid',aud=AUD)=>({
  access:{aud,getIdentity:async()=>({email,sub:'fictional-user-id'})}
});
const expectDenied=(result)=>{
  assert.equal(result.eligible,false);
  assert.equal(result.providerCallsAuthorized,false);
  assert.equal(Object.hasOwn(result,'email'),false);
  assert.equal(Object.hasOwn(result,'sub'),false);
};

test('verified judge email plus exact audience is eligible but cannot activate provider',async()=>{
  const result=await inspect(ctx(),config());
  assert.deepEqual(result,{
    eligible:true,code:'offline-external-judge-eligible-only',
    providerCallsAuthorized:false
  });
  assert.deepEqual(await inspect(ctx('Judge.Two+Team@Fictional.Invalid'),config()),result);
});

test('different approved email, even on same organization/domain, is not eligible',async()=>{
  for(const email of [
    'other@fictional.invalid','admin@fictional.invalid','judge-one@another.invalid',
    'outsider@gmail.com','judge-one@fictional.invalid.attacker.invalid',
    'judge.one@fictional.invalid','judge-one+alias@fictional.invalid'
  ])expectDenied(await inspect(ctx(email),config()));
});

test('missing or wrong Access audience and missing Access never allow identity',async()=>{
  for(const context of [
    undefined,null,{}, {access:null},
    {access:{getIdentity:async()=>({email:'judge-one@fictional.invalid'})}},
    ctx('judge-one@fictional.invalid','B'.repeat(32)),
    {access:{aud:AUD,getIdentity:'not a function'}}
  ])expectDenied(await inspect(context,config()));
});

test('authorization cannot be forged with an email request header',async()=>{
  const request=new Request('https://example.invalid/',{
    headers:{'Cf-Access-Jwt-Assertion':'fake.jwt.fake',
      'X-Forwarded-Email':'judge-one@fictional.invalid'}
  });
  expectDenied(await inspect({request,headers:request.headers},config()));
});

test('a failed identity lookup or an invalid identity is always denied',async()=>{
  const values=[
    null,undefined,{}, {email:null}, {email:'x'}, {email:' not@fictional.invalid '},
    {email:'judge-one@@fictional.invalid'}, {email:'judge-one@fictional..invalid'}
  ];
  for(const identity of values){
    expectDenied(await inspect({
      access:{aud:AUD,getIdentity:async()=>identity}
    },config()));
  }
  expectDenied(await inspect({
    access:{aud:AUD,getIdentity:async()=>{throw Error('synthetic failure')}}
  },config()));
});

test('judge eligibility refuses empty, broad, duplicated, invalid and mixed-case policies',async()=>{
  for(const list of [
    undefined,[],['*'],['*@fictional.invalid'],['@fictional.invalid'],
    ['judge-one@fictional.invalid','judge-one@fictional.invalid'],
    ['Judge-One@fictional.invalid'],['judge-one@fictional.invalid '],
    Array(101).fill('judge-one@fictional.invalid'),
    ['judge-one@fictional..invalid'],['judge-one@fictional.invalid','everyone'],
    ['judge-one@fictional.invalid','admin@invalid']
  ])expectDenied(await inspect(ctx(),config({approvedJudgeEmails:list})));
});

test('missing/invalid audience and evaluation window configurations fail closed',async()=>{
  for(const options of [
    {expectedAudience:undefined},{expectedAudience:'*'},
    {expectedAudience:'A'.repeat(8)},
    {opensAtMs:undefined},{closesAtMs:undefined},
    {nowMs:undefined},{nowMs:NaN},
    {closesAtMs:BEGIN},{opensAtMs:END},
    {closesAtMs:BEGIN+40*24*60*60*1000}
  ])expectDenied(await inspect(ctx(),config(options)));
});

test('exact evaluation window closes at midnight after Dec 23 Pacific',async()=>{
  assert.equal((await inspect(ctx(),config({nowMs:BEGIN}))).eligible,true);
  assert.equal((await inspect(ctx(),config({nowMs:END-1}))).eligible,true);
  expectDenied(await inspect(ctx(),config({nowMs:BEGIN-1})));
  expectDenied(await inspect(ctx(),config({nowMs:END})));
  expectDenied(await inspect(ctx(),config({nowMs:END+1000})));
});

test('eligible decision never leaks identity or includes a model authorization',async()=>{
  const decision=await inspect(ctx(),config());
  const str=JSON.stringify(decision);
  assert.equal(str.includes('judge-one@fictional.invalid'),false);
  assert.equal(str.includes('fictional-user-id'),false);
  assert.equal(str.includes('token'),false);
  assert.equal(decision.providerCallsAuthorized,false);
});

test('module remains offline and is not referenced by public app or test Worker',async()=>{
  const root=new URL('../',import.meta.url);
  const read=p=>readFile(new URL(p,root),'utf8');
  const [code,wrangler,publicWorker,testWorker]=await Promise.all([
    read('cloudflare/judge-external-eligibility-offline.mjs'),
    read('wrangler.jsonc'),
    read('cloudflare/judge-gateway-disabled-worker.mjs'),
    read('cloudflare/judge-access-probe-only-worker.mjs')
  ]);
  assert.doesNotMatch(code,/fetch\s*\(/);
  assert.doesNotMatch(code,/NEBIUS_API_KEY|NVIDIA_API_KEY|api\.tokenfactory/);
  assert.doesNotMatch(publicWorker,/judge-external-eligibility-offline/);
  assert.doesNotMatch(testWorker,/judge-external-eligibility-offline/);
  assert.deepEqual(Object.keys(JSON.parse(wrangler)).sort(),
    ['assets','compatibility_date','name']);
});
