/**
 * OFFLINE PRECHECK ONLY — byte-size and immutable fixture audit.
 *
 * This module does NOT count model tokens. JSON wire bytes are not the same
 * as Nemotron chat-template tokens and must never be passed to
 * checkProposedTokenLimits as an authoritative count.
 *
 * The sole purpose of this extra defense is to reject prompt drift,
 * arbitrary visitor content, unexpected model parameters and oversized
 * server-built payloads BEFORE a future trusted tokenizer is consulted.
 *
 * Not imported by production Worker. No network, credentials or inference.
 */
import {
  JUDGE_DEMO_POLICY,getApprovedJudgeExample
} from '../security/judge-demo-policy.mjs';
import {createNebiusMessages}
  from '../security/nebius-draft-adapter.mjs';

export const MAX_FIXED_JUDGE_JSON_WIRE_BYTES=1200;
export const JUDGE_FIXED_EXAMPLE_ID='fictional-beginner-workshop';

const deny=reason=>Object.freeze({
  ok:false,reason,authoritativeTokenCount:false,
  providerCallsAuthorized:false
});
const plain=o=>o!==null&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype;
const fields=(o,keys)=>plain(o)&&Object.keys(o).length===keys.length&&
  keys.every(k=>Object.hasOwn(o,k));

export function auditOfflineFixedJudgePayload({body,exampleId}={}){
  if(exampleId!==JUDGE_FIXED_EXAMPLE_ID)return deny('unapproved-example');
  const example=getApprovedJudgeExample(exampleId);
  if(!example)return deny('unapproved-example');
  if(!fields(body,['model','messages','temperature','max_tokens','stream'])||
     body.model!==JUDGE_DEMO_POLICY.model||
     body.temperature!==0.45||
     body.max_tokens!==JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt||
     body.stream!==false||
     !Array.isArray(body.messages)||body.messages.length!==2)
    return deny('fixed-payload-shape-drift');
  const expected=createNebiusMessages(example.idea,example.tone);
  for(let i=0;i<expected.length;i++){
    const actual=body.messages[i];
    if(!fields(actual,['role','content'])||
       actual.role!==expected[i].role||
       actual.content!==expected[i].content)
      return deny('fixed-message-content-drift');
  }
  // This fixed example is intentionally ASCII. New languages/prompts need a
  // new review; do not mistake ASCII byte size for a model-token proof.
  if(body.messages.some(x=>!(/^[\x00-\x7F]*$/.test(x.content))))
    return deny('non-ascii-fixed-message');
  let wireBytes;
  try{
    wireBytes=new TextEncoder().encode(JSON.stringify(body)).byteLength;
  }catch{return deny('payload-serialization-failed');}
  if(!Number.isSafeInteger(wireBytes)||wireBytes<=0||
     wireBytes>MAX_FIXED_JUDGE_JSON_WIRE_BYTES)
    return deny('fixed-payload-byte-limit');
  return Object.freeze({
    ok:true,mode:'offline-fixed-prompt-bytes-only',
    wireBytes,
    authoritativeTokenCount:false,
    providerCallsAuthorized:false
  });
}
