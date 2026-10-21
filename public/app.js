/** SocialSpark — local-only development UI. No AI and no network requests. */
import { reviewText, CATEGORIES } from './privacy.js';
import { createMaskPreview } from './masking.js';
import { revealHiddenCharacters, removeFlaggedHiddenCharacters } from './text-integrity.js';
import { loadFictionalSuggestion, inspectEditedSuggestion, approveManualApplication, restoreAppliedSuggestion } from './suggestion-workflow.js';
import { getDemoAvailability } from './demo-availability.js';
import { getCopyAvailability } from './copy-availability.js';

const $ = id => document.getElementById(id);
const draft = $('draft');
const counter = $('counter');
const clearButton = $('clear');
const clearDialog = $('confirm-clear');
const cancelClearButton = $('cancel-clear');
const confirmClearButton = $('confirm-clear-button');
const clearFeedback = $('clear-feedback');
const copyButton = $('copy');
const copyAvailability = $('copy-availability');
const copyMessage = $('copy-message');
const manualCopy = $('manual-copy');
const fallbackText = $('copy-fallback');
const checkStatus = $('check-status');
const reviewStatus = $('review-status');
const checksList = $('checks');
const findingsArea = $('findings');
const limitationsArea = $('limitations');
const warningArea = $('warning-area');
const removeHidden = $('remove-hidden');
const hiddenInspector = $('hidden-inspector');
const hiddenRevealed = $('hidden-revealed');
const hiddenList = $('hidden-list');
const acknowledge = $('acknowledge');
const previewArea = $('mask-preview');
const previewText = $('masked-text');
const maskStatus = $('mask-status');
const maskInfo = $('mask-info');
const aiConsentArea = $('ai-consent-preview');
const aiExactText = $('ai-exact-text');
const aiDemoCheck = $('ai-demo-check');
const aiDemoStatus = $('ai-demo-status');
const demoLoad = $('load-suggestion');
const demoAvailability = $('demo-availability');
const suggestionReviewTitle = $('suggestion-review-title');
const suggestionReview = $('suggestion-review');
const suggestedFindings = $('suggestion-findings');
const editedSuggestion = $('edited-suggestion');
const suggestionCheck = $('suggestion-check');
const discardSuggestion = $('discard-suggestion');
const applySuggestion = $('apply-suggestion');
const suggestionMessage = $('suggestion-message');
const undoArea = $('undo-area');
const undoMessage = $('undo-message');
const undoButton = $('undo-suggestion');
const applyConfirmation = $('apply-confirmation');
const applyConfirmationTitle = $('apply-confirmation-title');
const applyOriginalText = $('apply-original-text');
const applyProposedText = $('apply-proposed-text');
const applyAcknowledgment = $('apply-acknowledgment');
const cancelApply = $('cancel-apply');
const confirmApply = $('confirm-apply-button');

let revision = 0;
let latestReview = null;
let reviewedSuggestion = null;
let undoSnapshot = null;
let pendingApply = null;
let clearWasConfirmed = false;

function textElement(tag, value, className = '') {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}

