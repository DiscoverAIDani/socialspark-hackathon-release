/**
 * Local-only, server-side preflight helper for FUTURE masked AI requests.
 * NOT an authorization to transmit. No HTTP handler currently invokes this.
 * No original posts, placeholder mappings, IP addresses, or content are stored.
 */
import { reviewText } from '../public/privacy.js';
import { createMaskPreview } from '../public/masking.js';

const ALLOWED_PLACEHOLDER = /^\[(?:PHONE|ADDRESS|EMAIL|ACCOUNT|IDENTIFIER|SECRET|CHILD_NAME|SCHOOL|AGE|NAME|WORKPLACE|LOCATION|DATE)_\d{1,3}\]$/;
const PLACEHOLDER = /\[[^\[\]\n]{1,50}\]/g;
const ALL_FIELDS = ['maskedText', 'currentRevision', 'approvedRevision', 'maskValidated', 'explicitConsent'];

function reject(reason) { return { ok: false, reason }; }

export function inspectMaskedRequest(payload) {
  // The actual future endpoint will additionally require secure browser origin,
  // single-use CSRF/session token, HTTPS, budget reservation and explicit fresh consent.
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || Object.getPrototypeOf(payload) !== Object.prototype) return reject('invalid-payload');
  const keys = Object.keys(payload);
  if (keys.length !== ALL_FIELDS.length || keys.some(key => !ALL_FIELDS.includes(key))) return reject('unexpected-field');
  if (payload.maskValidated !== true || payload.explicitConsent !== true) return reject('missing-validation-or-consent');
  // Revision IDs are local opaque counters only, not hashes of private post text.
  if (!Number.isSafeInteger(payload.currentRevision) || payload.currentRevision < 1 || payload.currentRevision !== payload.approvedRevision) return reject('stale-revision');
  const text = payload.maskedText;
  if (typeof text !== 'string' || text.length < 1 || text.length > 6000 || !text.trim()) return reject('invalid-length');
  if (/\r|\0/.test(text)) return reject('unexpected-control-character');
  if (/(?:https?:\/\/|www\.)\S+/i.test(text)) return reject('unreviewed-link');
  // Defense in depth: an unattended residence can be sensitive without containing a phone or address.
  // This is not a complete classifier; provider review and explicit approval remain required.
  if (/\b(?:home|house|apartment|residence)\b.{0,35}\b(?:empty|unoccupied|unattended)\b/i.test(text)) return reject('possible-unattended-residence');
  // Suspicious bracket blocks must not be mistaken for known placeholders.
  const bracketLike = /\[[^\]\n]{0,80}\]/g;
  for (const marker of text.match(bracketLike) ?? []) {
    if (!ALLOWED_PLACEHOLDER.test(marker)) return reject('invalid-placeholder');
  }
  if (text.includes('[') || text.includes(']')) {
    const remainder = text.replace(PLACEHOLDER, '');
    if (remainder.includes('[') || remainder.includes(']')) return reject('invalid-placeholder');
  }
  try {
    const review = reviewText(text);
    if (!review.complete || review.concerns || review.findings.length || review.hiddenCharacters.length) return reject('local-review-not-clear');
    const preview = createMaskPreview(text);
    if (!preview.validation.passedKnownPatterns || preview.replacements.length !== 0) return reject('remaining-maskable-information');
  } catch {
    return reject('local-review-error');
  }
  // Note: even an ok here cannot prove all sensitive info is absent or consent authentic.
  return { ok: true, reason: 'known-pattern-preflight-only' };
}
