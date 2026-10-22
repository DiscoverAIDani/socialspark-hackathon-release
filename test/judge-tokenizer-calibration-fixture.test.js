import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {getOfflineJudgeTokenizerFixture}
  from '../scripts/export-judge-tokenizer-fixture.mjs';
import {JUDGE_DEMO_POLICY} from '../security/judge-demo-policy.mjs';
import {FIXTURE_IDEA} from '../security/nebius-fake-session.mjs';

test('offline model-tokenizer calibration source is exactly the audited immutable fixture',()=>{
  const value=getOfflineJudgeTokenizerFixture();
  assert.equal(value.model,JUDGE_DEMO_POLICY.model);
  assert.equal(value.exampleId,'fictional-beginner-workshop');
  assert.equal(value.jsonWireBytes,1038);
  assert.equal(value.max_tokens,1250);
  assert.equal(value.stream,false);
  assert.equal(value.messages.length,2);
  assert.equal(value.messages[1].content.includes(FIXTURE_IDEA),true);
  assert.equal(Object.isFrozen(value),true);
  assert.match(value.disclaimer,/Not Nebius authoritative usage/);
  assert.equal(Object.hasOwn(value,'secret'),false);
  assert.equal(Object.hasOwn(value,'apiKey'),false);
});

test('Node fixture exporter CLI prints only one JSON record without provider calls',()=>{
  const path=new URL('../scripts/export-judge-tokenizer-fixture.mjs',import.meta.url);
  const run=spawnSync(process.execPath,[path.pathname],{
    encoding:'utf8',timeout:8000,maxBuffer:16000,
    env:{PATH:process.env.PATH}
  });
  assert.equal(run.status,0,run.stderr);
  assert.equal(run.stderr,'');
  const body=JSON.parse(run.stdout);
  assert.deepEqual(body,getOfflineJudgeTokenizerFixture());
});

test('offline Python calibration cannot fetch or load model weights',async()=>{
  const source=await readFile(new URL(
    '../scripts/calibrate-judge-tokenizer-offline.py',import.meta.url),'utf8');
  assert.match(source,/HF_HUB_OFFLINE.*=.*"1"/);
  assert.match(source,/TRANSFORMERS_OFFLINE.*=.*"1"/);
  assert.match(source,/local_files_only=True/);
  assert.match(source,/trust_remote_code=False/);
  assert.doesNotMatch(source,/AutoModelForCausalLM|model\.generate\(|NEBIUS_API_KEY|TOKEN_FACTORY_KEY/);
  assert.doesNotMatch(source,/\.download\(|requests\.get\(|urlopen\(/);
  assert.match(source,/providerTokenCountVerified": False/);
  assert.match(source,/servingChatTemplateMatch": "UNVERIFIED"/);
});
