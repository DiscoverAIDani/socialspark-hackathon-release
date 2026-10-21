/**
 * Strict, OFFLINE validator for future untrusted AI JSON replies.
 * No live server handler calls this. Only the local fictional demo uses it. No network, eval,
 * user-specific logging, or automatic application of AI suggestions.
 * Passing means structural and quoted-source checks passed, NOT truth,
 * privacy safety, semantic grounding, or permission to send user content.
 */
import { CATEGORIES, reviewText } from './privacy.js';
import { createMaskPreview } from './masking.js';

const categoryIds = new Set(CATEGORIES.map(category => category.id));
const MAX_RESPONSE_CHARS = 32_000;
const MAX_MASKED_CHARS = 6_000;
const MAX_FINDINGS = 8;
const ENVELOPE_KEYS = Object.freeze(['schemaVersion', 'postRevision', 'analyzedMaskedText', 'findings', 'suggestedPost']);
const FINDING_KEYS = Object.freeze(['category', 'sourceQuote', 'explanation', 'suggestedReplacement']);
const PLACEHOLDERS = /\[[^\]\r\n]{1,80}\]/;
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200C\uFEFF]/u;
const HTML_TAGS = /<\s*\/?\s*[a-z][^>]*>/iu;

function reject(code) { return Object.freeze({ valid: false, code }); }
function plain(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
function keysExactly(value, expected) {
  const keys = Object.keys(value);
  return keys.length === expected.length && keys.every(k => expected.includes(k));
}
function passesLocalSuggestionChecks(value) {
  try {
    const check = reviewText(value);
    if (!check.complete || check.concerns || check.findings.length || check.hiddenCharacters.length) return false;
    const preview = createMaskPreview(value);
    return preview.validation.passedKnownPatterns && preview.replacements.length === 0;
  } catch {
    return false;
  }
}
function checkedText(value, minimum, maximum) {
  return typeof value === 'string' && value.length >= minimum && value.length <= maximum && value.trim().length > 0
    && !CONTROLS.test(value) && !HTML_TAGS.test(value);
}

/**
 * @param {string} rawResponse - JSON text received from an external AI; untrusted.
 * @param {{ expectedRevision: number, expectedMaskedText: string }} context
 * @returns {{valid:false,code:string} | {valid:true,code:string,analysis:object,autoApply:false,requiresManualPlaceholderEditing:boolean}}
 */
export function validateAIResponse(rawResponse, context) {
  if (typeof rawResponse !== 'string' || rawResponse.length < 2 || rawResponse.length > MAX_RESPONSE_CHARS) return reject('invalid-response-size');
  if (!plain(context) || !Number.isSafeInteger(context.expectedRevision) || context.expectedRevision < 1
    || !checkedText(context.expectedMaskedText, 1, MAX_MASKED_CHARS)) return reject('invalid-trusted-context');

  let envelope;
  try { envelope = JSON.parse(rawResponse); } catch { return reject('malformed-json'); }
  if (!plain(envelope) || !keysExactly(envelope, ENVELOPE_KEYS)) return reject('unexpected-response-shape');
  if (envelope.schemaVersion !== 1) return reject('unsupported-schema');
  if (!Number.isSafeInteger(envelope.postRevision) || envelope.postRevision !== context.expectedRevision) return reject('outdated-response');
  if (typeof envelope.analyzedMaskedText !== 'string' || envelope.analyzedMaskedText !== context.expectedMaskedText) return reject('wrong-source-version');
  if (!Array.isArray(envelope.findings) || envelope.findings.length > MAX_FINDINGS) return reject('invalid-findings');
  if (envelope.suggestedPost !== null && !checkedText(envelope.suggestedPost, 1, MAX_MASKED_CHARS)) return reject('invalid-suggestion');
  if (envelope.suggestedPost !== null && !passesLocalSuggestionChecks(envelope.suggestedPost)) return reject('unsafe-suggested-post');

  const findings = [];
  const seen = new Set();
  for (const item of envelope.findings) {
    if (!plain(item) || !keysExactly(item, FINDING_KEYS)) return reject('invalid-finding-shape');
    if (!categoryIds.has(item.category)) return reject('unknown-category');
    if (!checkedText(item.sourceQuote, 1, 300) || !context.expectedMaskedText.includes(item.sourceQuote)) return reject('unsupported-source-quote');
    if (!checkedText(item.explanation, 1, 500) || !checkedText(item.suggestedReplacement, 1, MAX_MASKED_CHARS)) return reject('invalid-finding-text');
    if (!passesLocalSuggestionChecks(item.suggestedReplacement)) return reject('unsafe-replacement');
    const key = `${item.category}\u0000${item.sourceQuote}\u0000${item.suggestedReplacement}`;
    if (seen.has(key)) return reject('duplicate-finding');
    seen.add(key);
    findings.push(Object.freeze({
      category: item.category,
      sourceQuote: item.sourceQuote,
      explanation: item.explanation,
      suggestedReplacement: item.suggestedReplacement
    }));
  }
  const containsPlaceholder = (envelope.suggestedPost !== null && PLACEHOLDERS.test(envelope.suggestedPost))
    || findings.some(item => PLACEHOLDERS.test(item.suggestedReplacement));
  const analysis = Object.freeze({
    postRevision: context.expectedRevision,
    findings: Object.freeze(findings),
    suggestedPost: envelope.suggestedPost
  });
  // Every suggestion is untrusted plain text; future UI MUST display using
  // textContent/value only. It MUST require explicit user choice, rerun local
  // checks, and block direct application of unresolved placeholders.
  return Object.freeze({
    valid: true,
    code: 'structure-and-quote-checks-only',
    analysis,
    autoApply: false,
    requiresManualPlaceholderEditing: Boolean(containsPlaceholder)
  });
}
