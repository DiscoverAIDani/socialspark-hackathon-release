/**
 * Tests the isolated Access probe only. No Cloudflare deployment, real
 * identities, model requests, tokens, payment or network activity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import probe from '../cloudflare/judge-access-probe-only-worker.mjs';

const request=(path='/',method='GET',headers={})=>
  new Request('https://fictional-judge-auth-test.workers.dev'+path,{
    method,headers
  });
const verified=()=>({
  access:{getIdentity:async()=>({email:'approved-test@example.org'})}
});
const result=async(req,ctx)=>{
  const response=await probe.fetch(req,{},ctx);
  return {response,data:await response.json()};
};

test('missing Cloudflare Access always denies even with forged login headers',async()=>{
  for(const req of [
    request(),
    request('/health'),
    request('/', 'GET', {'Cf-Access-Jwt-Assertion':'fake.jwt.data',
      'X-Forwarded-Email':'approved-test@example.org'})
  ]){
    const r=await result(req);
    assert.equal(r.response.status,403);
    assert.deepEqual(r.data,{
      ok:false,code:'access-unavailable',inferenceEnabled:false,
      providerCallsAuthorized:false
    });
  }
});

test('only a runtime-verified identity returns success, without personal data',async()=>{
  for(const p of ['/','/health']){
    const r=await result(request(p),verified());
    assert.equal(r.response.status,200);
    assert.deepEqual(r.data,{
      ok:true,code:'access-authenticated-test-only',
      inferenceEnabled:false,providerCallsAuthorized:false
    });
    assert.equal(JSON.stringify(r.data).includes('approved-test@example.org'),false);
    assert.equal(r.response.headers.get('access-control-allow-origin'),null);
    assert.match(r.response.headers.get('content-security-policy'),/connect-src 'none'/);
    assert.equal(r.response.headers.get('cache-control'),'no-store, max-age=0');
  }
});

test('failed identity lookup, missing email and malformed identities fail closed',async()=>{
  const bad=[
    {access:{getIdentity:async()=>{throw Error('internal failure');}}},
    {access:{getIdentity:async()=>null}},
    {access:{getIdentity:async()=>({})}},
    {access:{getIdentity:async()=>({email:'bad email'})}},
    {access:{getIdentity:async()=>({email:'not-an-email'})}},
    {access:{getIdentity:async()=>({email:'x'.repeat(255)+'@example.org'})}},
    {access:{getIdentity:'not-a-function'}},
    {access:null}
  ];
  for(const ctx of bad){
    const r=await result(request(),ctx);
    assert.equal(r.response.status,403);
    assert.equal(r.data.providerCallsAuthorized,false);
  }
});

test('only GET root or health is accepted; generation, secrets and reset do not exist',async()=>{
  for(const [path,method] of [
    ['/api/judge-demo/generate','POST'],
    ['/api/judge-demo/session','POST'],
    ['/api/owner/activate','POST'],
    ['/api/reset','POST'],
    ['/health?token=fake','GET'],
    ['/health','POST'],
    ['/x','GET']
  ]){
    const r=await result(request(path,method),verified());
    assert.equal(r.response.status,404);
    assert.equal(r.data.code,'not-found');
    assert.equal(r.data.providerCallsAuthorized,false);
  }
});

test('zero upstream requests and static production Worker isolation',async()=>{
  const file=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
  const [code,prod,disabled]=await Promise.all([
    file('cloudflare/judge-access-probe-only-worker.mjs'),
    file('wrangler.jsonc'),
    file('cloudflare/judge-gateway-disabled-worker.mjs')
  ]);
  assert.doesNotMatch(code.replace('async fetch(request,env,ctx){',''),/\bfetch\s*\(/); // HTTP entrypoint method is not an outbound network call
  assert.doesNotMatch(code,/NEBIUS_API_KEY|NVIDIA_API_KEY|api\.tokenfactory\.nebius\.com/);
  assert.doesNotMatch(code,/console\.log|console\.error/);
  assert.deepEqual(Object.keys(JSON.parse(prod)).sort(),
    ['assets','compatibility_date','name']);
  assert.doesNotMatch(disabled,/judge-access-probe-only-worker/);
});
