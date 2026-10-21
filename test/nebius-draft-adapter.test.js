import test from 'node:test';
import assert from 'node:assert/strict';
import { requestNebiusDrafts, validateGeneratedDrafts, createNebiusMessages, NEBIUS_ADAPTER_STATE } from '../security/nebius-draft-adapter.mjs';
import {createAppServer} from '../server.mjs';
const maskedIdea = 'Invite people to a fictional beginner workshop. Call [PHONE_1].';
const approved = {maskedText:maskedIdea, currentRevision:1, approvedRevision:1, maskValidated:true,explicitConsent:true};
const clean = {facebook:'Join our fictional beginner workshop. Everyone is welcome!',instagram:'A beginner workshop for everyone! ✨ #Community #Learning',linkedin:'A beginner-friendly workshop will welcome newcomers.',tiktok:'Just getting started? ✨ Join our fictional beginner workshop! #LearnTogether'};
const good = JSON.stringify(clean);
function fakeResponse(output=good) {return {ok:true,body:new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode(JSON.stringify({choices:[{message:{content:output}}]})));controller.close();}})};}
const options = {payload:approved,tone:'friendly', key:'TEST_KEY_NOT_REAL_12345',model:'nvidia/test-model',serverAuthorization:true,providerApproval:true};
test('adapter is permanently disconnected from the shipping HTTP server',async()=>{
  assert.equal(NEBIUS_ADAPTER_STATE.liveRouteEnabled,false);
  assert.equal(NEBIUS_ADAPTER_STATE.paidRequestsAllowed,false);
  const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try {const response=await fetch(`http://127.0.0.1:${server.address().port}/api/generate`,{method:'POST',body:'test'});assert.equal(response.status,405);}
  finally {await new Promise(resolve=>server.close(resolve));}
});
test('no caller may trigger a request without server approval and provider approval',async()=>{
  let called=0;
  const fetchImpl=()=>{called++;throw Error('should never be reached');};
  assert.equal((await requestNebiusDrafts({...options,serverAuthorization:false,fetchImpl})).code,'provider-authorization-required');
  assert.equal((await requestNebiusDrafts({...options,providerApproval:false,fetchImpl})).code,'provider-authorization-required');
  assert.equal(called,0);
});
test('offline server-side mock exercises actual Nebius request format without network', async()=>{
 let invoked=0;
 const outcome=await requestNebiusDrafts({...options,fetchImpl:async(url,req)=>{
   invoked++;assert.equal(url,'https://api.tokenfactory.nebius.com/v1/chat/completions');
   assert.match(req.headers.Authorization,/^Bearer TEST_KEY/);
   const data=JSON.parse(req.body);
   assert.equal(data.model,'nvidia/test-model');
   assert.ok(data.messages[1].content.includes('[PHONE_1]'));
   assert.equal(data.max_tokens,1250);
   return fakeResponse();
 }});
 assert.equal(invoked,1);assert.equal(outcome.ok,true);assert.equal(outcome.autoApply,false);assert.equal(outcome.autoPublish,false);
 assert.deepEqual(Object.keys(outcome.drafts),['facebook','instagram','linkedin','tiktok']);
});
test('raw personal data and invalid masking block request even if claimed approved',async()=>{
  let called=0;const fetchImpl=()=>{called++;return fakeResponse();};
  for (const input of ['Call me at 916-555-0198.', 'See https://example.com/private','Traveling all week; home is empty.']) {
    const outcome=await requestNebiusDrafts({...options,payload:{...approved,maskedText:input},fetchImpl});
    assert.equal(outcome.ok,false);
  }
  assert.equal(called,0);
});
test('revision mismatch and extra fields block before provider call',async()=>{
 let called=0;const fetchImpl=()=>{called++;return fakeResponse();};
 for (const payload of [{...approved,approvedRevision:0},{...approved,rawIdea:'raw text'},{...approved,explicitConsent:false}]){
    assert.equal((await requestNebiusDrafts({...options,payload,fetchImpl})).ok,false);
 }
 assert.equal(called,0);
});
test('malformed model JSON, missing platforms and extra keys are rejected',()=>{
 assert.equal(validateGeneratedDrafts('not json',maskedIdea).ok,false);
 assert.equal(validateGeneratedDrafts(JSON.stringify({facebook:'ok',instagram:'ok'}),maskedIdea).code,'wrong-platform-shape');
 assert.equal(validateGeneratedDrafts(JSON.stringify({...clean,extra:'hi'}),maskedIdea).code,'wrong-platform-shape');
});
test('model responses containing phone number, address, markup, or placeholders are rejected',()=>{
 for(const extra of ['Call 916-555-0198','Meet at 123 Main Street.','Call [PHONE_1].','<script>alert(1)</script>']){
   assert.equal(validateGeneratedDrafts(JSON.stringify({...clean,facebook:extra}),maskedIdea).ok,false);
 }
});
test('malformed provider response or network exception fails closed without content in error',async()=>{
 const result=await requestNebiusDrafts({...options,fetchImpl:async()=>{throw Error('SECRET_POST_TEXT');}});
 assert.equal(result.ok,false);assert.doesNotMatch(JSON.stringify(result),/SECRET/);
 const oversized=await requestNebiusDrafts({...options,fetchImpl:async()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new Uint8Array(20000));c.close();}})})});
 assert.equal(oversized.code,'provider-response-too-large');
});
test('prompts request distinct platforms and do not authorize invented details',()=>{
 const m=createNebiusMessages(maskedIdea,'friendly');
 assert.deepEqual(m.map(x=>x.role),['system','user']);
 assert.match(m[0].content,/Do not invent facts/);
 assert.ok(m[1].content.includes('[PHONE_1]'));
});

