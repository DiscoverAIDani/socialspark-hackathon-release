import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

test('clear control declares the confirmation dialog', () => {
  assert.match(html, /id="clear"[^>]+aria-haspopup="dialog"[^>]+aria-controls="confirm-clear"/);
  assert.match(html, /<dialog id="confirm-clear" aria-labelledby="clear-title" aria-describedby="clear-description">/);
});
test('clear dialog describes effects on local state and irreversible clearing', () => {
  assert.match(html, /Clearing permanently removes this draft, its local privacy results/);
  assert.match(html, /This cannot be undone/);
});
test('clear dialog warns that the OS clipboard is not erased', () => {
  assert.match(html, /will not erase text you previously copied to your device clipboard/);
});
test('dialog starts focused on nondestructive Keep draft', () => {
  assert.match(app, /clearDialog\.showModal\(\);\s*cancelClearButton\.focus\(\)/);
  assert.match(html, /id="cancel-clear"[^>]*>Keep draft<\/button>/);
});
test('both dialog choices are explicit non-submit buttons', () => {
  assert.match(html, /type="button" id="cancel-clear"/);
  assert.match(html, /type="button" id="confirm-clear-button">Yes, clear my draft/);
});
test('cancel action only closes dialog and does not clear or edit', () => {
  assert.match(app, /cancelClearButton\.addEventListener\('click', \(\) => clearDialog\.close\(\)\)/);
});
test('Escape uses native cancel semantics and preserves draft', () => {
  assert.match(app, /clearDialog\.addEventListener\('close', \(\) => \{/);
  assert.match(app, /if \(!clearWasConfirmed\) \{\s*clearFeedback\.textContent = 'Clear canceled\. Your draft is unchanged\.'/);
  assert.doesNotMatch(app, /clearDialog\.addEventListener\('cancel',[^\n]*preventDefault/);
});
test('confirmation is guarded by an open dialog and a non-empty draft', () => {
  assert.match(app, /confirmClearButton\.addEventListener\('click', \(\) => \{\s*if \(!clearDialog\.open \|\| !draft\.value\) return/);
});
test('confirmed clearing invokes full edit invalidation and focuses editor', () => {
  assert.match(app, /clearWasConfirmed = true;\s*draft\.value = '';\s*clearDialog\.close\(\);\s*edited\(\)/);
  assert.match(app, /clearFeedback\.textContent = 'Draft cleared\. Local review state and acknowledgments reset\.';\s*draft\.focus\(\)/);
});
test('editing resets local consent and any transient suggestion/Undo state', () => {
  assert.match(app, /function edited\(\{ preserveUndo = false \} = \{\}\) \{\s*forgetSuggestion\(\)/);
  assert.match(app, /if \(!preserveUndo\) undoSnapshot = null/);
  assert.match(app, /acknowledge\.checked = false;/);
  assert.match(app, /aiDemoCheck\.checked = false;/);
  assert.match(app, /fallbackText\.value = '';/);
});
test('clear feedback is a generic live status and never echoes the post', () => {
  assert.match(html, /id="clear-feedback" class="feedback" role="status" aria-live="polite"/);
  assert.doesNotMatch(app, /clearFeedback\.textContent\s*=\s*draft\.value/);
});
test('offline restrictions are preserved', () => {
  assert.match(html, /id="ai-request" type="button" disabled/);
  assert.doesNotMatch(app, /\bfetch\s*\(|\bXMLHttpRequest\b|localStorage|sessionStorage/);
});
