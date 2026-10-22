/**
 * OFFLINE ONLY: audited, reproducible *estimate*, not a provider billing cap.
 *
 * Pricing reference (checked 2026-10-21):
 * https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference
 *
 * These rates can change. Their presence in this source is NOT provider
 * attestation or assurance about any account's billing, promotions, hidden
 * reasoning tokens, output usage, retries, parallel calls or auto top-ups.
 * No caller of this module can enable inference: all results explicitly carry
 * providerCallsAuthorized:false and are estimates only.
 */
import {JUDGE_DEMO_POLICY} from '../security/judge-demo-policy.mjs';

export const JUDGE_PRICING_REFERENCE=Object.freeze({
  model:JUDGE_DEMO_POLICY.model,
  inputMicroUsdPerMillion:60000,
  outputMicroUsdPerMillion:240000,
  referenceCheckedOn:'2026-10-21',
  source:'https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference'
});

const MICROS_PER_DOLLAR=1000000n;
const TOKEN_RATE_DENOMINATOR=1000000n;
const DENY=(reason)=>Object.freeze({
  ok:false,reason,providerCallsAuthorized:false
});

function strictRecord(value,fields){
  if(value===null||typeof value!=='object'||Array.isArray(value)||
      Object.getPrototypeOf(value)!==Object.prototype)return false;
  const actual=Object.keys(value);
  return actual.length===fields.length&&fields.every(k=>
    Object.hasOwn(value,k));
}
function validRate(value){
  return Number.isSafeInteger(value)&&value>0&&value<=1000000000;
}
function validCount(value,limit){
  return Number.isSafeInteger(value)&&value>=0&&value<=limit;
}
/** Returns micro-USD (one millionth of a dollar), rounding UP. */
function roundUpMicros(totalMicroUsdTimesTokens){
  return (totalMicroUsdTimesTokens+TOKEN_RATE_DENOMINATOR-1n)/
    TOKEN_RATE_DENOMINATOR;
}
function numericMicros(scaled){
  if(scaled>BigInt(Number.MAX_SAFE_INTEGER))return null;
  return Number(scaled);
}
function rateShape(pricing){
  const fields=['model','inputMicroUsdPerMillion',
    'outputMicroUsdPerMillion','referenceCheckedOn','source'];
  return strictRecord(pricing,fields)&&
    typeof pricing.model==='string'&&
    typeof pricing.referenceCheckedOn==='string'&&
    typeof pricing.source==='string'&&
    validRate(pricing.inputMicroUsdPerMillion)&&
    validRate(pricing.outputMicroUsdPerMillion);
}

/**
 * Compare only to the fixed public rate snapshot, never to a caller-provided
 * discounted/cheaper/higher tier. A mismatch, new model, missing provenance
 * or malicious number must DENY the offline reference estimation.
 */
export function estimateOfflineJudgeMaximum({
  model,
  pricing,
  maxInputTokens,
  maxOutputTokens,
  automaticRetries=0
}={}){
  if(automaticRetries!==0)return DENY('automatic-retries-forbidden');
  if(model!==JUDGE_DEMO_POLICY.model)return DENY('unapproved-model');
  if(!rateShape(pricing))return DENY('pricing-unverified');
  const expected=JUDGE_PRICING_REFERENCE;
  if(Object.keys(expected).some(k=>pricing[k]!==expected[k]))
    return DENY('pricing-drift-requires-review');
  if(!Number.isSafeInteger(maxInputTokens)||maxInputTokens<1||
      maxInputTokens>JUDGE_DEMO_POLICY.maximumInputTokensPerAttempt||
      !Number.isSafeInteger(maxOutputTokens)||maxOutputTokens<1||
      maxOutputTokens>JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt)
    return DENY('token-envelope-invalid');

  // BigInt avoids floating point underestimation or multiplication overflow.
  const numerator=BigInt(maxInputTokens)*
    BigInt(pricing.inputMicroUsdPerMillion)+
    BigInt(maxOutputTokens)*
    BigInt(pricing.outputMicroUsdPerMillion);
  const perAttemptMicros=numericMicros(roundUpMicros(numerator));
  if(perAttemptMicros===null)return DENY('cost-overflow');
  const plannedAttempts=JUDGE_DEMO_POLICY.allowedAttemptsLifetime;
  const lifetimeMicros=numericMicros(BigInt(perAttemptMicros)*
    BigInt(plannedAttempts));
  if(lifetimeMicros===null)return DENY('cost-overflow');
  return Object.freeze({
    ok:true,mode:'offline-public-price-estimate-only',
    providerCallsAuthorized:false,
    perAttemptMicroUsd:perAttemptMicros,
    lifetimeMicroUsdAtCurrentAttemptPolicy:lifetimeMicros,
    plannedAttempts,
    note:'No Nebius spend cap; provider/account billing can differ'
  });
}

/**
 * Offline POST-response usage check, with NO external model invocation.
 * Zero/negative/fractional/unsafe token counts are denied rather than guessed.
 * This is a local assertion; a future gateway must verify that provider usage
 * is authoritative and includes ALL billable tokens and any failed attempts.
 */
export function assessOfflineReportedUsage({
  reportedInputTokens,reportedOutputTokens,model,pricing
}={}){
  if(model!==JUDGE_DEMO_POLICY.model||!rateShape(pricing)||
     Object.keys(JUDGE_PRICING_REFERENCE).some(k=>
       JUDGE_PRICING_REFERENCE[k]!==pricing[k]))
    return DENY('usage-price-or-model-unverified');
  if(!validCount(reportedInputTokens,
      JUDGE_DEMO_POLICY.maximumInputTokensPerAttempt)||
     !validCount(reportedOutputTokens,
      JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt))
    return DENY('usage-exceeds-policy-or-untrusted');
  const total=BigInt(reportedInputTokens)*
    BigInt(pricing.inputMicroUsdPerMillion)+
    BigInt(reportedOutputTokens)*
    BigInt(pricing.outputMicroUsdPerMillion);
  const microUsd=numericMicros(roundUpMicros(total));
  if(microUsd===null)return DENY('usage-cost-overflow');
  return Object.freeze({
    ok:true,mode:'offline-reported-usage-estimate-only',
    estimatedMicroUsd:microUsd,providerCallsAuthorized:false
  });
}
