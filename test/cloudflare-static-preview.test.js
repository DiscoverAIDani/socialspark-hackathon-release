import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root),'utf8');

test('Cloudflare preview deploys static assets only, with no server-side AI', async () => {
  const cfg=JSON.parse(await read('wrangler.jsonc'));
  assert.equal(cfg.name,'socialspark-hackathon-release');
  assert.equal(cfg.assets.directory,'./public');
  assert.equal(cfg.assets.not_found_handling,'none');
  assert.equal(Object.hasOwn(cfg,'main'),false);
  for(const key of ['durable_objects','services','vars','routes','site','triggers','kv_namespaces','d1_databases','r2_buckets','secrets']) {
    assert.equal(Object.hasOwn(cfg,key),false,key+' must not be bound to an offline preview');
  }
  assert.equal(Object.hasOwn(cfg.assets,'binding'),false);
  assert.equal(Object.hasOwn(cfg.assets,'run_worker_first'),false);
});

test('static assets include browser UI but no server source or credentials', async () => {
  const names=await readdir(new URL('../public/',import.meta.url));
  assert.ok(names.includes('index.html'));
  assert.ok(names.includes('app.js'));
  assert.ok(names.includes('_headers'));
  assert.ok(!names.some(name=>/\.env|\.pem$|\.key$|\.mjs$/i.test(name)));
  const html=await read('public/index.html');
  assert.match(html,/Offline examples only — real AI is not enabled/);
  assert.doesNotMatch(html,/data-socialspark-owner-live="yes"/);
});

test('Cloudflare static response headers forbid outgoing browser network and embedded frames',async()=>{
  const headers=await read('public/_headers');
  assert.match(headers,/^\/\*\s*$/m);
  assert.match(headers,/Content-Security-Policy: .*default-src 'none'/);
  assert.match(headers,/script-src 'self'/);
  assert.match(headers,/connect-src 'none'/);
  assert.match(headers,/form-action 'none'/);
  assert.match(headers,/frame-ancestors 'none'/);
  assert.match(headers,/Referrer-Policy: no-referrer/);
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.match(headers,/X-Robots-Tag: noindex/);
  assert.doesNotMatch(headers,/connect-src 'self'|unsafe-inline|unsafe-eval/);
});
