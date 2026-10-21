import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {createMaskPreview} from '../public/masking.js';
import { reviewText } from '../public/privacy.js';
import {
  FICTIONAL_POST, FICTIONAL_MASKED, MULTI_FINDING_POST, MULTI_FINDING_MASKED,
  isFictionalDemoPost, loadFictionalSuggestion, approveManualApplication
} from '../public/suggestion-workflow.js';

const load = (original, maskedText, revision = 3) =>
  loadFictionalSuggestion({original, maskedText, revision});

test('two-finding fixture is the exact locally masked version of the original', () => {
  assert.equal(createMaskPreview(MULTI_FINDING_POST).maskedText, MULTI_FINDING_MASKED);
  const actual = reviewText(MULTI_FINDING_POST);
  assert.equal(actual.complete, true);
  assert.ok(actual.findings.some(f => f.category === 'contact'));
  assert.ok(actual.findings.some(f => f.category === 'location'));
  assert.equal(createMaskPreview(MULTI_FINDING_POST).validation.passedKnownPatterns, true);
});

test('two individually quoted fictional findings are validated and never auto-applied', () => {
  const result = load(MULTI_FINDING_POST, MULTI_FINDING_MASKED);
  assert.equal(result.valid, true);
  assert.equal(result.analysis.findings.length, 2);
  assert.deepEqual(result.analysis.findings.map(f => f.category), ['contact', 'location']);
  assert.deepEqual(result.analysis.findings.map(f => f.sourceQuote), ['[PHONE_1]', '[ADDRESS_1]']);
  assert.equal(result.autoApply, false);
  assert.equal(result.analysis.suggestedPost, 'Please contact me through a private message.');
});

test('existing single-finding demo still works, and only the two fixed fictional sources are eligible', () => {
  assert.equal(load(FICTIONAL_POST, FICTIONAL_MASKED).analysis.findings.length, 1);
  assert.equal(isFictionalDemoPost(FICTIONAL_POST), true);
  assert.equal(isFictionalDemoPost(MULTI_FINDING_POST), true);
  assert.equal(isFictionalDemoPost('Another post'), false);
});

test('wrong masked content and mismatched source/revision are rejected', () => {
  assert.equal(load(MULTI_FINDING_POST, FICTIONAL_MASKED).valid, false);
  assert.equal(load(FICTIONAL_POST, MULTI_FINDING_MASKED).valid, false);
  assert.equal(load(MULTI_FINDING_POST, MULTI_FINDING_MASKED, 0).valid, false);
  const stale = approveManualApplication({original: MULTI_FINDING_POST, sourceText: MULTI_FINDING_POST,
    currentRevision: 4, sourceRevision: 3, candidate: 'Please contact me privately.'});
  assert.equal(stale.allowed, false);
});

test('browser displays every finding as inert text, without HTML insertion or network calls', () => {
  const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(app, /for \(const finding of result\.analysis\.findings\)/);
  assert.match(app, /suggestedFindings\.appendChild\(item\)/);
  assert.match(app, /item\.appendChild\(textElement\('p', finding\.explanation\)\)/);
  assert.match(html, /id="suggestion-findings"/);
  assert.doesNotMatch(app, /\.innerHTML\s*=|\bfetch\s*\(|\bXMLHttpRequest\b|localStorage|sessionStorage/);
  const loadClick = app.slice(app.indexOf("demoLoad.addEventListener('click'"), app.indexOf("editedSuggestion.addEventListener('input'"));
  assert.doesNotMatch(loadClick, /draft\.value\s*=/);
});
