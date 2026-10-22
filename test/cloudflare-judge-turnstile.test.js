import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  TURNSTILE_VERIFY_ENDPOINT,TURNSTILE_JUDGE_ACTION,
  TURNSTILE_TOKEN_MAX_CHARS,TURNSTILE_MAX_RESPONSE_BYTES,
  TURNSTILE_TIMEOUT_MS,TURNSTILE_TOKEN_TTL_MS,
  verifyJudgeTurnstileOffline
} from '../cloudflare/judge-turnstile-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

const nowMs=Date.UTC(2026,9,21,20,0,0);
const secret='TEST_ONLY_SECRET_NOT_LIVE_000000000';
const token='TURNSTILE_TEST_TOKEN_NOT_REAL';
const expectedHostname='socialspark.example.workers.dev';
const success={
  success:true,
  challenge_ts:new Date(nowMs-30_000).toISOString(),
  hostname:expectedHostname,
  action:TURNSTILE_JUDGE_ACTION,
  'error-codes':[]
};
function response(data=success,options={}){
  return new Response(options.raw??JSON.stringify(data),{
    status:options.status??200,
    headers:{'Content-Type':options.type??'application/json'}
  });
}
function options(extra={}){
  return {token,secret,expectedHostname,nowMs,...extra};
}

test('offline Siteverify uses one POST without IP, retries, or exposed credential',async()=>{
  const events=[];
  const result=await verifyJudgeTurnstileOffline(options({
    fetchImpl:async(url,init)=>{
      events.push({url,init});
      return response();
    }
  }));
  assert.deepEqual(result,{valid:true,code:'siteverify-verified-offline-integration-only'});
  assert.equal(events.length,1);
  assert.equal(events[0].url,TURNSTILE_VERIFY_ENDPOINT);
  assert.equal(events[0].init.method,'POST');
  assert.equal(events[0].init.redirect,'error');
  assert.equal(events[0].init.cache,'no-store');
  assert.equal(events[0].init.signal.aborted,false);
  assert.equal(JSON.parse(events[0].init.body).secret,secret);
  assert.equal(JSON.parse(events[0].init.body).response,token);
  assert.deepEqual(Object.keys(JSON.parse(events[0].init.body)).sort(),['response','secret']);
  assert.equal(TURNSTILE_TIMEOUT_MS,8000);
  assert.equal(judgeDemoLiveAccess().allowed,false);
  assert.doesNotMatch(JSON.stringify(result),/TOKEN_NOT_REAL|SECRET_NOT_LIVE|response|hostname/);
});

test('no implicit network when no transport is supplied',async()=>{
  assert.deepEqual(await verifyJudgeTurnstileOffline(options()),{
    valid:false,code:'turnstile-transport-unavailable'
  });
});

test('missing or malformed token refuses without making Siteverify calls',async()=>{
  let called=0;
  const fetchImpl=async()=>{called++;return response();};
  for (const bad of [undefined,null,'','a b','\n','😎','a'.repeat(TURNSTILE_TOKEN_MAX_CHARS+1)]) {
    const result=await verifyJudgeTurnstileOffline(options({token:bad,fetchImpl}));
    assert.equal(result.valid,false);
    assert.equal(result.code,'invalid-turnstile-token');
  }
  assert.equal(called,0);
});

test('missing secret and invalid configured domain fail before any outbound call',async()=>{
  let called=0;
  const fetchImpl=async()=>{called++;return response();};
  for (const bad of ['',null,'abc','secret with spaces',undefined]) {
    const result=await verifyJudgeTurnstileOffline(options({secret:bad,fetchImpl}));
    assert.equal(result.valid,false);
  }
  for (const host of [undefined,'','https://socialspark.example.workers.dev',
    'socialspark.example.workers.dev:443','*.workers.dev','localhost',
    'bad..workers.dev','UPPER.workers.dev','site.com/evil','site.com?q=1']) {
    const result=await verifyJudgeTurnstileOffline(options({expectedHostname:host,fetchImpl}));
    assert.equal(result.valid,false,String(host));
  }
  assert.equal(called,0);
});

test('untrusted requested action, missing clock, and invalid configuration block transport',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response();};
  for (const action of ['login','',null,'socialspark-jude-session']) {
    assert.equal((await verifyJudgeTurnstileOffline(options({expectedAction:action,fetchImpl}))).valid,false);
  }
  for (const time of [null,0,NaN,Infinity,'now']) {
    assert.equal((await verifyJudgeTurnstileOffline(options({nowMs:time,fetchImpl}))).valid,false);
  }
  assert.equal(calls,0);
});