function renderResults() {
  const text = draft.value;
  const hasDraft = text.length > 0;
  counter.textContent = `${text.length.toLocaleString('en-US')} / 6,000 characters`;
  clearButton.disabled = !hasDraft;
  checksList.replaceChildren();
  findingsArea.replaceChildren();
  limitationsArea.replaceChildren();
  warningArea.hidden = true;
  removeHidden.hidden = true;
  hiddenInspector.hidden = true;
  hiddenRevealed.textContent = '';
  hiddenList.replaceChildren();
  aiConsentArea.hidden = !hasDraft;
  aiDemoCheck.disabled = true;
  aiExactText.value = '';
  aiDemoStatus.textContent = '';
  previewText.value = '';
  previewArea.hidden = !hasDraft;
  maskStatus.className = 'status warning'; // Only actual privacy-blocking failures use dark red.
  maskStatus.textContent = hasDraft ? 'Preparing preview' : 'No draft';
  maskInfo.textContent = '';
  checkStatus.className = 'status';
  reviewStatus.className = 'status';

  if (!hasDraft) {
    latestReview = null;
    checkStatus.textContent = 'Waiting for text';
    reviewStatus.textContent = 'Ready';
    for (const category of CATEGORIES) checksList.appendChild(textElement('li', `${category.name} — waiting`));
    updateCopyAvailability();
    return;
  }

  // Synchronous local checks: every result is for the exact current text.
  try {
    latestReview = { revision, result: reviewText(text) };
  } catch {
    latestReview = { revision, result: { complete: false, findings: [], limitations: ['One or more local checks could not complete. The privacy review is incomplete.'], hiddenCharacters: [], concerns: true, status: 'limited', checks: CATEGORIES.map(c => ({ ...c, completed: false, concernCount: 0 })) } };
  }
  const result = latestReview.result;
  try {
    const preview = createMaskPreview(text);
    previewText.value = preview.maskedText;
    const count = preview.replacements.length;
    if (preview.validation.passedKnownPatterns) {
      maskStatus.textContent = 'Known-pattern check passed';
      maskInfo.textContent = `${count} ${count === 1 ? "field" : "fields"} masked locally. Check every word yourself: this preview is NOT verified safe to send. No AI request is available.`;
    } else {
      maskStatus.textContent = 'AI scan blocked by local review';
      maskStatus.className = 'status concerns';
      maskInfo.textContent = `Do not send this preview for AI analysis: ${preview.validation.issues.join(' ')} You may still edit your draft and use the normal copy safeguards. No AI request is available.`;
    }
    // Re-display only the exact masked bytes; this never grants permission to send.
    aiExactText.value = preview.maskedText;
    aiDemoCheck.disabled = !preview.validation.passedKnownPatterns || !result.complete;
    aiDemoStatus.textContent = aiDemoCheck.disabled
      ? 'Local preview is not eligible for the consent demonstration. Resolve masking or coverage warnings first. AI remains disabled.'
      : 'You can try the local acknowledgment checkbox. This is NOT consent for a scan. AI remains disabled.';
    // Discard transient mappings after generating the user-visible preview.
    preview.privateMappings.length = 0;
  } catch {
    previewText.value = '';
    maskStatus.textContent = 'Preview unavailable';
    maskStatus.className = 'status concerns';
    maskInfo.textContent = 'The local mask preview failed and must not be sent to any AI service.';
    aiDemoStatus.textContent = 'Masking failed. The consent demonstration is unavailable. No AI request can be made.';
  }
  for (const check of result.checks) {
    const label = check.completed ? (check.concernCount ? `${check.concernCount} potential concern(s)` : 'checked') : 'limited coverage';
    const node = textElement('li', `${check.name} — ${label}`, check.completed ? (check.concernCount ? 'concern' : '') : 'limited');
    checksList.appendChild(node);
  }
  if (result.complete && !result.concerns) {
    checkStatus.textContent = 'No Privacy Concerns Detected';
    checkStatus.classList.add('clear');
    reviewStatus.textContent = 'Checks complete';
    reviewStatus.classList.add('clear');
  } else {
    const limited = !result.complete;
    checkStatus.textContent = limited ? 'Limited coverage' : 'Concerns detected';
    checkStatus.classList.add('concerns');
    reviewStatus.textContent = limited ? 'Incomplete review' : 'Review warnings';
    reviewStatus.classList.add('concerns');
    warningArea.hidden = false;
    for (const finding of result.findings) {
      const card = document.createElement('div');
      card.className = 'finding';
      card.appendChild(textElement('h4', finding.title));
      if (finding.sourceQuote) card.appendChild(textElement('p', `Found in your text: “${finding.sourceQuote}”`, 'evidence'));
      card.appendChild(textElement('p', finding.explanation));
      card.appendChild(textElement('p', `Consider: ${finding.suggestion}`));
      findingsArea.appendChild(card);
    }
    for (const note of result.limitations) limitationsArea.appendChild(textElement('p', note, 'limitation'));
    if (!result.complete) limitationsArea.appendChild(textElement('p', 'Some language-specific privacy concerns may have been missed.', 'limitation'));
    if (result.hiddenCharacters.length) {
      const characters = result.hiddenCharacters.map(x => `${x.codePoint} near character ${x.position}`).join(', ');
      limitationsArea.appendChild(textElement('p', `Hidden-character locations: ${characters}.`, 'limitation'));
      hiddenInspector.hidden = false;
      hiddenRevealed.textContent = revealHiddenCharacters(text, result.hiddenCharacters);
      for (const character of result.hiddenCharacters) {
        hiddenList.appendChild(textElement('li', `${character.label} (${character.codePoint}) at character position ${character.position}`));
      }
      removeHidden.hidden = false;
    }
  }
  updateCopyAvailability();
}

