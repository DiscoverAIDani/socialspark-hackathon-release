/**
 * Step 18V: fail-closed checks for the CURRENT static-only release.
 *
 * A green result means the tracked configuration still forbids networked
 * judge inference. It DOES NOT authorize a deployment, prove the deployed
 * site's state, prove provider spending controls, or satisfy hackathon rules.
 *
 * Deliberate future changes to these production invariants require a
 * separately reviewed owner-approved release; never silently weaken this test.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';
import {disabledJudgeGatewayResponse} from '../cloudflare/judge-gateway-core.mjs';

const read = path => readFile(new URL('../'+path,import.meta.url),'utf8');
const readJson = async path => JSON.parse(await read(path));

test('production Wrangler config has ONLY static site keys',async()=>{
  const cfg=await readJson('wrangler.jsonc');
  assert.deepEqual(Object.keys(cfg).sort(),['assets','compatibility_date','name']);
  assert.equal(cfg.name,'socialspark-hackathon-release');
  assert.deepEqual(cfg.assets,{directory:'./public',not_found_handling:'none'});
  assert.match(cfg.compatibility_date,/^\d{4}-\d{2}-\d{2}$/);
});

test('production Wrangler config has no executable Worker or paid bindings',async()=>{
  const cfg=await readJson('wrangler.jsonc');
  for(const forbidden of [
    'main','routes','route','workers_dev','durable_objects','migrations',
    'vars','secrets','triggers','env','services','kv_namespaces','d1_databases',
    'r2_buckets','ai','unsafe','browser','tail_consumers'
  ])assert.equal(Object.hasOwn(cfg,forbidden),false,forbidden);
});

test('current public CSP denies browser outbound connections',async()=>{
  const headers=await read('public/_headers');
  assert.match(headers,/Content-Security-Policy:[^\r\n]*connect-src 'none'/);
  assert.doesNotMatch(headers,/connect-src\s+(?:https?:|\*|self)/i);
});

test('current public entrypoint explicitly describes offline behavior',async()=>{
  const html=await read('public/index.html');
  assert.match(html,/Offline examples only[^<]*real AI is not enabled/i);
  assert.doesNotMatch(html,/data-socialspark-owner-live\s*=\s*["']yes["']/);
});

test('locked judge policy is non-live regardless of caller request',()=>{
  const state=judgeDemoLiveAccess();
  assert.equal(state.allowed,false);
  assert.equal(state.reason,'paid-inference-not-authorized');
});

test('unbound judge gateway responds 503 and no-store',async()=>{
  const response=disabledJudgeGatewayResponse();
  assert.equal(response.status,503);
  assert.equal(response.headers.get('Cache-Control'),'no-store, max-age=0');
  assert.match(response.headers.get('Content-Security-Policy'),'connect-src \'none\'');
  const body=await response.json();
  assert.deepEqual(body,{ok:false,code:'judge-live-ai-disabled'});
});

test('isolated workerd test configuration cannot be mistaken for production',async()=>{
  const prod=await readJson('wrangler.jsonc');
  const local=await readJson('runtime-security/wrangler.runtime.jsonc');
  assert.notEqual(local.name,prod.name);
  assert.equal(local.name,'socialspark-local-runtime-tests-do-not-deploy');
  assert.equal(local.workers_dev,false);
  assert.equal(local.main,'./fixture-worker.mjs');
  assert.equal(Object.hasOwn(prod,'main'),false);
});

test('repository npm scripts do not run Cloudflare deployment commands',async()=>{
  const pkg=await readJson('package.json');
  for(const [name,command] of Object.entries(pkg.scripts??{})){
    assert.doesNotMatch(command,/\bwrangler(?:\.cmd)?\s+(?:deploy|publish|secret|versions)\b/i,name);
    assert.doesNotMatch(command,/\bnpx\s+cloudflare\s+deploy\b/i,name);
  }
});

test('GitHub Actions workflows contain no deployment or secret-provisioning steps',async()=>{
  const workflowDir=new URL('../.github/workflows/',import.meta.url);
  const entries=(await readdir(workflowDir)).filter(n=>/\.ya?ml$/i.test(n));
  assert.ok(entries.length>=2,'expected test workflows are present');
  for(const filename of entries){
    const yaml=await readFile(new URL(filename,workflowDir),'utf8');
    assert.doesNotMatch(yaml,/\bwrangler(?:\.cmd)?\s+(?:deploy|publish|secret\s+(?:put|delete)|versions\s+(?:deploy|secret))\b/i,filename);
    assert.doesNotMatch(yaml,/cloudflare\/wrangler-action@/i,filename);
  }
});