test('provider responses cannot silently add external links or numerical factual claims',()=>{
  assert.equal(validateGeneratedDrafts(JSON.stringify({...clean,facebook:'View https://example.com/meeting'}),maskedIdea).code,'unreviewed-link-in-draft');
  assert.equal(validateGeneratedDrafts(JSON.stringify({...clean,facebook:'Join us on October 23!'}),maskedIdea).code,'unsupported-number-in-draft');
});
test('provider must return four distinct platform drafts',()=>{
  assert.equal(validateGeneratedDrafts(JSON.stringify({...clean,instagram:clean.facebook}),maskedIdea).code,'duplicate-platform-drafts');
});

// A failed provider request must not leak secrets or retry automatically.
// These are injected fake responses, never external network calls.
test('safe HTTP status classes distinguish failed authorization from routing problems', async()=>{
 const expected = new Map([
   [400,'provider-invalid-request-400'],
   [401,'provider-authentication-failed-401'],
   [403,'provider-access-denied-403'],
   [404,'provider-model-or-route-not-found-404'],
   [429,'provider-rate-limited-429'],
   [503,'provider-service-error-5xx'],
 ]);
 for (const [status,code] of expected){
   let calls=0;
   const response=await requestNebiusDrafts({...options,fetchImpl:async()=>{
     calls++;
     return {ok:false,status,body:'SECRET_RESPONSE_BODY_SHOULD_NOT_BE_READ',headers:{authorization:'SECRET'}};
   }});
   assert.equal(response.ok,false);
   assert.equal(response.code,code);
   assert.equal(calls,1);
   assert.doesNotMatch(JSON.stringify(response),/SECRET|TEST_KEY|body|authorization/i);
 }
});
test('missing or malformed HTTP status produces safe generic failure', async()=>{
 for (const r of [{ok:false},{ok:false,status:'401'},{ok:false,status:599.5}]){
   const result=await requestNebiusDrafts({...options,fetchImpl:async()=>r});
   assert.equal(result.code,'provider-request-failed');
 }
});
