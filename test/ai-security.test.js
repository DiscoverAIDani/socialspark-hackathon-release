import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMaskedRequest } from '../security/ai-request-validation.mjs';
import { createUsageGuard } from '../security/usage-guard.mjs';

const masked = (maskedText, extras = {}) => ({ maskedText, currentRevision: 4, approvedRevision: 4, maskValidated: true, explicitConsent: true, ...extras });
test('offline preflight accepts only test-friendly masked text (not permission to send)', () => {
  assert.deepEqual(inspectMaskedRequest(masked('Call me at [PHONE_1].')), {ok: true, reason: 'known-pattern-preflight-only'});
});
test('offline preflight rejects originals even when client claims masking complete', () => {
  assert.equal(inspectMaskedRequest(masked('Call me at 916-555-0198.')).ok, false);
});
test('offline preflight rejects unmasked bank and location disclosures', () => {
  assert.equal(inspectMaskedRequest(masked('My bank account number is 123456789012.')).ok, false);
  assert.equal(inspectMaskedRequest(masked("We're leaving Friday and our house will be empty all week.")).ok, false);
});
test('offline preflight rejects unsupported languages and hidden Unicode', () => {
  assert.equal(inspectMaskedRequest(masked('Mañana salimos de vacaciones durante una semana.')).ok, false);
  assert.equal(inspectMaskedRequest(masked('Call me at 916-555-0\u200B198.')).ok, false);
});
test('offline preflight rejects unreviewed links and invalid placeholders', () => {
  assert.equal(inspectMaskedRequest(masked('See https://example.org/private?secret=1')).reason, 'unreviewed-link');
  assert.equal(inspectMaskedRequest(masked('Call me at [WHATEVER_1].')).reason, 'invalid-placeholder');
  assert.equal(inspectMaskedRequest(masked('Contact [PHONE_1] [oops')).reason, 'invalid-placeholder');
});
test('offline preflight rejects raw post properties and extra data', () => {
  assert.equal(inspectMaskedRequest({...masked('Call me at [PHONE_1].'), originalPost:'PRIVATE'}).reason, 'unexpected-field');
  assert.equal(inspectMaskedRequest({...masked('Call me at [PHONE_1].'), ip:'192.0.2.1'}).reason, 'unexpected-field');
});
test('offline preflight requires explicit up-to-date approval', () => {
  assert.equal(inspectMaskedRequest(masked('Call me at [PHONE_1].', {explicitConsent:false})).reason, 'missing-validation-or-consent');
  assert.equal(inspectMaskedRequest(masked('Call me at [PHONE_1].', {approvedRevision:3})).reason, 'stale-revision');
  assert.equal(inspectMaskedRequest(masked('Call me at [PHONE_1].', {maskValidated:false})).reason, 'missing-validation-or-consent');
});
test('offline preflight fails safely for malformed and oversized content', () => {
  assert.equal(inspectMaskedRequest(null).ok, false);
  assert.equal(inspectMaskedRequest(masked('x'.repeat(6001))).reason, 'invalid-length');
  assert.equal(inspectMaskedRequest(masked('')).reason, 'invalid-length');
  assert.equal(inspectMaskedRequest(masked('a\0b')).reason, 'unexpected-control-character');
});
test('default global cap refuses every request; no credits can be used', () => {
  const gate = createUsageGuard();
  assert.equal(gate.reserve(1).allowed, false);
  assert.deepEqual(gate.usageSnapshot(), {count:0, reservedCents:0});
});
test('offline cap simulates hourly and daily ceiling without identifiers', () => {
  let time = Date.UTC(2026, 9, 16, 1);
  const gate = createUsageGuard({hourlyRequestCap:2, dailyBudgetCents:5, now:()=>time});
  assert.equal(gate.reserve(2).allowed,true);
  assert.equal(gate.reserve(2).allowed,true);
  assert.equal(gate.reserve(1).reason,'hourly-limit');
  time += 3_600_000;
  assert.equal(gate.reserve(2).reason,'daily-spending-cap');
  assert.equal(gate.reserve(1).allowed,true);
  assert.equal(gate.reserve(1).reason,'daily-spending-cap');
  time += 24*3_600_000;
  assert.equal(gate.reserve(1).allowed,true);
});
test('offline cap rejects invalid estimates/configurations', () => {
  assert.throws(()=> createUsageGuard({dailyBudgetCents:-1}), TypeError);
  assert.equal(createUsageGuard({hourlyRequestCap:1,dailyBudgetCents:5}).reserve(-1).allowed,false);
});
