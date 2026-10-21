import test from 'node:test';
import assert from 'node:assert/strict';
import {createConsentLedger} from '../security/ai-consent-ledger.mjs';
import {inspectFutureAIRequest} from '../security/ai-http-boundary.mjs';
import {runFictionalNebiusRehearsal,FIXTURE_IDEA} from '../security/nebius-fake-session.mjs';
import {createAppServer} from '../server.mjs';

const base={maskedText:FIXTURE_IDEA,revision:2,tone:'friendly'};
function flow(ledger,value=base){
 const prep=ledger.prepare(value);
 assert.equal(prep.ok,true);
 const approval=ledger.approve({...value,ticket:prep.ticket});
 assert.equal(approval.ok,true);
 return {prep,approval};
}
test('separate preview and approval required before one-use consume',()=>{
 const ledger=createConsentLedger();const p=ledger.prepare(base);
 assert.equal(p.ok,true);
 assert.equal(ledger.consume({...base,ticket:p.ticket,approvalToken:'f'.repeat(64)}).ok,false);
 assert.equal(ledger.snapshot().stage,'prepared');
 const a=ledger.approve({...base,ticket:p.ticket});
 assert.equal(a.ok,true);
 const grant=ledger.consume({...base,ticket:p.ticket,approvalToken:a.approvalToken});
 assert.equal(grant.ok,true);assert.deepEqual(Object.keys(grant.payload).sort(),['approvedRevision','currentRevision','explicitConsent','maskValidated','maskedText'].sort());
 assert.equal(grant.payload.explicitConsent,true);
 assert.equal(ledger.consume({...base,ticket:p.ticket,approvalToken:a.approvalToken}).ok,false);
});
test('pending ledger retains no raw or masked content',()=>{
 const ledger=createConsentLedger();ledger.prepare(base);
 assert.deepEqual(ledger.snapshot(),{pending:true,stage:'prepared'});
 assert.doesNotMatch(JSON.stringify(ledger.snapshot()),/workshop/i);
});
test('editing after preview invalidates approval and discards preview',()=>{
 const ledger=createConsentLedger();const p=ledger.prepare(base);
 assert.equal(ledger.approve({...base,maskedText:FIXTURE_IDEA+' Changed.',ticket:p.ticket}).code,'preview-changed');
 assert.equal(ledger.snapshot().pending,false);
});
test('editing after approval consumes approval even when changed',()=>{
 const ledger=createConsentLedger();const {prep,approval}=flow(ledger);
 assert.equal(ledger.consume({...base,revision:3,ticket:prep.ticket,approvalToken:approval.approvalToken}).ok,false);
 assert.equal(ledger.snapshot().pending,false);
});
test('tone and revision are bound to consent',()=>{
 for(const edit of [{tone:'playful'},{revision:3}]){
  const ledger=createConsentLedger();const prep=ledger.prepare(base);
  assert.equal(ledger.approve({...base,...edit,ticket:prep.ticket}).ok,false);
 }
});
test('expiry prevents approval and request',()=>{
 let t=1000;const ledger=createConsentLedger({now:()=>t,ttlMs:1000});
 const prep=ledger.prepare(base);t+=1000;
 assert.equal(ledger.approve({...base,ticket:prep.ticket}).ok,false);
});
test('a second preview invalidates a prior one',()=>{
 const ledger=createConsentLedger();const first=ledger.prepare(base);
 const second=ledger.prepare({...base,revision:3});
 assert.equal(second.ok,true);
 assert.equal(ledger.approve({...base,ticket:first.ticket}).ok,false);
});
test('cancel immediately invalidates prepared or approved previews',()=>{
 const ledger=createConsentLedger();const {prep,approval}=flow(ledger);
 ledger.cancel();assert.equal(ledger.consume({...base,ticket:prep.ticket,approvalToken:approval.approvalToken}).ok,false);
});
test('invalid masked text cannot be prepared for approval',()=>{
 const bad=['Call 916-555-0198','Visit 123 Main Street','Our house will be empty all week','[PHONE_9999]'];
 for (const maskedText of bad) assert.equal(createConsentLedger().prepare({...base,maskedText}).ok,false);
});
test('fake Nebius path returns exactly three validated drafts and spends nothing',async()=>{
 let observed=false;
 const result=await runFictionalNebiusRehearsal({onTransport:(url,req)=>{
   assert.match(url,/api\.tokenfactory\.nebius\.com/);
   assert.ok(req.body.includes('facebook'));
   observed=true;
 }});
 assert.equal(observed,true);assert.equal(result.ok,true);assert.equal(result.platformCount,4);
 assert.equal(result.creditsSpent,0);assert.equal(result.realNetworkCalls,0);
 assert.equal(result.replayBlocked,true);
});
test('no browser route to provider is created by mocked consent feature',async()=>{
 const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const r=await fetch(`http://127.0.0.1:${server.address().port}/api/generate`,{method:'POST',body:'test'});
  assert.equal(r.status,405);
  const js=await fetch(`http://127.0.0.1:${server.address().port}/studio.js`);
  assert.match(js.headers.get('content-security-policy'),/connect-src 'none'/);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
const csrf='a'.repeat(64),origin='https://socialspark.example';
const request={method:'POST',origin,fetchSite:'same-origin',contentType:'application/json',contentLength:350,csrf};
test('future HTTPS boundary accepts correctly shaped same-origin request only',()=>{
 assert.equal(inspectFutureAIRequest(request,{expectedOrigin:origin,expectedCsrf:csrf}).ok,true);
});
test('future gateway blocks CSRF, cross-origin, bad method and oversized bodies',()=>{
 for(const variant of [{csrf:'b'.repeat(64)},{origin:'https://other.example'},{fetchSite:'cross-site'},{method:'GET'},{contentLength:9000},{contentLength:undefined},{contentType:'text/plain'}]) {
  assert.equal(inspectFutureAIRequest({...request,...variant},{expectedOrigin:origin,expectedCsrf:csrf}).ok,false);
 }
});
test('future gateway needs configured HTTPS and session secret',()=>{
 assert.equal(inspectFutureAIRequest(request,{expectedOrigin:'http://socialspark.example',expectedCsrf:csrf}).ok,false);
 assert.equal(inspectFutureAIRequest(request,{expectedOrigin:origin,expectedCsrf:'abc'}).ok,false);
});
