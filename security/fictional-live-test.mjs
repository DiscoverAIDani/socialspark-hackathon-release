/**
 * Owner-operated, exactly-one-attempt fictional provider harness.
 * Never called by the web server/browser. Only a fixed public-safe demonstration
 * sentence may be sent. Live execution requires a separate explicit operator
 * confirmation and an external credential provided at runtime.
 */
import {createConsentLedger} from './ai-consent-ledger.mjs';
import {requestNebiusDrafts} from './nebius-draft-adapter.mjs';
import {createUsageGuard} from './usage-guard.mjs';
import {FIXTURE_IDEA} from './nebius-fake-session.mjs';

export const NANO_MODEL = 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B';
export const LIVE_UNLOCK = 'SECOND_FICTIONAL_REQUEST';
export const LIVE_CONFIRMATION = 'SEND SECOND FICTIONAL REQUEST';
const reject = code => Object.freeze({ok:false,code,providerAttempts:0});

/** Reject obvious copy/paste mistakes before reserving a potentially billable call.
 * Never return the key or echo any of its characters. This is not a key validity test:
 * only Nebius can check authentication when the owner authorizes a live request.
 */
export function inspectOperatorKey(key) {
  if (typeof key !== 'string' || key.length < 12 || key.length > 512) return Object.freeze({ok:false,code:'invalid-key-length'});
  if (/\s/.test(key) || /[^\x21-\x7e]/.test(key)) return Object.freeze({ok:false,code:'key-whitespace-or-invalid-character'});
  const half=key.length/2;
  if (Number.isInteger(half) && key.slice(0,half)===key.slice(half)) return Object.freeze({ok:false,code:'key-appears-pasted-twice'});
  return Object.freeze({ok:true,code:'key-format-plausible'});
}


/** A fresh guard is created for each operator run. Cross-restart lock is CLI-side. */
export async function performFictionalLiveTest({
  unlock, confirmation, key, transport, reservationCents=1,
  ledger=createConsentLedger(), usage=createUsageGuard({hourlyRequestCap:1,dailyBudgetCents:1})
}={}) {
  if (unlock!==LIVE_UNLOCK || confirmation!==LIVE_CONFIRMATION) return reject('operator-authorization-required');
  if (!inspectOperatorKey(key).ok) return reject('credential-not-configured');
  if (typeof reservationCents!=='number' || reservationCents!==1) return reject('reservation-limit-not-accepted');
  const prepared=ledger.prepare({maskedText:FIXTURE_IDEA, revision:1,tone:'friendly'});
  if (!prepared.ok) return reject('preview-failed');
  // The CLI calls this only after the separate human confirmation; no browser
  // "consent:true" flag or arbitrary text is ever considered consent.
  const approved=ledger.approve({ticket:prepared.ticket,maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'});
  if (!approved.ok) return reject('authorization-failed');
  const grant=ledger.consume({ticket:prepared.ticket,approvalToken:approved.approvalToken,maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'});
  if (!grant.ok) return reject('grant-failed');
  const reservation=usage.reserve(1);
  if (!reservation.allowed) return reject('local-one-cent-reservation-refused');
  const fetchImpl=typeof transport==='function'?transport:fetch;
  // No retries. The attempt may still incur provider billing on a response error.
  const result=await requestNebiusDrafts({
    payload:grant.payload,tone:grant.tone,key,model:NANO_MODEL,
    serverAuthorization:true,providerApproval:true,fetchImpl,timeoutMs:15000
  });
  if (!result.ok) return Object.freeze({ok:false,code:result.code,providerAttempts:1});
  return Object.freeze({ok:true,code:result.code,providerAttempts:1,drafts:result.drafts});
}
