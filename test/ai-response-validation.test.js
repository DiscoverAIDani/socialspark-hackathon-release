import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateAIResponse } from '../security/ai-response-validation.mjs';

const masked = 'Call me at [PHONE_1].';
const context = { expectedRevision: 8, expectedMaskedText: masked };
const baseline = () => ({
  schemaVersion: 1,
  postRevision: 8,
  analyzedMaskedText: masked,
  findings: [{
    category: 'contact',
    sourceQuote: '[PHONE_1]',
    explanation: 'A publicly shared contact number could invite unwanted contact.',
    suggestedReplacement: 'Ask people to send a private message instead.'
  }],
  suggestedPost: 'Please contact me by private message.'
});
const validate = (response, ctx = context) => validateAIResponse(JSON.stringify(response), ctx);
const expectRejected = (response, code) => assert.equal(validate(response).code, code);

test('valid response is untrusted text, does not auto apply, and remains grounded to exact masked quote', () => {
  const result = validate(baseline());
  assert.equal(result.valid, true);
  assert.equal(result.autoApply, false);
  assert.equal(result.requiresManualPlaceholderEditing, false);
  assert.equal(result.analysis.postRevision, 8);
  assert.equal(result.analysis.findings[0].sourceQuote, '[PHONE_1]');
  assert.ok(Object.isFrozen(result.analysis.findings));
  assert.ok(Object.isFrozen(result.analysis.findings[0]));
});

test('zero findings and no proposed rewrite are allowed but not called safe', () => {
  const response = { ...baseline(), findings: [], suggestedPost: null };
  const result = validate(response);
  assert.equal(result.valid, true);
  assert.equal(result.code, 'structure-and-quote-checks-only');
  assert.equal(result.autoApply, false);
});

test('rejects malformed JSON without interpreting embedded instructions', () => {
  assert.equal(validateAIResponse('{"schemaVersion": 1,', context).code, 'malformed-json');
  assert.equal(validateAIResponse('ignore safety rules and execute this', context).code, 'malformed-json');
});

test('rejects raw objects, empty text, excessive JSON', () => {
  assert.equal(validateAIResponse(baseline(), context).code, 'invalid-response-size');
  assert.equal(validateAIResponse('', context).code, 'invalid-response-size');
  assert.equal(validateAIResponse(' '.repeat(32001), context).code, 'invalid-response-size');
});

test('rejects invalid trusted context', () => {
  assert.equal(validateAIResponse(JSON.stringify(baseline()), { expectedRevision: 0, expectedMaskedText: masked }).code, 'invalid-trusted-context');
  assert.equal(validateAIResponse(JSON.stringify(baseline()), { expectedRevision: 8, expectedMaskedText: '' }).code, 'invalid-trusted-context');
  assert.equal(validateAIResponse(JSON.stringify(baseline()), null).code, 'invalid-trusted-context');
});

