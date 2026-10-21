/**
 * v0.7 isolated in-memory suggestion workflow. NO real model access, network,
 * persistence or DOM operations. Candidates are untrusted and must be edited
 * and explicitly applied by the user after a fresh local check.
 */
import { reviewText } from './privacy.js';
import { createMaskPreview } from './masking.js';
import { validateAIResponse } from './ai-response-validation.js';

export const FICTIONAL_POST = 'Call me at 916-555-0198.';
export const FICTIONAL_MASKED = 'Call me at [PHONE_1].';
export const MULTI_FINDING_POST = 'Call me at 916-555-0198 or visit me at 123 Main Street.';
export const MULTI_FINDING_MASKED = 'Call me at [PHONE_1] or visit me at [ADDRESS_1].';
export function isFictionalDemoPost(original) { return original === FICTIONAL_POST || original === MULTI_FINDING_POST; }
const SAMPLE_REPLACEMENT = 'Please contact me through a private message.';
const TOKEN = /\[[^\]\r\n]{1,80}\]/u;
const CONTROLS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u202A-\u202E\u2066-\u2069\u200B-\u200C\uFEFF]/u;

function fail(code, message) { return Object.freeze({ allowed: false, code, message }); }

export function inspectEditedSuggestion(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.trim().length === 0) return fail('empty', 'Enter a suggested post before applying it.');
  if (candidate.length > 6000) return fail('too-long', 'Keep the suggested post within 6,000 characters.');
  if (TOKEN.test(candidate)) return fail('unresolved-placeholder', 'Replace or remove all bracketed placeholders before applying this suggestion.');
  if (CONTROLS.test(candidate)) return fail('hidden-control', 'Remove suspicious invisible or control characters before applying this suggestion.');
  try {
    const review = reviewText(candidate);
    if (!review.complete) return fail('incomplete-checks', 'The edited suggestion has incomplete language or hidden-character coverage.');
    if (review.concerns || review.findings.length) return fail('privacy-concerns', 'Local checks detected privacy concerns in this suggestion. Edit it to remove those concerns.');
    const preview = createMaskPreview(candidate);
    if (!preview.validation.passedKnownPatterns || preview.replacements.length) return fail('incomplete-masking', 'This suggestion did not pass all available local masking checks.');
    return Object.freeze({ allowed: true, code: 'known-patterns-passed', message: 'Local known-pattern checks passed. Review the wording yourself; this is not a privacy guarantee.' });
  } catch {
    return fail('check-error', 'Local checking failed. Applying this suggestion is blocked.');
  }
}

/** Only returns a pretend model response for this exact known fictional case. */
export function loadFictionalSuggestion({ original, revision, maskedText }) {
  if (!Number.isSafeInteger(revision) || revision < 1 ||
    !((original === FICTIONAL_POST && maskedText === FICTIONAL_MASKED) ||
      (original === MULTI_FINDING_POST && maskedText === MULTI_FINDING_MASKED))) {
    return Object.freeze({ valid: false, code: 'demo-only-fixed-fictional-input' });
  }
  const isMulti = original === MULTI_FINDING_POST;
  const envelope = {
    schemaVersion: 1,
    postRevision: revision,
    analyzedMaskedText: maskedText,
    findings: isMulti ? [
      {category: 'contact', sourceQuote: '[PHONE_1]',
        explanation: 'Sharing a phone number publicly may invite unwanted contact.',
        suggestedReplacement: 'Please send me a private message.'},
      {category: 'location', sourceQuote: '[ADDRESS_1]',
        explanation: 'A street address could reveal a private location.',
        suggestedReplacement: 'Please contact me privately for location details.'}
    ] : [{
      category: 'contact', sourceQuote: '[PHONE_1]',
      explanation: 'Sharing direct contact information in a public post can invite unwanted messages.',
      suggestedReplacement: 'Invite readers to contact you privately instead.'
    }],
    suggestedPost: SAMPLE_REPLACEMENT
  };
  return validateAIResponse(JSON.stringify(envelope), { expectedRevision: revision, expectedMaskedText: maskedText });
}

/** Validating against both exact source content and revision prevents stale application. */
export function approveManualApplication({ original, currentRevision, sourceText, sourceRevision, candidate }) {
  if (!Number.isSafeInteger(currentRevision) || currentRevision < 1 || currentRevision !== sourceRevision || original !== sourceText) {
    return fail('outdated-suggestion', 'Your post changed. Load a fresh fictional suggestion for the current version.');
  }
  const inspection = inspectEditedSuggestion(candidate);
  if (!inspection.allowed) return inspection;
  return Object.freeze({ allowed: true, code: 'explicit-apply-eligible', text: candidate });
}

/** Undo only the immediately applied, unedited version. No browser persistence. */
export function restoreAppliedSuggestion({ currentText, currentRevision, snapshot }) {
  if (!snapshot || typeof snapshot.previousText !== 'string' || typeof snapshot.appliedText !== 'string'
    || !Number.isSafeInteger(snapshot.appliedRevision) || currentText !== snapshot.appliedText
    || currentRevision !== snapshot.appliedRevision) {
    return fail('undo-expired', 'Undo is no longer available because the applied draft has changed.');
  }
  return Object.freeze({ allowed: true, code: 'undo-ready', text: snapshot.previousText });
}
