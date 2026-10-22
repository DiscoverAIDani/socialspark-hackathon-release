/**
 * FAIL-CLOSED RELEASE LOCKS for the public SocialSpark offline preview.
 *
 * These are CI assertions, NOT authorization to deploy inference.
 * Changing the production config to enable a Worker requires separately
 * approved security, privacy, spend and Devpost compliance reviews.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {judgeDemoLiveAccess,JUDGE_DEMO_POLICY}
  from '../security/judge-demo-policy.mjs';
import disabled from '../cloudflare/judge-gateway-disabled-worker.mjs';

const root=new URL('../',import.meta.url);
const file=path=>readFile(new URL(path,root),'utf8');

test('root production Wrangler remains static-only, without any worker, DB binding or live settings',async()=>{
  const cfg=JSON.parse(await file('wrangler.jsonc'));
  assert.deepEqual(Object.keys(cfg).sort(),
    ['name','compatibility_date','assets'].sort());
  assert.equal(cfg.name,'socialspark-hackathon-release');
  assert.equal(cfg.assets.directory,'./public');
  assert.equal(cfg.assets.not_found_handling,'none');
  assert.equal(Object.hasOwn(cfg,'main'),false);
  assert.equal(Object.hasOwn(cfg,'durable_objects'),false);
  assert.equal(Object.hasOwn(cfg,'services'),false);
  assert.equal(Object.hasOwn(cfg,'vars'),false);
  assert.equal(Object.hasOwn(cfg,'route'),false);
  assert.equal(Object.hasOwn(cfg,'routes'),false);
  assert.equal(Object.hasOwn(cfg,'previews'),false);
});

test('static public site CSP denies all network connections including paid model calls',async()=>{
  const headers=await file('public/_headers');
  assert.match(headers,/default-src 'none'/);
  assert.match(headers,/connect-src 'none'/);
  assert.match(headers,/script-src 'self'/);
  assert.match(headers,/frame-ancestors 'none'/);
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.match(headers,/Cache-Control: no-store/);
});

test('development Worker configurations cannot quietly become production Worker binding',async()=>{
  const cfg=JSON.parse(await file('wrangler.disabled-preview.jsonc'));
  assert.equal(cfg.workers_dev,false);
  assert.equal(cfg.name,'socialspark-disabled-preview-local-only');
  assert.equal(cfg.main,'./cloudflare/offline-preview-worker.mjs');
  assert.equal(cfg.assets.directory,'./public');
  assert.deepEqual(cfg.assets.run_worker_first,['/api/*']);
  assert.equal(Object.hasOwn(cfg,'vars'),false);
  assert.equal(Object.hasOwn(cfg,'durable_objects'),false);
  const runtime=JSON.parse(await file('runtime-security/wrangler.runtime.jsonc'));
  assert.equal(runtime.workers_dev,false);
  assert.equal(runtime.main,'./fixture-worker.mjs');
  assert.match(runtime.name,/local-runtime-tests-do-not-deploy/);
});

test('judge demo policy remains hard disabled regardless of headers, flags or session data',async()=>{
  assert.equal(JUDGE_DEMO_POLICY.liveAiEnabled,false);
  assert.equal(judgeDemoLiveAccess().allowed,false);
  const fixtures=[
    new Request('https://fictional.invalid/api/judge-demo/generate'),
    new Request('https://fictional.invalid/api/judge-demo/generate',{
      method:'POST',
      headers:{
        Origin:'https://fictional.invalid',
        'X-Live-Ai-Enabled':'true',
        'X-Owner-Approved':'true',
        'Content-Type':'application/json'
      },
      body:JSON.stringify({exampleId:'fictional-beginner-workshop',enablePaidAI:true})
    }),
    new Request('https://fictional.invalid/api/judge-demo/generate',{
      method:'OPTIONS',headers:{'Access-Control-Request-Method':'POST'}
    })
  ];
  for(const request of fixtures){
    const response=await disabled.fetch(request);
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),
      {ok:false,code:'judge-live-ai-disabled'});
    assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
  for(const path of [
    '/api/judge-demo/session','/api/owner/activate','/api/reset',
    '/api/stop/reset','/api/owner-live/complete'
  ]){
    const response=await disabled.fetch(
      new Request('https://fictional.invalid'+path,{method:'POST'}));
    assert.equal(response.status,404);
  }
});

test('no default direct model client is imported by either test-only public Worker',async()=>{
  for(const path of [
    'cloudflare/judge-gateway-disabled-worker.mjs',
    'cloudflare/offline-preview-worker.mjs'
  ]){
    const source=await file(path);
    assert.doesNotMatch(source,/api\.tokenfactory\.nebius\.com/);
    assert.doesNotMatch(source,/requestNebiusDrafts/);
    assert.doesNotMatch(source,/NEBIUS_API_KEY/);
    assert.doesNotMatch(source,/judge-offline-shutdown-gate\.mjs/);
  }
});

test('test-only Durable Objects have no production binding or public provision route',async()=>{
  const rootWrangler=JSON.parse(await file('wrangler.jsonc'));
  const local=JSON.parse(await file('runtime-security/wrangler.runtime.jsonc'));
  assert.equal(Object.hasOwn(rootWrangler,'durable_objects'),false);
  assert.deepEqual(
    local.durable_objects.bindings.map(x=>x.name).sort(),
    ['TEST_QUOTA','TEST_SESSIONS','TEST_RATE','TEST_STOP'].sort()
  );
  const source=await file('runtime-security/fixture-worker.mjs');
  assert.doesNotMatch(source,/api\/provision|api\/initialize|api\/activate/);
  assert.match(source,/judge-gateway-disabled-worker/);
});
