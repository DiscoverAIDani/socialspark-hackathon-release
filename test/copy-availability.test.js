import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getCopyAvailability } from '../public/copy-availability.js';

const gate = (text = '', review = { complete: true, concerns: false }, acknowledged = false,
  reviewRevision = 4, currentRevision = 4) =>
  getCopyAvailability({ text, review, acknowledged, reviewRevision, currentRevision });

test('empty draft cannot be copied even when acknowledgment was previously checked', () => {
  const g = gate('', { complete: true, concerns: false }, true);
  assert.equal(g.enabled, false);
  assert.equal(g.code, 'empty');
});
test('draft without a current review is blocked even when acknowledged', () => {
  assert.equal(gate('Fictional content', null, true).code, 'unchecked');
  assert.equal(gate('Fictional content', { complete: true, concerns: false }, true, 3, 4).enabled, false);
});
test('limited review prevents copying without acknowledgment', () => {
  const g = gate('Fictional content', { complete: false, concerns: true });
  assert.equal(g.enabled, false);
  assert.equal(g.code, 'acknowledgment-required');
  assert.match(g.explanation, /Section 02/);
});
test('flagged findings prevent copying until acknowledged', () => {
  const g = gate('Call me at 916-555-0198.', { complete: true, concerns: true });
  assert.equal(g.enabled, false);
  assert.equal(g.code, 'acknowledgment-required');
});
test('acknowledgment allows exact current draft to be copied despite warnings', () => {
  const g = gate('Call me at 916-555-0198.', { complete: true, concerns: true }, true);
  assert.equal(g.enabled, true);
  assert.equal(g.code, 'acknowledged');
  assert.match(g.explanation, /unresolved privacy concerns/);
});
test('incomplete review remains copyable only with explicit acknowledgment', () => {
  const g = gate('Fictional content', { complete: false, concerns: true }, true);
  assert.equal(g.enabled, true);
  assert.equal(g.code, 'acknowledged');
});
test('unflagged fully reviewed draft enables copy without consent', () => {
  const g = gate('A fictional greeting.', { complete: true, concerns: false });
  assert.equal(g.enabled, true);
  assert.equal(g.code, 'ready');
  assert.match(g.explanation, /not a privacy guarantee/);
});
test('status explanations do not echo the draft or expose identifying values', () => {
  const source = '916-555-0198 Private fictional message';
  for (const check of [null, { complete: false, concerns: true }, { complete: true, concerns: true }, { complete: true, concerns: false }]) {
    for (const ack of [false, true]) {
      const g = gate(source, check, ack);
      assert.doesNotMatch(g.explanation, /916-555-0198|Private fictional message/);
    }
  }
});
test('copy status is tied to the button and app still uses exact draft clipboard write', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="copy" aria-describedby="copy-availability" disabled/);
  assert.match(html, /id="copy-availability"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.match(app, /const state = getCopyAvailability\(/);
  assert.match(app, /const text = draft\.value; \/\/ Exactly the current editor value\./);
  assert.match(app, /navigator\.clipboard\.writeText\(text\)/);
  assert.doesNotMatch(app, /fetch\s*\(|XMLHttpRequest|localStorage|sessionStorage/);
});