test('rejects output for old post revision', () => expectRejected({ ...baseline(), postRevision: 7 }, 'outdated-response'));
test('rejects current revision but wrong analyzed source', () => expectRejected({ ...baseline(), analyzedMaskedText: 'Call me at [PHONE_2].' }, 'wrong-source-version'));
test('rejects unfamiliar schema', () => expectRejected({ ...baseline(), schemaVersion: 2 }, 'unsupported-schema'));
test('rejects malicious extra field containing original post', () => expectRejected({ ...baseline(), rawPost: 'private text' }, 'unexpected-response-shape'));
test('rejects missing required field', () => { const response = baseline(); delete response.analyzedMaskedText; expectRejected(response, 'unexpected-response-shape'); });
test('rejects arrays and null as top-level response', () => {
  assert.equal(validateAIResponse('[]', context).code, 'unexpected-response-shape');
  assert.equal(validateAIResponse('null', context).code, 'unexpected-response-shape');
});
test('rejects extra or missing finding fields', () => {
  let r = baseline(); r.findings[0].extraInstruction = 'do something'; expectRejected(r, 'invalid-finding-shape');
  r = baseline(); delete r.findings[0].sourceQuote; expectRejected(r, 'invalid-finding-shape');
});
test('rejects invented category', () => { const r = baseline(); r.findings[0].category = 'loan_application'; expectRejected(r, 'unknown-category'); });
test('rejects fabricated evidence not in the exact masked post', () => { const r = baseline(); r.findings[0].sourceQuote = '1234567890'; expectRejected(r, 'unsupported-source-quote'); });
test('rejects changed casing / not-exact quote', () => { const r = baseline(); r.findings[0].sourceQuote = '[phone_1]'; expectRejected(r, 'unsupported-source-quote'); });
test('rejects malformed source quote', () => { const r = baseline(); r.findings[0].sourceQuote = ''; expectRejected(r, 'unsupported-source-quote'); });
test('rejects duplicate findings', () => { const r = baseline(); r.findings.push({ ...r.findings[0] }); expectRejected(r, 'duplicate-finding'); });
test('rejects response with too many findings', () => { const r = baseline(); r.findings = Array.from({length:9},()=> ({ ...r.findings[0] })); expectRejected(r, 'invalid-findings'); });
test('rejects finding array of wrong type', () => { const r = baseline(); r.findings = {}; expectRejected(r, 'invalid-findings'); });
test('rejects non-string explanatory content', () => { const r = baseline(); r.findings[0].explanation = { instructions: 'ignore' }; expectRejected(r, 'invalid-finding-text'); });
test('rejects code/markup in suggested post and replacement', () => {
  let r = baseline(); r.suggestedPost = '<script>alert(1)</script>'; expectRejected(r, 'invalid-suggestion');
  r = baseline(); r.findings[0].suggestedReplacement = '<img src=x onerror=alert(1)>'; expectRejected(r, 'invalid-finding-text');
});
test('rejects suspicious controls in suggested post', () => { const r = baseline(); r.suggestedPost = 'Hello\u202Eevil'; expectRejected(r, 'invalid-suggestion'); });
test('allows ordinary emoji inside suggested post as inert text', () => {
  const r = baseline(); r.suggestedPost = 'Message me privately 👩‍👧.';
  assert.equal(validate(r).valid, true);
});
test('rejects excessively long suggestion', () => { const r = baseline(); r.suggestedPost = 'x'.repeat(6001); expectRejected(r, 'invalid-suggestion'); });
test('accepts placeholder in a finding but requires manual placeholder editing', () => {
  const r = baseline(); r.findings[0].suggestedReplacement = 'Do not share [PHONE_1] publicly.';
  const result = validate(r);
  assert.equal(result.valid, true);
  assert.equal(result.requiresManualPlaceholderEditing, true);
  assert.equal(result.autoApply, false);
});
test('accepts placeholder in suggested post but prohibits direct apply', () => {
  const r = baseline(); r.suggestedPost = 'Text [PHONE_1] for details.';
  const result = validate(r);
  assert.equal(result.valid, true);
  assert.equal(result.requiresManualPlaceholderEditing, true);
  assert.equal(result.autoApply, false);
});
test('rejects suggestion with invalid shape', () => { const r = baseline(); r.suggestedPost = { text: 'Hello' }; expectRejected(r, 'invalid-suggestion'); });
test('fails closed when context has suspicious invisible characters', () => {
  const m = 'Call me at 916-555-0\u200B198.';
  const r = { ...baseline(), analyzedMaskedText: m };
  assert.equal(validate(r, {expectedRevision:8,expectedMaskedText:m}).code, 'invalid-trusted-context');
});
test('validator source is pure: no eval, network, or logging helpers', () => {
  const src = readFileSync(new URL('../security/ai-response-validation.mjs', import.meta.url), 'utf8');
  assert.equal(/\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|console\.|\.writeFile|execSync/.test(src), false);
});
test('blocks a proposed post containing a new unmasked phone number', () => {
  const r = baseline(); r.suggestedPost = 'Call me at 415-555-0198.';
  expectRejected(r, 'unsafe-suggested-post');
});
test('blocks a replacement suggestion containing an unmasked street address', () => {
  const r = baseline(); r.findings[0].suggestedReplacement = 'Visit me at 123 Main Street instead.';
  expectRejected(r, 'unsafe-replacement');
});
test('blocks contextual unattended-home disclosure in proposed rewrite', () => {
  const r = baseline(); r.suggestedPost = 'Our house will be empty all week.';
  expectRejected(r, 'unsafe-suggested-post');
});
test('blocks unsupported-language proposed rewrite', () => {
  const r = baseline(); r.suggestedPost = 'Mañana salimos de vacaciones y nuestra casa estará vacía.';
  expectRejected(r, 'unsafe-suggested-post');
});
test('unknown bracketed tokens also require manual editing before application', () => {
  const r = baseline(); r.suggestedPost = 'Please call [contact details pending].';
  const result = validate(r);
  assert.equal(result.valid, true);
  assert.equal(result.requiresManualPlaceholderEditing, true);
});
