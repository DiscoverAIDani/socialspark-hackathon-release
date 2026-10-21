import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');

const editBody = app.match(/function edited\(\{ preserveUndo = false \} = \{\}\) \{([\s\S]*?)\n\}\n\ndraft\.addEventListener/);

test('editing clears previous fictional suggestion status so it cannot describe outdated findings', () => {
  assert.ok(editBody, 'Expected to find the edit/reset handler');
  assert.match(editBody[1], /forgetSuggestion\(\);\s*[\s\S]*?suggestionMessage\.textContent = '';/);
});

test('editing clears obsolete Undo status feedback', () => {
  assert.ok(editBody, 'Expected to find the edit/reset handler');
  assert.match(editBody[1], /undoMessage\.textContent = '';/);
});

test('confirmed Clear calls the same edit/reset handler; cancel does not', () => {
  assert.match(app, /confirmClearButton\.addEventListener\('click', \(\) => \{[\s\S]*?draft\.value = '';\s*clearDialog\.close\(\);\s*edited\(\)/);
  assert.match(app, /cancelClearButton\.addEventListener\('click', \(\) => clearDialog\.close\(\)\)/);
});
