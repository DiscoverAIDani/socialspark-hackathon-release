/**
 * One-use, revision-bound server authorization primitives for a FUTURE AI endpoint.
 * This module does not implement an HTTP endpoint and cannot transmit text.
 *
 * Only a trusted, same-origin handler may call approve() after an explicit user
 * interaction and CSRF verification. A caller-supplied `consent: true` is NOT proof.
 * No raw or masked draft text is retained; only a digest, revision, and tone.
 */
import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {inspectMaskedRequest} from './ai-request-validation.mjs';

const TONES = new Set(['friendly','professional','playful']);
const error = code => Object.freeze({ok:false,code});
const digest = text => createHash('sha256').update(text,'utf8').digest();
const same = (a,b) => Buffer.isBuffer(a) && Buffer.isBuffer(b) && a.length === b.length && timingSafeEqual(a,b);
const safeToken = token => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token);

export function createConsentLedger({now=Date.now, ttlMs=120000, issueToken=()=>randomBytes(32).toString('hex')}={}) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1000 || ttlMs > 300000) throw new TypeError('Invalid token TTL');
  let pending=null;
  function validClock(){const time=now();return Number.isSafeInteger(time)&&time>=0?time:null;}
  function validInput(maskedText,revision,tone) {
    if (!TONES.has(tone) || !Number.isSafeInteger(revision) || revision<1) return false;
    // Structural preflight only: explicitConsent is true here solely to run the
    // validation helper. Actual consent can ONLY follow separate approval.
    return inspectMaskedRequest({maskedText,currentRevision:revision,approvedRevision:revision,maskValidated:true,explicitConsent:true}).ok;
  }
  function get(token, stage) {
    const time=validClock();
    if (time===null) {pending=null;return null;}
    if (!pending || !safeToken(token) || pending.ticket!==token || pending.stage!==stage) return null;
    if (time>=pending.expiresAt) {pending=null;return null;}
    return pending;
  }
  return Object.freeze({
    prepare({maskedText,revision,tone}={}) {
      // New preparation invalidates all earlier approvals, even when invalid.
      pending=null;
      if (!validInput(maskedText,revision,tone)) return error('preflight-rejected');
      const time=validClock();
      if (time===null) return error('clock-unavailable');
      const ticket=issueToken();
      if (!safeToken(ticket)) return error('token-unavailable');
      pending={ticket,hash:digest(maskedText),revision,tone,expiresAt:time+ttlMs,stage:'prepared',approvalToken:null};
      return Object.freeze({ok:true,code:'preview-ready',ticket,expiresAt:time+ttlMs});
    },
    approve({ticket,maskedText,revision,tone}={}) {
      // This method must be invoked only by a trusted controller after a real
      // user click and independently verified same-origin CSRF challenge.
      const state=get(ticket,'prepared');
      if (!state) return error('no-valid-preview');
      if (revision!==state.revision || tone!==state.tone || !same(state.hash,digest(typeof maskedText==='string'?maskedText:'')) || !validInput(maskedText,revision,tone)) {
        pending=null;return error('preview-changed');
      }
      const approvalToken=issueToken();
      if (!safeToken(approvalToken) || approvalToken===ticket) {pending=null;return error('token-unavailable');}
      state.stage='approved';state.approvalToken=approvalToken;
      return Object.freeze({ok:true,code:'approved-once',approvalToken});
    },
    consume({ticket,approvalToken,maskedText,revision,tone}={}) {
      const state=get(ticket,'approved');
      if (!state) return error('not-approved-or-consumed');
      // Fail closed and consume before any external call, including failures.
      pending=null;
      if (!safeToken(approvalToken) || state.approvalToken!==approvalToken || revision!==state.revision || tone!==state.tone || !same(state.hash,digest(typeof maskedText==='string'?maskedText:'')) || !validInput(maskedText,revision,tone)) return error('approval-mismatch');
      return Object.freeze({ok:true,code:'one-time-grant',payload:Object.freeze({maskedText,currentRevision:revision,approvedRevision:revision,maskValidated:true,explicitConsent:true}),tone});
    },
    cancel(){pending=null;return Object.freeze({ok:true,code:'cancelled'});},
    snapshot(){return Object.freeze({pending:Boolean(pending),stage:pending?.stage??'none'});}
  });
}
