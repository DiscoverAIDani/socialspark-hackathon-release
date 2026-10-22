/**
 * Static-only judge access honesty check.
 * This test is a release-document safety gate, not proof of public inference.
 * It makes no provider calls and does not deploy anything.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('published production config remains static-only despite local NVIDIA success',async()=>{
 const config=JSON.parse(await read('wrangler.jsonc'));
 assert.deepEqual(Object.keys(config).sort(),['assets','compatibility_date','name']);
 assert.deepEqual(config.assets,{directory:'./public',not_found_handling:'none'});
 const headers=await read('public/_headers');
 assert.match(headers,/connect-src 'none'/);
 assert.equal(Object.hasOwn(config,'main'),false);
 assert.equal(Object.hasOwn(config,'durable_objects'),false);
 assert.equal(Object.hasOwn(config,'vars'),false);
});

test('owner success evidence is distinguished from unrestricted public judge access',async()=>{
 const doc=await read('JUDGE_ACCESS_EVIDENCE_AND_DECISION.md');
 assert.match(doc,/NOT LIVE FOR JUDGES/);
 assert.match(doc,/ONE authorized, potentially billable NVIDIA\/Nebius inference/);
 assert.match(doc,/four distinct, locally validated drafts/);
 assert.match(doc,/no organizer answer/i);
 assert.match(doc,/No enforceable Nebius account\/provider-side \$25 cap has been verified/);
 assert.match(doc,/Do not claim the owner-only local test makes the public site compliant/);
 assert.match(doc,/No live deployment, paid test, provisioned secret/);
 assert.match(doc,/October 30, 2026, 10:00 AM PDT/);
 assert.match(doc,/December 15, 2026/);
 assert.match(doc,/STOPPED. GitHub draft only, public static-only/);
});

test('the readiness note requires separate authorization, not a second one-shot request',async()=>{
 const doc=await read('JUDGE_ACCESS_EVIDENCE_AND_DECISION.md');
 assert.match(doc,/no permission for a second live request/i);
 assert.match(doc,/separate explicit owner authorization/);
 assert.match(doc,/No unapproved payment or paid request/);
 assert.match(doc,/Do not change Devpost content on the user's behalf/);
});
