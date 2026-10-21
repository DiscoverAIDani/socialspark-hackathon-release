import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {performFictionalLiveTest,inspectOperatorKey,NANO_MODEL,LIVE_UNLOCK,LIVE_CONFIRMATION} from '../security/fictional-live-test.mjs';
import {FIXTURE_DRAFTS,FIXTURE_IDEA} from '../security/nebius-fake-session.mjs';
import {createUsageGuard} from '../security/usage-guard.mjs';

const TEST_KEY='TEST_FICTIONAL_ONLY_NEVER_VALID_123456';
const makeFake=({onCall=()=>{},body=FIXTURE_DRAFTS}={})=>async (url,req)=>{
  onCall(url,req);
  return {ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({choices:[{message:{content:JSON.stringify(body)}}]})));c.close();}})};
};
const confirmed={unlock:LIVE_UNLOCK,confirmation:LIVE_CONFIRMATION,key:TEST_KEY};

test('one-shot test fixture is fixed and contains no real data',()=>{
  assert.equal(FIXTURE_IDEA,'Invite people to a fictional beginner workshop.');
  assert.equal(NANO_MODEL,'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B');
});
test('no operator unlock: zero network calls',async()=>{
  let calls=0;
  const result=await performFictionalLiveTest({...confirmed,unlock:undefined,transport:makeFake({onCall(){calls++;}})});
  assert.equal(result.code,'operator-authorization-required');assert.equal(calls,0);
});
test('missing separate typed confirmation: zero network calls',async()=>{
  let calls=0;
  const result=await performFictionalLiveTest({...confirmed,confirmation:'yes',transport:makeFake({onCall(){calls++;}})});
  assert.equal(result.code,'operator-authorization-required');assert.equal(calls,0);
});
test('invalid credential: zero calls, no credential echoed',async()=>{
  let calls=0;const result=await performFictionalLiveTest({...confirmed,key:'abc',transport:makeFake({onCall(){calls++;}})});
  assert.equal(result.code,'credential-not-configured');assert.equal(calls,0);
  assert.doesNotMatch(JSON.stringify(result),/abc/);
});
test('valid operator confirmation produces one pinned-model request to known Nebius endpoint',async()=>{
  let count=0;
  const result=await performFictionalLiveTest({...confirmed,transport:makeFake({onCall(url,req){
    count++;
    assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
    assert.equal(JSON.parse(req.body).model,NANO_MODEL);
    assert.equal(JSON.parse(req.body).messages[1].content.includes(FIXTURE_IDEA),true);
    assert.equal(req.redirect,'error');
    assert.equal(req.headers.Authorization,`Bearer ${TEST_KEY}`);
  }})});
  assert.equal(result.ok,true);assert.equal(count,1);assert.equal(result.providerAttempts,1);
  assert.deepEqual(Object.keys(result.drafts),['facebook','instagram','linkedin','tiktok']);
  assert.doesNotMatch(JSON.stringify(result),/TEST_KEY|123456/);
});
test('second local attempt on same process guard is refused without a second call',async()=>{
  let calls=0;const usage=createUsageGuard({hourlyRequestCap:1,dailyBudgetCents:1});
  const request={...confirmed,usage,transport:makeFake({onCall(){calls++;}})};
  assert.equal((await performFictionalLiveTest(request)).ok,true);
  const second=await performFictionalLiveTest(request);
  assert.equal(second.code,'local-one-cent-reservation-refused');assert.equal(calls,1);
});
test('provider failure does not retry or leak private error details',async()=>{
  let calls=0;const result=await performFictionalLiveTest({...confirmed,transport:async()=>{calls++;throw Error('SECRET_FROM_PROVIDER');}});
  assert.equal(result.ok,false);assert.equal(calls,1);assert.equal(result.providerAttempts,1);
  assert.doesNotMatch(JSON.stringify(result),/SECRET_FROM_PROVIDER/);
});
test('malformed response rejected and never automatically applied/published',async()=>{
  const result=await performFictionalLiveTest({...confirmed,transport:makeFake({body:{...FIXTURE_DRAFTS,facebook:'Call [PHONE_1]'}})});
  assert.equal(result.ok,false);assert.equal(result.code,'unresolved-placeholder');
});
test('noninteractive CLI refuses live execution regardless of supplied env unlock',()=>{
  const r=spawnSync(process.execPath,['scripts/live-nebius-once.mjs'],{
    env:{...process.env,SOCIALSPARK_ENABLE_LIVE_TEST:LIVE_UNLOCK},input:'',encoding:'utf8'
  });
  assert.equal(r.status,1);assert.match(r.stderr,/Interactive terminal required/);
});

test('second authorization uses distinct confirmation phrases',()=>{
  assert.equal(LIVE_UNLOCK,'SECOND_FICTIONAL_REQUEST');
  assert.equal(LIVE_CONFIRMATION,'SEND SECOND FICTIONAL REQUEST');
});
test('correct key shape passes local checks without contacting provider',()=>{
  assert.deepEqual(inspectOperatorKey(TEST_KEY),{ok:true,code:'key-format-plausible'});
});
test('double-pasted key is rejected before any provider call',async()=>{
  let calls=0;
  const double=TEST_KEY+TEST_KEY;
  assert.equal(inspectOperatorKey(double).code,'key-appears-pasted-twice');
  const result=await performFictionalLiveTest({...confirmed,key:double,transport:makeFake({onCall(){calls++;}})});
  assert.equal(result.code,'credential-not-configured');assert.equal(calls,0);
  assert.doesNotMatch(JSON.stringify(result),/TEST_KEY/);
});
test('whitespace-containing and malformed keys are rejected before provider call',async()=>{
  let calls=0;
  for (const key of [TEST_KEY+' ',TEST_KEY+'\n','\t'+TEST_KEY,'bad key invalid----']) {
    assert.equal(inspectOperatorKey(key).ok,false);
    const result=await performFictionalLiveTest({...confirmed,key,transport:makeFake({onCall(){calls++;}})});
    assert.equal(result.code,'credential-not-configured');
  }
  assert.equal(calls,0);
});
test('v0.20 retires second-attempt CLI rather than giving a third authorization',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('../scripts/live-nebius-once.mjs',import.meta.url),'utf8');
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.doesNotMatch(source,/performFictionalLiveTest|https:\/\/|hiddenInput/);
  assert.equal(pkg.scripts['live:fictional'],undefined);
  assert.match(source,/No provider request made/);
});
test('second attempt still blocks wrong confirmation before any network call',async()=>{
  let calls=0;
  const result=await performFictionalLiveTest({...confirmed,confirmation:'SEND ONE FICTIONAL REQUEST',transport:makeFake({onCall(){calls++;}})});
  assert.equal(result.code,'operator-authorization-required');assert.equal(calls,0);
});