function renderSuggestionUI() {
  const demoGate = getDemoAvailability({ original: draft.value, review: latestReview?.result,
    reviewRevision: latestReview?.revision, currentRevision: revision });
  demoLoad.disabled = !demoGate.enabled;
  if (demoAvailability.textContent !== demoGate.explanation) demoAvailability.textContent = demoGate.explanation;
  suggestionReview.hidden = !reviewedSuggestion;
  demoLoad.setAttribute('aria-expanded', String(Boolean(reviewedSuggestion)));
  undoArea.hidden = !undoSnapshot;
  if (!reviewedSuggestion) {
    applySuggestion.disabled = true;
    return;
  }
  const current = reviewedSuggestion.sourceRevision === revision && reviewedSuggestion.sourceText === draft.value;
  const inspected = current ? inspectEditedSuggestion(editedSuggestion.value)
    : { allowed: false, message: 'This suggestion is outdated. Load a new one for the current post.' };
  applySuggestion.disabled = !inspected.allowed || Boolean(pendingApply);
  suggestionCheck.textContent = inspected.message;
}

function cancelPendingApply() {
  pendingApply = null;
  applyConfirmation.hidden = true;
  applyAcknowledgment.checked = false;
  confirmApply.disabled = true;
  applyOriginalText.textContent = '';
  applyProposedText.textContent = '';
}

function forgetSuggestion() {
  reviewedSuggestion = null;
  cancelPendingApply();
  editedSuggestion.value = '';
  suggestedFindings.replaceChildren();
}

function updateCopyAvailability() {
  const state = getCopyAvailability({ text: draft.value, review: latestReview?.result,
    reviewRevision: latestReview?.revision, currentRevision: revision, acknowledged: acknowledge.checked });
  copyButton.disabled = !state.enabled;
  if (copyAvailability.textContent !== state.explanation) copyAvailability.textContent = state.explanation;
}

function edited({ preserveUndo = false } = {}) {
  forgetSuggestion();
  // Previous review feedback belongs to the old draft. Never show a stale
  // "Loaded N fictional finding(s)" message after an edit or confirmed clear.
  suggestionMessage.textContent = '';
  undoMessage.textContent = '';
  if (!preserveUndo) undoSnapshot = null;
  revision += 1;
  latestReview = null;
  acknowledge.checked = false;
  aiDemoCheck.checked = false;
  copyButton.disabled = true;
  copyMessage.textContent = '';
  clearFeedback.textContent = '';
  manualCopy.hidden = true;
  fallbackText.value = '';
  renderResults();
  renderSuggestionUI();
}

