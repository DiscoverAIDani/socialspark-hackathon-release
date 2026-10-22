/**
 * Print the exact approved fixture for local *offline* tokenizer inspection.
 * Does not run a model, load keys, send requests, or enable AI.
 * Usage: node scripts/export-judge-tokenizer-fixture.mjs > fixture.json
 */
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {JUDGE_DEMO_POLICY,getApprovedJudgeExample}
  from '../security/judge-demo-policy.mjs';
import {createNebiusMessages}
  from '../security/nebius-draft-adapter.mjs';
import {
  auditOfflineFixedJudgePayload,JUDGE_FIXED_EXAMPLE_ID
} from '../cloudflare/judge-prompt-byte-gate.mjs';

export function getOfflineJudgeTokenizerFixture(){
  const example=getApprovedJudgeExample(JUDGE_FIXED_EXAMPLE_ID);
  if(!example)throw Error('approved-fixture-missing');
  const body={
    model:JUDGE_DEMO_POLICY.model,
    messages:createNebiusMessages(example.idea,example.tone),
    temperature:0.45,
    max_tokens:JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt,
    stream:false
  };
  const check=auditOfflineFixedJudgePayload({
    body,exampleId:JUDGE_FIXED_EXAMPLE_ID
  });
  if(check.ok!==true)throw Error('fixed-prompt-audit-failed');
  return Object.freeze({
    ...body,
    exampleId:JUDGE_FIXED_EXAMPLE_ID,
    jsonWireBytes:check.wireBytes,
    disclaimer:'Tokenizer calibration only. Not Nebius authoritative usage or permission for paid inference.'
  });
}

if(process.argv[1] && fileURLToPath(import.meta.url)===resolve(process.argv[1])){
  process.stdout.write(JSON.stringify(getOfflineJudgeTokenizerFixture())+'\n');
}
