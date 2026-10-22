/**
 * LOCAL REHEARSAL ONLY: validate a provider-shaped COMPLETION RESPONSE without
 * making ANY inference call or granting authorization to spend.
 *
 * A future live implementation must verify the provider's real response
 * shape and authoritative usage, including reasoning/hidden tokens, pricing
 * at execution, failed attempts and reconciliation to Nebius billing.
 *
 * Rejecting an already-generated response DOES NOT undo provider charges.
 * This deliberately does not reset the permanent attempt/quota reservation.
 */
import {JUDGE_DEMO_POLICY,getApprovedJudgeExample}
  from '../security/judge-demo-policy.mjs';
import {validateGeneratedDrafts}
  from '../security/nebius-draft-adapter.mjs';
import {
  JUDGE_PRICING_REFERENCE,assessOfflineReportedUsage
} from './judge-model-pricing-offline.mjs';

const DENY=reason=>Object.freeze({
  ok:false,reason,providerCallsAuthorized:false
});
const plain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;
const count=(n,limit)=>Number.isSafeInteger(n)&&n>=0&&n<=limit;

export function inspectOfflineProviderCompletion({
  envelope,exampleId,verifiedReference=JUDGE_PRICING_REFERENCE
}={}){
  const example=getApprovedJudgeExample(exampleId);
  if(!example)return DENY('unapproved-fixture');
  if(!plain(envelope) || envelope.model!==JUDGE_DEMO_POLICY.model)
    return DENY('unexpected-model-or-shape');
  if(!Array.isArray(envelope.choices)||envelope.choices.length!==1||
     !plain(envelope.choices[0]))return DENY('unexpected-choice-count');
  const choice=envelope.choices[0];
  if(choice.index!==0||choice.finish_reason!=='stop'||
     !plain(choice.message)||choice.message.role!=='assistant'||
     typeof choice.message.content!=='string')
    return DENY('truncated-or-untrusted-completion');

  const usage=envelope.usage;
  if(!plain(usage)||!count(usage.prompt_tokens,2000)||
     !count(usage.completion_tokens,1250)||
     !count(usage.total_tokens,3250)||
     usage.prompt_tokens<1||usage.completion_tokens<1||
     usage.total_tokens!==usage.prompt_tokens+usage.completion_tokens)
    return DENY('untrusted-or-excessive-provider-usage');

  // Token details, when reported, must fit inside the reported completion.
  const detail=usage.completion_tokens_details;
  if(detail!==undefined&&
     (!plain(detail)||!count(detail.reasoning_tokens,usage.completion_tokens)))
    return DENY('untrusted-reasoning-usage');

  const estimated=assessOfflineReportedUsage({
    model:envelope.model,pricing:verifiedReference,
    reportedInputTokens:usage.prompt_tokens,
    reportedOutputTokens:usage.completion_tokens
  });
  if(estimated.ok!==true)return DENY('pricing-or-usage-requires-review');

  // Reuse the actual SocialSpark safety checks for all four drafts.
  const checked=validateGeneratedDrafts(choice.message.content,example.idea);
  if(checked.ok!==true)return DENY('output-failed-local-review');
  return Object.freeze({
    ok:true,mode:'offline-response-rehearsal-only',
    exampleId,
    estimatedMicroUsd:estimated.estimatedMicroUsd,
    // Drafts are test-only and must not be treated as verified provider output.
    drafts:checked.drafts,
    providerCallsAuthorized:false
  });
}