draft.addEventListener('input', () => edited());
acknowledge.addEventListener('change', updateCopyAvailability);
aiDemoCheck.addEventListener('change', () => {
  aiDemoStatus.textContent = aiDemoCheck.checked
    ? 'Preview acknowledged locally for this draft version only. No request was sent. This is not actual AI-scan consent.'
    : 'Preview acknowledgment cleared. No request was sent.';
});
removeHidden.addEventListener('click', () => {
  draft.value = removeFlaggedHiddenCharacters(draft.value);
  edited();
  draft.focus();
});
clearButton.addEventListener('click', () => {
  if (!draft.value) return;
  clearWasConfirmed = false;
  clearFeedback.textContent = '';
  clearDialog.showModal();
  cancelClearButton.focus(); // Focus the safe choice, never the destructive action.
});
cancelClearButton.addEventListener('click', () => clearDialog.close());
// Native dialog Escape closes without changing any draft, review or acknowledgment state.
clearDialog.addEventListener('close', () => {
  if (!clearWasConfirmed) {
    clearFeedback.textContent = 'Clear canceled. Your draft is unchanged.';
    clearButton.focus();
  }
  clearWasConfirmed = false;
});
confirmClearButton.addEventListener('click', () => {
  if (!clearDialog.open || !draft.value) return;
  clearWasConfirmed = true;
  draft.value = '';
  clearDialog.close();
  edited(); // Clear derived results, preview, suggestions, Undo and acknowledgments.
  clearFeedback.textContent = 'Draft cleared. Local review state and acknowledgments reset.';
  draft.focus();
});
copyButton.addEventListener('click', async () => {
  if (copyButton.disabled || latestReview?.revision !== revision) return;
  const text = draft.value; // Exactly the current editor value.
  const copiedRevision = revision;
  copyButton.disabled = true;
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard access unavailable');
    await navigator.clipboard.writeText(text);
    copyMessage.textContent = revision === copiedRevision ? 'Copied the exact current text.' : 'Your post changed while copying. Review and copy the latest version again.';
  } catch {
    if (revision === copiedRevision) {
      copyMessage.textContent = 'Automatic copying failed. Use the manual-copy field below.';
      fallbackText.value = text;
      manualCopy.hidden = false;
      fallbackText.focus();
      fallbackText.select();
    }
  } finally {
    updateCopyAvailability();
  }
});
renderResults();

