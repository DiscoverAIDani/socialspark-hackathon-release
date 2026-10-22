/**
 * Offline-only specification for a possible judge-accessible SocialSpark demo.
 *
 * This module has NO network access, credentials, hosting, payment authorization,
 * provider call, or public API route. Importing it cannot enable paid inference.
 * Do not deploy live inference until durable atomic quota storage, authoritative
 * server-side token counting, verified provider pricing, abuse protection,
 * secure HTTPS hosting and an independent owner approval have all been completed.
 */
export const JUDGE_DEMO_POLICY = Object.freeze({
  liveAiEnabled: false,
  allowedAttemptsLifetime: 20,
  applicationBudgetCentsLifetime: 100,
  maximumInputTokensPerAttempt: 2000,
  maximumOutputTokensPerAttempt: 1250,
  approvedExamplesOnly: true,
  model: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B'
});

// Only the already-tested fictional scenario is included initially.
// Any additional sample text needs separate review before inclusion.
const EXAMPLES = Object.freeze({
  'fictional-beginner-workshop': Object.freeze({
    idea: 'Invite people to a fictional beginner workshop.',
    tone: 'friendly'
  })
});

const deny = reason => Object.freeze({allowed:false,reason});

export function getApprovedJudgeExample(id) {
  if (typeof id !== 'string' || !Object.hasOwn(EXAMPLES,id)) return null;
  return EXAMPLES[id];
}

/**
 * Pure offline validation only. The caller must obtain the input-token count
 * from an independently verified SERVER-SIDE tokenizer, never from browser
 * input or a self-reported field. There is NO trusted tokenizer wired yet.
 */
export function checkProposedTokenLimits({serverMeasuredInputTokens,requestedMaxOutputTokens}={}) {
  if (!Number.isSafeInteger(serverMeasuredInputTokens) || serverMeasuredInputTokens < 1 ||
      !Number.isSafeInteger(requestedMaxOutputTokens) || requestedMaxOutputTokens < 1) {
    return deny('trusted-token-count-required');
  }
  if (serverMeasuredInputTokens > JUDGE_DEMO_POLICY.maximumInputTokensPerAttempt) return deny('input-token-limit');
  if (requestedMaxOutputTokens > JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt) return deny('output-token-limit');
  return Object.freeze({allowed:true,reason:'offline-policy-check-only'});
}

/** Deliberately always denies until a separately approved live gateway exists. */
export function judgeDemoLiveAccess() {
  return deny('paid-inference-not-authorized');
}
