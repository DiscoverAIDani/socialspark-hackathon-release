import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('disabled Worker preview is an isolated, opt-in local config, not the production default',async()=>{
 const root=new URL('../',import.meta.url);
 const live=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
 const local=JSON.parse(await readFile(new URL('wrangler.disabled-preview.jsonc',root),'utf8'));
 const source=await readFile(new URL('cloudflare/offline-preview-worker.mjs',root),'utf8');
 assert.equal(Object.hasOwn(live,'main'),false);
 assert.equal(live.assets.directory,'./public');
 assert.equal(local.workers_dev,false);
 assert.equal(local.main,'./cloudflare/offline-preview-worker.mjs');
 assert.equal(local.assets.directory,'./public');
 assert.equal(local.assets.binding,'ASSETS');
 assert.deepEqual(local.assets.run_worker_first,['/api/*']);
 assert.equal(Object.hasOwn(local,'durable_objects'),false);
 assert.equal(Object.hasOwn(local,'vars'),false);
 assert.doesNotMatch(source,/requestNebiusDrafts|api\.tokenfactory\.nebius\.com|NEBIUS_API_KEY/);
 assert.match(source,/disabledJudgeGatewayResponse/);
});
