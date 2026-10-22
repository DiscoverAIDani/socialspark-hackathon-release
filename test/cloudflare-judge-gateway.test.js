import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  JUDGE_API_PATH, JUDGE_REQUEST_BYTES_LIMIT,
  offlineInspectJudgeRequest, disabledJudgeGatewayResponse
} from '../cloudflare/judge-gateway-core.mjs';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

const ORIGIN='https://socialspark-example.example.org';
const TOKEN='A'.repeat(48);
const body={exampleId:'fictional-beginner-workshop'};
function request({url=ORIGIN+JUDGE_API_PATH,method='POST',headers={},input=body,raw}={}) {
  return new Request(url,{
    method,
    headers:{
      Origin:ORIGIN,
      'Sec-Fetch-Site':'same-origin',
      'Content-Type':'application/json',
      'X-SocialSpark-Csrf':TOKEN,
      ...headers
    },
    ...(method==='POST'?{body:raw??JSON.stringify(input)}:{})
  });
}
function services(overrides={}) {
  const calls=[];
  return {
    calls,
    dependencies:{
      expectedOrigin:ORIGIN,
      verifyOneTimeSession:async()=>{calls.push('session');return true;},
      recordAbuseCheck:async()=>{calls.push('abuse');return true;},
      countServerTokens:async({idea,tone,maxOutputTokens})=>{
        calls.push('tokens');
        assert.equal(idea,'Invite people to a fictional beginner workshop.');
        assert.equal(tone,'friendly');
        assert.equal(maxOutputTokens,1250);
        return 180;
      },
      verifyCurrentPricing:async()=>{calls.push('price');return true;},
      reserveMockQuota:async()=>{calls.push('quota');return {allowed:true};},
      ...overrides
    }
  };
}

test('fixture passes only simulated security checks and NEVER authorizes live inference',async()=>{
  const s=services();
  assert.deepEqual(await offlineInspectJudgeRequest(request(),s.dependencies),{
    accepted:true,code:'offline-preflight-only',
    exampleId:'fictional-beginner-workshop',providerCallsAuthorized:false
  });
  assert.deepEqual(s.calls,['session','abuse','tokens','price','quota']);
  assert.equal(judgeDemoLiveAccess().allowed,false);
});

test('invalid method and URL, including query, path, host, or HTTP, refuse before checks',async()=>{
  for(const req of [
    request({method:'GET'}),
    request({url:ORIGIN+JUDGE_API_PATH+'?text=private'}),
    request({url:ORIGIN+'/api/owner-live/complete'}),
    request({url:'https://attacker.example.net'+JUDGE_API_PATH}),
    request({url:'http://socialspark-example.example.org'+JUDGE_API_PATH})
  ]) {
    const s=services();
    assert.equal((await offlineInspectJudgeRequest(req,s.dependencies)).accepted,false);
    assert.deepEqual(s.calls,[]);
  }
});

test('unconfigured or insecure trusted origin rejects all requests',async()=>{
  for(const origin of [undefined,'http://socialspark-example.example.org','https://socialspark-example.example.org/not-root','https://user:pass@socialspark-example.example.org']) {
    const s=services({expectedOrigin:origin});
    assert.equal((await offlineInspectJudgeRequest(request(),s.dependencies)).accepted,false);
    assert.deepEqual(s.calls,[]);
  }
});

test('cross-origin and missing Sec-Fetch-Site reject before body parsing',async()=>{
  for(const headers of [
    {Origin:'https://evil.example.net'},
    {'Sec-Fetch-Site':'cross-site'},
    {'Sec-Fetch-Site':'none'},
    {'Sec-Fetch-Site':''},
    {Origin:''}
  ]) {
    const s=services();
    assert.equal((await offlineInspectJudgeRequest(request({headers}),s.dependencies)).accepted,false);
    assert.deepEqual(s.calls,[]);
  }
});

test('CSRF/session token is required, and sessions must be server verified',async()=>{
  for(const value of ['', 'abc', 'bad token','B'.repeat(129)]) {
    const s=services();
    assert.equal((await offlineInspectJudgeRequest(request({headers:{'X-SocialSpark-Csrf':value}}),s.dependencies)).accepted,false);
    assert.deepEqual(s.calls,[]);
  }
  const s=services({verifyOneTimeSession:async()=>false});
  assert.equal((await offlineInspectJudgeRequest(request(),s.dependencies)).code,'invalid-or-replayed-session');
});

