import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const section = (start,end) => script.slice(script.indexOf(start),script.indexOf(end));

test('separate in-page review displays exact before and after without editing the original', () => {
  for(const id of ['apply-confirmation','apply-original-text','apply-proposed-text','apply-acknowledgment','confirm-apply-button','cancel-apply']) assert.match(html,new RegExp(`id="${id}"`));
  assert.match(html, /id="apply-confirmation"[^>]* hidden/);
  assert.match(html, /id="confirm-apply-button" disabled/);
  const firstClick = section("applySuggestion.addEventListener('click'", "applyAcknowledgment.addEventListener('change'");
  assert.match(firstClick, /pendingApply = \{ sourceRevision: revision, sourceText: draft\.value, candidate: result\.text \}/);
  assert.match(firstClick, /applyOriginalText\.textContent = pendingApply\.sourceText/);
  assert.match(firstClick, /applyProposedText\.textContent = pendingApply\.candidate/);
  assert.match(firstClick, /applyConfirmation\.hidden = false/);
  assert.doesNotMatch(firstClick, /draft\.value\s*=/);
  assert.doesNotMatch(firstClick, /edited\(\)/);
});

test('final apply requires acknowledgment tied to a current, unchanged revision and candidate', () => {
  const confirm = section("confirmApply.addEventListener('click'", "undoButton.addEventListener('click'");
  assert.match(confirm,/applyConfirmation\.hidden \|\| !applyAcknowledgment\.checked \|\| !pendingApply/);
  assert.match(confirm,/confirmApply\.disabled/);
  assert.match(confirm,/approveManualApplication/);
  assert.match(confirm,/editedSuggestion\.value !== pending\.candidate/);
  assert.match(confirm,/draft\.value = result\.text/);
  assert.match(confirm,/edited\(\); \/\/ Re-run checks/);
});

test('cancel, suggestion edits, and new drafts all invalidate the pending confirmation', () => {
  const cancel = section("cancelApply.addEventListener('click'", "confirmApply.addEventListener('click'");
  const candidateEdit = section("editedSuggestion.addEventListener('input'", "discardSuggestion.addEventListener('click'");
  const forget = section('function forgetSuggestion()', 'function updateCopyAvailability()');
  assert.match(cancel, /cancelPendingApply\(\)/);
  assert.match(candidateEdit, /cancelPendingApply\(\)/);
  assert.match(forget, /cancelPendingApply\(\)/);
  assert.match(script,/function cancelPendingApply\(\) \{/);
  assert.match(script,/applyAcknowledgment\.checked = false/);
  assert.match(script,/confirmApply\.disabled = true/);
});
