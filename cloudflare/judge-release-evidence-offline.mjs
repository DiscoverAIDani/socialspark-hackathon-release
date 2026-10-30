/**
 * SocialSpark judge-only NO-GO review checklist. OFFLINE PLANNING ONLY.
 *
 * THIS IS NOT A FINANCIAL AUTHORIZATION GATE, NOT A CREDIT BALANCE CHECK,
 * NOT A PROVIDER CHARGE CAP, AND NOT A PRODUCTION ROUTE.
 *
 * Never publish account-specific credit amounts, private owner budgets,
 * payment methods, or judge identities in this source.
 * This helper returns only missing evidence/NO-GO. Even a fully satisfied
 * checklist NEVER returns permission to deploy or call a paid API.
 *
 * A future release requires separate trusted operational proofs, independent
 * review and the owner's explicit consent. User-provided checkboxes cannot
 * replace provider-issued contracts, account billing controls or real tests.
 */

export const OFFLINE_JUDGE_HORIZON='2026-12-23T23:59:59-08:00';
export const JUDGE_RELEASE_GATES=Object.freeze([
  Object.freeze({
    id:'judge-identity',
    evidence:'Real identity-scoped Cloudflare Access policy and Worker JWT validation'
  }),
  Object.freeze({
    id:'judging-full-pass',
    evidence:'Capacity for legitimate multi-judge full evaluation, not a shared 20-call prototype'
  }),
  Object.freeze({
    id:'prompt-scope',
    evidence:'A complete eligible judge flow with real input and real output, not just prerecorded samples'
  }),
  Object.freeze({
    id:'provider-transport',
    evidence:'Correct secure server model integration with real usage accounting and bounded requests'
  }),
  Object.freeze({
    id:'production-security',
    evidence:'Actual Cloudflare Worker/Turnstile/CSRF/quotas/stop switch tested independently'
  }),
  Object.freeze({
    id:'provider-financial-limit',
    evidence:'Independent financial containment validated for the full availability period'
  }),
  Object.freeze({
    id:'availability-through-dec23',
    evidence:'Real ongoing uptime, access instructions, emergency operations and end-date plan'
  }),
  Object.freeze({
    id:'owner-deploy-approval',
    evidence:'Separate explicit authorization to deploy the public judge service'
  }),
  Object.freeze({
    id:'owner-billable-test-approval',
    evidence:'Separate explicit authorization to run any potentially billable provider test'
  })
]);

const known=Object.freeze(JUDGE_RELEASE_GATES.map(g=>g.id));
const isOwnPlain=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;

/**
 * Evidence is bookkeeping, not a substitute for external verification.
 * 'creditBalanceKnown' and 'topUpsOff' deliberately do not occur in the gate
 * list: neither condition proves provider-enforced financial containment.
 */
export function reviewOfflineJudgeReadiness(evidence={}){
  const valid=isOwnPlain(evidence)&&Object.keys(evidence).length<=known.length&&
    Object.keys(evidence).every(k=>known.includes(k)&&typeof evidence[k]==='boolean');
  const unverified=valid?
    known.filter(k=>evidence[k]!==true):[...known];
  return Object.freeze({
    status:'NO-GO',
    deploymentApproved:false,
    paidInferenceApproved:false,
    providerCallsAuthorized:false,
    creditIsHardSpendingCap:false,
    fullAvailabilityThrough:OFFLINE_JUDGE_HORIZON,
    missingEvidence:Object.freeze(unverified),
    note:valid && unverified.length===0?
      'All checklist entries are claimed; independently verify source evidence and obtain separate real release authorization. This tool cannot enable a service.':
      'Credit availability, low estimated token costs, and disabled automatic top-ups do not guarantee provider-enforced financial containment.'
  });
}