test('Siteverify failure, including duplicate or expired token, never grants permission',async()=>{
  for(const codes of [['timeout-or-duplicate'],['invalid-input-response'],['bad-request']]){
    const result=await verifyJudgeTurnstileOffline(options({
      fetchImpl:async()=>response({success:false,'error-codes':codes})
    }));
    assert.deepEqual(result,{valid:false,code:'turnstile-rejected'});
  }
});

test('success with incorrect hostname or action is rejected despite valid token',async()=>{
  const host=await verifyJudgeTurnstileOffline(options({
    fetchImpl:async()=>response({...success,hostname:'attacker.example.com'})
  }));
  const action=await verifyJudgeTurnstileOffline(options({
    fetchImpl:async()=>response({...success,action:'unrelated'})
  }));
  assert.deepEqual(host,{valid:false,code:'turnstile-hostname-mismatch'});
  assert.deepEqual(action,{valid:false,code:'turnstile-action-mismatch'});
});

test('token challenge timestamp must be parseable, recent and not from future',async()=>{
  const badTimes=['','not-a-time','2026-10-21T20:00:00-00:00','2026-13-21T20:00:00.000Z',
    new Date(nowMs-TURNSTILE_TOKEN_TTL_MS).toISOString(),
    new Date(nowMs+31_000).toISOString()];
  for(const stamp of badTimes) {
    const result=await verifyJudgeTurnstileOffline(options({
      fetchImpl:async()=>response({...success,challenge_ts:stamp})
    }));
    assert.equal(result.valid,false,stamp);
  }
  const permitted=await verifyJudgeTurnstileOffline(options({
    fetchImpl:async()=>response({...success,challenge_ts:new Date(nowMs-299_000).toISOString()})
  }));
  assert.equal(permitted.valid,true);
});

test('network error and uncertain Siteverify outcomes fail closed without retrying',async()=>{
  let calls=0;
  const result=await verifyJudgeTurnstileOffline(options({
    fetchImpl:async()=>{calls++;throw new Error('SECRET_TOKEN_IN_ERROR');}
  }));
  assert.equal(result.valid,false);
  assert.equal(result.code,'siteverify-unavailable');
  assert.equal(calls,1);
  assert.doesNotMatch(JSON.stringify(result),/SECRET_TOKEN/);
});

test('HTTP failures, non-JSON content, invalid JSON and empty response are denied',async()=>{
  for(const item of [
    response(success,{status:429}),response(success,{status:500}),
    response(success,{type:'text/html'}),
    response(success,{raw:'not json'}),
    response(success,{raw:'[]'}),
    response(success,{raw:''})
  ]) {
    const result=await verifyJudgeTurnstileOffline(options({fetchImpl:async()=>item}));
    assert.deepEqual(result,{valid:false,code:'siteverify-unavailable'});
  }
});

test('overlarge Siteverify replies are bounded and never reflected to caller',async()=>{
  const giant='PRIVATE'.repeat(Math.ceil(TURNSTILE_MAX_RESPONSE_BYTES/7)+200);
  const result=await verifyJudgeTurnstileOffline(options({
    fetchImpl:async()=>response(success,{raw:giant})
  }));
  assert.deepEqual(result,{valid:false,code:'siteverify-unavailable'});
  assert.doesNotMatch(JSON.stringify(result),/PRIVATE/);
});

test('Turnstile can never substitute for one-use sessions or paid authorization',async()=>{
  const result=await verifyJudgeTurnstileOffline(options({fetchImpl:async()=>response()}));
  assert.equal(result.valid,true);
  assert.equal(judgeDemoLiveAccess().allowed,false);
  assert.equal(result.code,'siteverify-verified-offline-integration-only');
});

test('release remains static-only; no Siteverify secrets or production Worker are wired',async()=>{
  const root=new URL('../',import.meta.url);
  const config=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(config.assets.directory,'./public');
  assert.equal(Object.hasOwn(config,'main'),false);
  assert.equal(Object.hasOwn(config,'durable_objects'),false);
  const source=await readFile(new URL('cloudflare/judge-turnstile-core.mjs',root),'utf8');
  assert.doesNotMatch(source,/requestNebiusDrafts|api\.tokenfactory\.nebius\.com|TURNSTILE_SECRET_KEY\s*=/);
});
