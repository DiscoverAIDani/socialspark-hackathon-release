/** Tests are local-only. No account lookups, network, paid calls, or live deployment. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
 OFFLINE_JUDGE_HORIZON,JUDGE_RELEASE_GATES,reviewOfflineJudgeReadiness
} from '../cloudflare/judge-release-evidence-offline.mjs';

test('conservative Pacific date covers the entire December 23 window',()=>{
 assert.equal(OFFLINE_JUDGE_HORIZON,'2026-12-23T23:59:59-08:00');
 assert.equal(Date.parse(OFFLINE_JUDGE_HORIZON),Date.parse('2026-12-24T07:59:59Z'));
});

test('undocumented or missing evidence always means no go',()=>{
 const r=reviewOfflineJudgeReadiness();
 assert.equal(r.status,'NO-GO');
 assert.equal(r.deploymentApproved,false);
 assert.equal(r.paidInferenceApproved,false);
 assert.equal(r.providerCallsAuthorized,false);
 assert.equal(r.creditIsHardSpendingCap,false);
 assert.equal(r.missingEvidence.length,JUDGE_RELEASE_GATES.length);
});

test('available credit is not a provider-enforced hard stop',()=>{
 // Account balance is deliberately NOT accepted as release evidence, even in a mock.
 const r=reviewOfflineJudgeReadiness({creditBalanceKnown:true,topUpsOff:true});
 assert.equal(r.providerCallsAuthorized,false);
 assert.equal(r.creditIsHardSpendingCap,false);
 assert.ok(r.missingEvidence.includes('provider-financial-limit'));
});

test('a single remaining missing financial gate blocks release',()=>{
 const everything=Object.fromEntries(JUDGE_RELEASE_GATES.map(x=>[x.id,true]));
 everything['provider-financial-limit']=false;
 const r=reviewOfflineJudgeReadiness(everything);
 assert.deepEqual(r.missingEvidence,['provider-financial-limit']);
 assert.equal(r.status,'NO-GO');
 assert.equal(r.paidInferenceApproved,false);
});

test('fake self-reported evidence cannot grant inference, even with all checked',()=>{
 const everything=Object.fromEntries(JUDGE_RELEASE_GATES.map(x=>[x.id,true]));
 const r=reviewOfflineJudgeReadiness(everything);
 assert.deepEqual(r.missingEvidence,[]);
 assert.equal(r.status,'NO-GO');
 assert.equal(r.deploymentApproved,false);
 assert.equal(r.providerCallsAuthorized,false);
 assert.match(r.note,/independently verify/i);
});

test('invalid prototypes, nonboolean flags, and unknown keys fail closed',()=>{
 const attempts=[
  null,[],false,'ready',Object.create(null),{foo:true},
  {'provider-financial-limit':'yes'}, {'provider-financial-limit':1},
  {'provider-financial-limit':true, 'creditBalanceKnown':true}
 ];
 for(const a of attempts){
  const r=reviewOfflineJudgeReadiness(a);
  assert.equal(r.status,'NO-GO');
  assert.equal(r.missingEvidence.length,JUDGE_RELEASE_GATES.length);
 }
});

test('reserved capacity, actual judge ID, issuer and model gateway remain required',()=>{
 const ids=JUDGE_RELEASE_GATES.map(x=>x.id);
 for(const id of ['judge-identity','judging-full-pass','prompt-scope',
  'provider-transport','production-security','provider-financial-limit',
  'availability-through-dec23','owner-deploy-approval',
  'owner-billable-test-approval']){
  assert.ok(ids.includes(id),id);
 }
 assert.equal(new Set(ids).size,ids.length);
});

test('planning layer is not imported by public or disabled Workers',async()=>{
 const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
 const [cfg,pub,gateway,gate]=await Promise.all([
  read('wrangler.jsonc'),read('public/_headers'),
  read('cloudflare/judge-gateway-disabled-worker.mjs'),
  read('cloudflare/judge-release-evidence-offline.mjs')
 ]);
 assert.equal(Object.hasOwn(JSON.parse(cfg),'main'),false);
 assert.match(pub,/connect-src 'none'/);
 assert.doesNotMatch(gateway,/judge-release-evidence-offline/);
 assert.match(gate,/NOT A FINANCIAL AUTHORIZATION GATE/);
 assert.doesNotMatch(gate,/fetch\s*\(/);
 assert.doesNotMatch(gate,/\$25|\$50/,'never expose owner financial facts in public source');
});

test('stable immutable assessment output and immutable gate definitions',()=>{
 const r=reviewOfflineJudgeReadiness();
 assert.equal(Object.isFrozen(r),true);
 assert.equal(Object.isFrozen(r.missingEvidence),true);
 assert.equal(Object.isFrozen(JUDGE_RELEASE_GATES),true);
 for(const g of JUDGE_RELEASE_GATES) assert.equal(Object.isFrozen(g),true);
 assert.throws(()=>r.missingEvidence.push('surprise'),TypeError);
});
