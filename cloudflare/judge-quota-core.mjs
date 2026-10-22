/**
 * Pure, synchronous quota logic for a future SQLite-backed Cloudflare Durable Object.
 *
 * This is OFFLINE SAFETY WORK ONLY, not a deployed backend or payment permission.
 * The sole Durable Object instance must be addressed using the same constant name
 * on every request. Its storage must be strongly consistent and persistent.
 *
 * IMPORTANT: There is intentionally NO automatic initialization or reset.
 * Missing, corrupt or unexpected storage always denies requests. A separately
 * approved owner-only provisioning process is required before any live rollout.
 */
import {JUDGE_DEMO_POLICY} from '../security/judge-demo-policy.mjs';

export const JUDGE_QUOTA_INSTANCE_NAME = 'socialspark-judge-lifetime-quota-v1';
export const JUDGE_QUOTA_STORAGE_KEY = 'lifetime-quota-state-v1';
// Conservatively reserve 5 cents per attempted call, not a billing guarantee.
// All twenty attempts together reserve the full planned $1 application budget.
// Provider pricing, effective token usage and actual charges require verification.
export const RESERVED_CENTS_PER_ATTEMPT = 5;
const deny = reason => Object.freeze({allowed:false,reason});

function validState(state) {
  if (!state || typeof state !== 'object' || Array.isArray(state) ||
      Object.getPrototypeOf(state) !== Object.prototype) return false;
  const fields=['version','attempts','reservedCents','maxAttempts','maxBudgetCents','revision'];
  if (Object.keys(state).length!==fields.length || fields.some(k=>!Object.hasOwn(state,k))) return false;
  return state.version===1 &&
    state.maxAttempts===JUDGE_DEMO_POLICY.allowedAttemptsLifetime &&
    state.maxBudgetCents===JUDGE_DEMO_POLICY.applicationBudgetCentsLifetime &&
    Number.isSafeInteger(state.attempts) && state.attempts>=0 && state.attempts<=state.maxAttempts &&
    Number.isSafeInteger(state.reservedCents) && state.reservedCents>=0 &&
    state.reservedCents<=state.maxBudgetCents &&
    state.reservedCents===state.attempts*RESERVED_CENTS_PER_ATTEMPT &&
    Number.isSafeInteger(state.revision) && state.revision===state.attempts;
}

/** Test-only fixture, not a setup action or a path to reset production usage. */
export function offlineFixtureState() {
  return Object.freeze({
    version:1, attempts:0, reservedCents:0,
    maxAttempts:JUDGE_DEMO_POLICY.allowedAttemptsLifetime,
    maxBudgetCents:JUDGE_DEMO_POLICY.applicationBudgetCentsLifetime,
    revision:0
  });
}

/**
 * Must run entirely inside ctx.storage.transactionSync(), with ctx.storage.kv.
 * No awaits, external fetches, retries, refunds, user IDs or sensitive text.
 * The caller must refuse upstream inference unless {allowed:true} is durably
 * confirmed AND separate owner activation and request security checks pass.
 */
export function reserveJudgeAttemptInTransaction(kv) {
  if (!kv || typeof kv.get!=='function' || typeof kv.put!=='function')
    return deny('quota-storage-unavailable');
  try {
    const current=kv.get(JUDGE_QUOTA_STORAGE_KEY);
    if (!validState(current)) return deny('quota-missing-or-invalid');
    if (current.attempts>=current.maxAttempts) return deny('lifetime-attempt-limit');
    if (RESERVED_CENTS_PER_ATTEMPT>current.maxBudgetCents-current.reservedCents)
      return deny('lifetime-budget-limit');

    const next={
      ...current,
      attempts:current.attempts+1,
      reservedCents:current.reservedCents+RESERVED_CENTS_PER_ATTEMPT,
      revision:current.revision+1
    };
    kv.put(JUDGE_QUOTA_STORAGE_KEY,next);
    return Object.freeze({allowed:true,reason:'quota-reserved-offline-prototype'});
  } catch {
    // Any failure must abort the wrapping transaction and deny the request.
    // A thrown error is allowed to reach the transactional caller, which
    // catches it, rather than accidentally committing a partial write.
    throw Error('quota-storage-failed');
  }
}

export function inspectJudgeQuotaState(kv) {
  try {
    const state=kv.get(JUDGE_QUOTA_STORAGE_KEY);
    if (!validState(state)) return null;
    return Object.freeze({...state});
  } catch {return null;}
}
