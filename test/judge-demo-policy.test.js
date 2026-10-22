import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JUDGE_DEMO_POLICY,
  getApprovedJudgeExample,
  checkProposedTokenLimits,
  judgeDemoLiveAccess
} from '../security/judge-demo-policy.mjs';

test('judge demo starts disabled and cannot authorize paid requests', () => {
  assert.equal(JUDGE_DEMO_POLICY.liveAiEnabled,false);
  assert.equal(judgeDemoLiveAccess().allowed,false);
  assert.equal(judgeDemoLiveAccess().reason,'paid-inference-not-authorized');
  assert.equal(Object.isFrozen(JUDGE_DEMO_POLICY),true);
});

test('planning limits are lifetime 20 attempts, 100 cents, 2000 input and 1250 output tokens', () => {
  assert.equal(JUDGE_DEMO_POLICY.allowedAttemptsLifetime,20);
  assert.equal(JUDGE_DEMO_POLICY.applicationBudgetCentsLifetime,100);
  assert.equal(JUDGE_DEMO_POLICY.maximumInputTokensPerAttempt,2000);
  assert.equal(JUDGE_DEMO_POLICY.maximumOutputTokensPerAttempt,1250);
  assert.equal(JUDGE_DEMO_POLICY.approvedExamplesOnly,true);
});

test('only preapproved fictional example can be selected', () => {
  assert.deepEqual(getApprovedJudgeExample('fictional-beginner-workshop'),{
    idea:'Invite people to a fictional beginner workshop.',tone:'friendly'
  });
  assert.equal(getApprovedJudgeExample('arbitrary-post'),null);
  assert.equal(getApprovedJudgeExample('__proto__'),null);
  assert.equal(getApprovedJudgeExample(null),null);
});

test('rejects invalid, missing or oversized token counts', () => {
  for (const args of [
    undefined,
    {},
    {serverMeasuredInputTokens:0,requestedMaxOutputTokens:1250},
    {serverMeasuredInputTokens:2001,requestedMaxOutputTokens:1250},
    {serverMeasuredInputTokens:2000,requestedMaxOutputTokens:1251},
    {serverMeasuredInputTokens:1.5,requestedMaxOutputTokens:1250},
    {serverMeasuredInputTokens:'2000',requestedMaxOutputTokens:1250},
    {serverMeasuredInputTokens:2000,requestedMaxOutputTokens:NaN}
  ]) assert.equal(checkProposedTokenLimits(args).allowed,false,JSON.stringify(args));
  assert.equal(checkProposedTokenLimits({serverMeasuredInputTokens:2001,requestedMaxOutputTokens:1250}).reason,'input-token-limit');
  assert.equal(checkProposedTokenLimits({serverMeasuredInputTokens:2000,requestedMaxOutputTokens:1251}).reason,'output-token-limit');
});

test('accepts capped token counts for OFFLINE evaluation only', () => {
  assert.deepEqual(checkProposedTokenLimits({
    serverMeasuredInputTokens:2000,requestedMaxOutputTokens:1250
  }),{allowed:true,reason:'offline-policy-check-only'});
  assert.equal(judgeDemoLiveAccess().allowed,false,'offline check is never a live payment grant');
});
