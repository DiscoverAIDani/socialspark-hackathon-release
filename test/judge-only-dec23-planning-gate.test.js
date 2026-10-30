/**
 * October 29 manager clarification: prevent mock judge demo from being
 * mistaken for a live-access release. All assertions are local / static.
 * No provider, Cloudflare, login, Devpost or other network requests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JUDGE_DEMO_POLICY,judgeDemoLiveAccess} from '../security/judge-demo-policy.mjs';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('judge-only planning deadline is December 23, not the earlier manager shorthand',async()=>{
 const doc=await read('JUDGE_ONLY_DEC23_RELEASE_PLAN.md');
 assert.match(doc,/December 23, 2026, end of day Pacific/);
 assert.match(doc,/Manager/);
 assert.match(doc,/full judging pass/);
 assert.match(doc,/follow-up/);
 assert.match(doc,/not a deployment instruction or permission/i);
 assert.doesNotMatch(doc,/\$25\b/,'keep owner-specific financial ceiling private');
});

test('judge Access login and signed JWT are unimplemented gates, not Turnstile',async()=>{
 const doc=await read('JUDGE_ONLY_DEC23_RELEASE_PLAN.md');
 assert.match(doc,/Turnstile by itself is \*\*not authentication\*\*/);
 assert.match(doc,/signed JWT/);
 assert.match(doc,/\*\*NOT IMPLEMENTED\*\*/);
 assert.match(doc,/authorized judge/i);
 assert.match(doc,/No provider-enforced|NOT VERIFIED/i);
});

test('old mock 20-request shared quota remains explicitly unapproved and AI disabled',async()=>{
 const doc=await read('JUDGE_ONLY_DEC23_RELEASE_PLAN.md');
 assert.match(doc,/NOT judged sufficient or officially accepted/);
 assert.match(doc,/one canned output/);
 assert.equal(JUDGE_DEMO_POLICY.allowedAttemptsLifetime,20);
 assert.equal(JUDGE_DEMO_POLICY.applicationBudgetCentsLifetime,100);
 assert.equal(JUDGE_DEMO_POLICY.liveAiEnabled,false);
 assert.equal(JUDGE_DEMO_POLICY.approvedExamplesOnly,true);
 assert.deepEqual(judgeDemoLiveAccess(),{allowed:false,reason:'paid-inference-not-authorized'});
});

test('no public Worker or model gateway is activated by the plan',async()=>{
 const cfg=JSON.parse(await read('wrangler.jsonc'));
 const headers=await read('public/_headers');
 const disabledWorker=await read('cloudflare/judge-gateway-disabled-worker.mjs');
 const doc=await read('JUDGE_ONLY_DEC23_RELEASE_PLAN.md');
 assert.deepEqual(Object.keys(cfg).sort(),['assets','compatibility_date','name']);
 assert.deepEqual(cfg.assets,{directory:'./public',not_found_handling:'none'});
 assert.match(headers,/connect-src 'none'/);
 assert.match(disabledWorker,/NOT REGISTERED IN WRANGLER/);
 assert.match(disabledWorker,/NEVER authorizes or invokes NVIDIA\/Nebius inference/);
 assert.match(doc,/STATUS: DESIGN \/ NO-GO/);
 assert.match(doc,/separate express approval/);
 assert.match(doc,/NO-GO/);
});
