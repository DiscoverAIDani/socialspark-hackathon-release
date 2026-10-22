import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {
  auditOfflineFixedJudgePayload,MAX_FIXED_JUDGE_JSON_WIRE_BYTES,
  JUDGE_FIXED_EXAMPLE_ID
} from '../cloudflare/judge-prompt-byte-gate.mjs';
import {buildOfflineNemotronEnvelope}
  from '../cloudflare/judge-nemotron-envelope-offline.mjs';
import {JUDGE_DEMO_POLICY}
  from '../security/judge-demo-policy.mjs';
import {createNebiusMessages}
  from '../security/nebius-draft-adapter.mjs';
import {FIXTURE_IDEA}
  from '../security/nebius-fake-session.mjs';

const fixture=()=>({
  model:JUDGE_DEMO_POLICY.model,
  messages:createNebiusMessages(FIXTURE_IDEA,'friendly'),
  temperature:0.45,
  max_tokens:1250,
  stream:false
});
const check=body=>auditOfflineFixedJudgePayload({
  body,exampleId:JUDGE_FIXED_EXAMPLE_ID
});

test('current fixed fictional payload is ASCII and comfortably within audited bytes',()=>{
  const result=check(fixture());
  assert.deepEqual(result,{
    ok:true,mode:'offline-fixed-prompt-bytes-only',
    wireBytes:1038,
    authoritativeTokenCount:false,
    providerCallsAuthorized:false
  });
  assert.equal(MAX_FIXED_JUDGE_JSON_WIRE_BYTES,1200);
});

test('prompt drift or unsupported model settings must block before token counting',()=>{
  const changes=[
    body=>body.messages[0].content+=' injected',
    body=>body.messages[0].content=body.messages[1].content,
    body=>body.messages[1].content='different post',
    body=>body.messages[1].content+=' 🛑',
    body=>body.messages[0].role='assistant',
    body=>body.messages.push({role:'user',content:'more'}),
    body=>body.model='other/provider-model',
    body=>body.max_tokens=100000,
    body=>body.temperature=0.46,
    body=>body.stream=true,
    body=>body.extra_body={chat_template_kwargs:{enable_thinking:false}},
    body=>body.user_id='secret',
    body=>body.response_format={type:'json_object'}
  ];
  for(const change of changes){
    const body=fixture();change(body);
    const result=check(body);
    assert.equal(result.ok,false);
    assert.equal(result.authoritativeTokenCount,false);
    assert.equal(result.providerCallsAuthorized,false);
  }
});

test('reject unexpected request object types and alternate scenario',()=>{
  for(const body of [null,[],new Date(),{},{...fixture(),messages:[]}])
    assert.equal(check(body).ok,false);
  assert.equal(auditOfflineFixedJudgePayload({
    body:fixture(),exampleId:'unapproved-example'
  }).ok,false);
  assert.equal(auditOfflineFixedJudgePayload({
    body:fixture()
  }).ok,false);
});

test('allow a fake server tokenizer only AFTER passing byte/shape audit',async()=>{
  let callbacks=0;
  const accepted=await buildOfflineNemotronEnvelope({
    request:{exampleId:JUDGE_FIXED_EXAMPLE_ID},
    countTrustedTokens:async data=>{
      callbacks++;
      assert.equal(data.model,JUDGE_DEMO_POLICY.model);
      assert.equal(data.messages[0].role,'system');
      return 300; // MOCK ONLY; not an official tokenizer measurement
    }
  });
  assert.equal(accepted.ok,true);
  assert.equal(accepted.auditedWireBytes,1038);
  assert.equal(accepted.providerCallsAuthorized,false);
  assert.equal(callbacks,1);
});

test('missing tokenizer still fails even when byte-size audit passes',async()=>{
  const result=await buildOfflineNemotronEnvelope({
    request:{exampleId:JUDGE_FIXED_EXAMPLE_ID}
  });
  assert.equal(result.ok,false);
  assert.equal(result.reason,'trusted-tokenizer-unavailable');
  assert.equal(result.providerCallsAuthorized,false);
});

test('neither offline byte gate nor request-builder is a live model transport',async()=>{
  const root=new URL('../',import.meta.url);
  const content=await readFile(new URL('cloudflare/judge-prompt-byte-gate.mjs',root),'utf8');
  assert.doesNotMatch(content,/\bfetch\s*\(|api\.tokenfactory\.nebius\.com|NEBIUS_API_KEY/);
  const prod=JSON.parse(await readFile(new URL('wrangler.jsonc',root),'utf8'));
  assert.equal(Object.hasOwn(prod,'main'),false);
  assert.equal(Object.hasOwn(prod,'durable_objects'),false);
});