// Fixed fictional example, no model call, no browser storage, no upload.
demoLoad.addEventListener('click', () => {
  const preview = createMaskPreview(draft.value);
  const result = loadFictionalSuggestion({ original: draft.value, revision, maskedText: preview.maskedText });
  if (!result.valid || !result.analysis.suggestedPost) {
    suggestionMessage.textContent = 'This fictional demonstration is available only for the exact sample. No request was made.';
    return;
  }
  undoSnapshot = null;
  reviewedSuggestion = { sourceRevision: revision, sourceText: draft.value, result };
  // All fictional findings are rendered as inert text, never HTML or scripts.
  suggestedFindings.replaceChildren();
  for (const finding of result.analysis.findings) {
    const item = document.createElement('div');
    item.className = 'demo-finding';
    item.setAttribute('role', 'listitem');
    const typeName = CATEGORIES.find(c => c.id === finding.category)?.name ?? 'Privacy concern';
    item.appendChild(textElement('h5', typeName));
    item.appendChild(textElement('p', `Masked source: “${finding.sourceQuote}”`));
    item.appendChild(textElement('p', finding.explanation));
    item.appendChild(textElement('p', `Possible alternative: ${finding.suggestedReplacement}`));
    suggestedFindings.appendChild(item);
  }
  editedSuggestion.value = result.analysis.suggestedPost;
  suggestionMessage.textContent = `Loaded ${result.analysis.findings.length} fictional finding(s). All suggestions are untrusted; no AI analyzed your post.`;
  renderSuggestionUI();
  suggestionReviewTitle.focus(); // Keyboard users can read the findings before editing.
});
editedSuggestion.addEventListener('input', () => {
  cancelPendingApply(); // A changed candidate requires an entirely new confirmation.
  suggestionMessage.textContent = '';
  renderSuggestionUI();
});
discardSuggestion.addEventListener('click', () => {
  forgetSuggestion();
  suggestionMessage.textContent = 'Suggestion discarded. Your original post is unchanged.';
  renderSuggestionUI();
  demoLoad.focus(); // The discarded controls were removed; restore keyboard focus.
});
applySuggestion.addEventListener('click', () => {
  if (!reviewedSuggestion) return;
  const result = approveManualApplication({ original: draft.value, currentRevision: revision,
    sourceText: reviewedSuggestion.sourceText, sourceRevision: reviewedSuggestion.sourceRevision,
    candidate: editedSuggestion.value });
  if (!result.allowed) {
    suggestionMessage.textContent = result.message;
    renderSuggestionUI();
    return;
  }
  pendingApply = { sourceRevision: revision, sourceText: draft.value, candidate: result.text };
  applyOriginalText.textContent = pendingApply.sourceText;
  applyProposedText.textContent = pendingApply.candidate;
  applyAcknowledgment.checked = false;
  confirmApply.disabled = true;
  applyConfirmation.hidden = false;
  applySuggestion.disabled = true;
  suggestionMessage.textContent = 'Your post is unchanged. Review the confirmation section and choose whether to replace it.';
  applyConfirmationTitle.focus(); // Announce the newly revealed comparison first.
});
applyAcknowledgment.addEventListener('change', () => {
  confirmApply.disabled = !applyAcknowledgment.checked || !pendingApply || applyConfirmation.hidden
    || revision !== pendingApply.sourceRevision || draft.value !== pendingApply.sourceText
    || editedSuggestion.value !== pendingApply.candidate;
});
cancelApply.addEventListener('click', () => {
  cancelPendingApply();
  suggestionMessage.textContent = 'Replacement canceled. Your original post was not changed.';
  renderSuggestionUI();
  applySuggestion.focus();
});
confirmApply.addEventListener('click', () => {
  // Fail closed: neither the first click nor a stale/invisible confirmation can change the post.
  if (applyConfirmation.hidden || !applyAcknowledgment.checked || !pendingApply
      || confirmApply.disabled) return;
  const pending = pendingApply;
  cancelPendingApply();
  if (!reviewedSuggestion) return;
  const result = approveManualApplication({ original: draft.value, currentRevision: revision,
    sourceText: pending.sourceText, sourceRevision: pending.sourceRevision, candidate: pending.candidate });
  if (!result.allowed || editedSuggestion.value !== pending.candidate) {
    suggestionMessage.textContent = result.allowed ? 'Suggestion changed during confirmation. Review it again.' : result.message;
    renderSuggestionUI();
    return;
  }
  const previousText = draft.value;
  draft.value = result.text;
  edited(); // Re-run checks, invalidate suggestions, reset copy and AI acknowledgment.
  undoSnapshot = { previousText, appliedText: result.text, appliedRevision: revision };
  undoMessage.textContent = 'Suggestion applied. Checks reran and acknowledgments reset. You can undo until the next edit or refresh.';
  suggestionMessage.textContent = 'The edited suggestion was applied by your explicit choice. No AI request was made.';
  renderSuggestionUI();
  undoButton.focus(); // Give keyboard users a stable control after confirmation disappears.
});
undoButton.addEventListener('click', () => {
  const result = restoreAppliedSuggestion({currentText: draft.value, currentRevision: revision, snapshot: undoSnapshot});
  if (!result.allowed) {
    undoSnapshot = null;
    suggestionMessage.textContent = result.message;
    renderSuggestionUI();
    return;
  }
  draft.value = result.text;
  edited(); // Re-check restored source, reset acknowledgments, invalidate results and undo.
  suggestionMessage.textContent = 'Previous post restored. Fresh privacy checks completed; please review the warnings again.';
  renderSuggestionUI();
  draft.focus(); // Undo is now gone; return to the restored editor.
});
renderSuggestionUI();
