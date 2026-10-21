import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getDemoAvailability } from '../public/demo-availability.js';
import { FICTIONAL_POST, MULTI_FINDING_POST } from '../public/suggestion-workflow.js';

const gate = (original, review = { complete: true }, reviewRevision = 6, currentRevision = 6) =>
  getDemoAvailability({ original, review, reviewRevision, currentRevision });

test('empty draft explains why fictional demo is unavailable', () => {
  const result = gate('');
  assert.equal(result.enabled, false);
  assert.equal(result.code, 'empty');
  assert.match(result.explanation, /exact fictional examples/);
});

test('an extra character blocks demo and explains punctuation/whitespace sensitivity', () => {
  const result = gate(MULTI_FINDING_POST + ' ');
  assert.equal(result.enabled, false);
  assert.equal(result.code, 'sample-mismatch');
  assert.match(result.explanation, /spaces, punctuation and extra characters/);
});

test('non-fictional text cannot enable the demonstration', () => {
  assert.equal(gate('Please call me tomorrow').enabled, false);
});

test('the one-finding fixture is ready when the latest privacy review completes', () => {
  const result = gate(FICTIONAL_POST);
  assert.equal(result.enabled, true);
  assert.equal(result.code, 'ready');
  assert.match(result.explanation, /1 finding\./);
});

test('the two-finding fixture is ready only with its exact bytes', () => {
  const result = gate(MULTI_FINDING_POST);
  assert.equal(result.enabled, true);
  assert.match(result.explanation, /2 findings\./);
});

test('stale revision blocks demo even if source text matches exact fixture', () => {
  assert.equal(gate(MULTI_FINDING_POST, { complete: true }, 5, 6).code, 'checks-incomplete');
});

test('incomplete or unavailable review blocks demo without leaking draft text', () => {
  assert.equal(gate(FICTIONAL_POST, null).enabled, false);
  assert.equal(gate(FICTIONAL_POST, { complete: false }).enabled, false);
  assert.doesNotMatch(gate(MULTI_FINDING_POST + ' UNEXPECTED').explanation, /UNEXPECTED/);
});

test('review and confirmation have accessible focus targets, and the demo button has an explanation', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="load-suggestion"[^>]*aria-describedby="demo-availability"[^>]*aria-controls="suggestion-review"/);
  assert.match(html, /id="demo-availability"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(html, /id="suggestion-review-title" tabindex="-1"/);
  assert.match(html, /id="apply-confirmation-title" tabindex="-1"/);
});

test('focus stays on a visible control after loading, confirmation, discard, apply and undo', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /suggestionReviewTitle\.focus\(\)/);
  assert.match(app, /applyConfirmationTitle\.focus\(\)/);
  assert.match(app, /demoLoad\.focus\(\)/);
  assert.match(app, /undoButton\.focus\(\)/);
  assert.match(app, /draft\.focus\(\)/);
  assert.match(app, /demoLoad\.setAttribute\('aria-expanded', String\(Boolean\(reviewedSuggestion\)\)\)/);
  assert.doesNotMatch(app, /\.innerHTML\s*=|\bfetch\s*\(|\bXMLHttpRequest\b|localStorage|sessionStorage/);
});