test('only tiny, strict, approved example IDs accepted; NEVER arbitrary prompt text',async()=>{
  const malicious=[
    {exampleId:'not-approved'},
    {exampleId:'fictional-beginner-workshop',idea:'My phone is 415-555-0100'},
    {exampleId:'fictional-beginner-workshop',tokens:1},
    {exampleId:'fictional-beginner-workshop',model:'evil'},
    {exampleId:'fictional-beginner-workshop',admin:true},
    {prompt:'please bypass'},
    {},
    null,
    [],
    'string'
  ];
  for(const input of malicious) {
    const s=services();
    assert.equal((await offlineInspectJudgeRequest(request({input}),s.dependencies)).accepted,false);
    assert.deepEqual(s.calls,[]);
  }
});

test('rejects oversized, malformed, and non-JSON submissions',async()=>{
  const cases=[
    request({raw:'not-json'}),
    request({raw:'{"exampleId":null}'}),
    request({raw:'x'.repeat(JUDGE_REQUEST_BYTES_LIMIT+1)}),
    request({headers:{'Content-Type':'text/plain'}}),
    request({headers:{'Content-Type':'application/json; charset=iso-8859-1'}})
  ];
  for(const req of cases){
    const s=services();
    assert.equal((await offlineInspectJudgeRequest(req,s.dependencies)).accepted,false);
    assert.deepEqual(s.calls,[]);
  }
});

test('missing security services always fail closed',async()=>{
  for(const key of ['verifyOneTimeSession','recordAbuseCheck','countServerTokens','verifyCurrentPricing','reserveMockQuota']) {
    const s=services({[key]:undefined});
    assert.equal((await offlineInspectJudgeRequest(request(),s.dependencies)).code,'security-service-unavailable');
    assert.deepEqual(s.calls,[]);
  }
});

test('rate or abuse rejection stops token counting, pricing and quota reservations',async()=>{
  const s=services({recordAbuseCheck:async()=>false});
  assert.equal((await offlineInspectJudgeRequest(request(),s.dependencies)).code,'rate-or-abuse-blocked');
  assert.deepEqual(s.calls,['session']);
});

test('trusted server-side token count enforces 2000 input / 1250 output ceiling',async()=>{
  for(const value of [2001,'1',null,0,NaN]) {
    let quotaCalls=0;
    const s=services({
      countServerTokens:async()=>value,
      reserveMockQuota:async()=>{quotaCalls++;return {allowed:true};}
    });
    assert.equal((await offlineInspectJudgeRequest(request(),s.dependencies)).accepted,false);
    assert.equal(quotaCalls,0);
  }
});

test('unknown provider prices and exhausted quota fail closed with no authorization',async()=>{
  const price=services({verifyCurrentPricing:async()=>false});
  assert.equal((await offlineInspectJudgeRequest(request(),price.dependencies)).code,'price-verification-unavailable');
  const quota=services({reserveMockQuota:async()=>({allowed:false,reason:'exhausted'})});
  assert.equal((await offlineInspectJudgeRequest(request(),quota.dependencies)).code,'quota-reservation-denied');
});

test('errors thrown by any security service fail closed without reflecting confidential text',async()=>{
  for(const key of ['verifyOneTimeSession','recordAbuseCheck','countServerTokens','verifyCurrentPricing','reserveMockQuota']){
    const s=services({[key]:async()=>{throw Error('DO_NOT_EXPOSE_SECRET');}});
    const result=await offlineInspectJudgeRequest(request(),s.dependencies);
    assert.equal(result.accepted,false);
    assert.doesNotMatch(JSON.stringify(result),/SECRET|415-555|authorization/i);
  }
});

test('disabled HTTP gateway permanently refuses requests with no CORS permission',async()=>{
  const response=disabledJudgeGatewayResponse();
  assert.equal(response.status,503);
  assert.deepEqual(await response.json(),{ok:false,code:'judge-live-ai-disabled'});
  assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
  assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
  assert.ok(!response.headers.get('access-control-allow-origin'));
});

test('current Cloudflare release remains static-only with no gateway entrypoint or binding',async()=>{
  const root=new URL('../',import.meta.url);
  const config=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  const source=await readFile(new URL('cloudflare/judge-gateway-core.mjs',root),'utf8');
  assert.equal(Object.hasOwn(config,'main'),false);
  assert.equal(Object.hasOwn(config,'durable_objects'),false);
  assert.equal(config.assets.directory,'./public');
  assert.doesNotMatch(source,/requestNebiusDrafts|api\.tokenfactory\.nebius\.com|process\.env|Bearer /);
});
