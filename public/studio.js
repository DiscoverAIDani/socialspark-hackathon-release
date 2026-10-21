/** Four simultaneous offline drafts. Studio does not save drafts; the separately opt-in scheduler stores selected reviewed copies locally. */
import { makeOfflineDrafts, PLATFORMS, TONES, validateIdea } from './platform-drafts.js';
import { reviewText } from './privacy.js';
import { createMaskPreview } from './masking.js';
import { getCopyAvailability } from './copy-availability.js';

const $ = id => document.getElementById(id);
const idea = $('studio-idea');
const tone = $('studio-tone');
const generate = $('studio-create');
const status = $('studio-status');
const reset = $('studio-reset');
const dialog = $('studio-clear-dialog');
const keep = $('studio-keep');
const clear = $('studio-clear');
const inspectAI = $('studio-inspect-ai');
const proposedAI = $('studio-ai-masked');
const aiNote = $('studio-ai-preflight-note');
const reviewedAI = $('studio-ai-reviewed');
const counter = $('studio-idea-counter');
const hub = document.querySelector('.spark-hub');

const controls = Object.fromEntries(PLATFORMS.map(p => [p.id, {
  area: $(`studio-preview-${p.id}`),
  edit: document.querySelector(`.spark-edit[data-platform="${p.id}"]`),
  copy: $(`studio-copy-${p.id}`),
  risk: $(`studio-risk-${p.id}`),
  detail: $(`studio-warnings-${p.id}`),
  riskList: $(`studio-risk-list-${p.id}`),
  ack: $(`studio-ack-${p.id}`),
  copyNote: $(`studio-copy-note-${p.id}`),
  outcome: $(`studio-outcome-${p.id}`),
  manual: $(`studio-manual-copy-${p.id}`),
  fallback: $(`studio-fallback-${p.id}`)
}]));
let drafts = null;
let generatedFor = null;
let generatedTone = null;
let revision = 0;
let changeSequence = 0; // includes edits to all cards, not just regenerated batches
const draftVersion = Object.fromEntries(PLATFORMS.map(p => [p.id, 0]));
const reviews = Object.fromEntries(PLATFORMS.map(p => [p.id, null]));

function el(tag, content, cls) {
  const element = document.createElement(tag);
  element.textContent = content;
  if (cls) element.className = cls;
  return element;
}
function isStale() {
  return Boolean(drafts && (generatedFor !== idea.value || generatedTone !== tone.value));
}
function setStatus(message) { status.textContent = message; }
function clearFeedback(id) {
  const c = controls[id];
  c.outcome.textContent = '';
  c.manual.hidden = true;
  c.fallback.value = '';
}
function resetAIReview() {
  proposedAI.value = '';
  reviewedAI.checked = false;
  reviewedAI.disabled = true;
  aiNote.textContent = 'No real Nebius AI requests are possible from this browser. Inspect the current idea to see what masking would propose.';
}
function validateOfflineSource() {
  const valid = validateIdea(idea.value);
  if (!valid.valid) return { valid:false, reason:valid.reason };
  try {
    const check = reviewText(idea.value);
    if (!check.complete) return {valid:false,reason:'Cannot create drafts from an idea with incomplete language or hidden-character checks. Please revise it.'};
    return {valid:true};
  } catch { return {valid:false,reason:'Local checks could not complete. No drafts were generated.'}; }
}
function runReview(id) {
  try { return reviewText(drafts[id]); }
  catch { return {complete:false, concerns:true, findings:[], limitations:['Privacy review could not complete.']}; }
}
function drawRisk(id, autoExpand = false) {
  const c = controls[id];
  c.riskList.replaceChildren();
  if (!drafts) {
    c.detail.open = false;
    c.detail.hidden = true;
    c.risk.className = 'spark-risk-badge';
    c.risk.textContent = 'Waiting for draft';
    return;
  }
  const result = reviews[id];
  const concerning = result.concerns || !result.complete;
  c.risk.className = concerning ? 'spark-risk-badge needs-review' : 'spark-risk-badge no-known-risk';
  c.risk.textContent = concerning
    ? `${result.findings.length} privacy concern(s) · Review`
    : 'No known patterns · Not guaranteed safe';
  c.detail.hidden = !concerning;
  if (!concerning) { c.detail.open = false; return; }
  for (const finding of result.findings) {
    const wrapper = el('div', '', 'spark-finding');
    wrapper.appendChild(el('strong', finding.title));
    wrapper.appendChild(el('p', finding.explanation));
    if (finding.sourceQuote) wrapper.appendChild(el('p', `Found in this draft: “${finding.sourceQuote}”`));
    if (finding.suggestion) wrapper.appendChild(el('p', finding.suggestion));
    c.riskList.appendChild(wrapper);
  }
  for (const limit of result.limitations || []) c.riskList.appendChild(el('p',limit,'spark-limitation'));
  if (!result.complete) c.riskList.appendChild(el('p','Checks were incomplete; other risks could be missed.','spark-limitation'));
  if (autoExpand) c.detail.open = true;
}
function refreshCopy(id) {
  const c = controls[id];
  if (!drafts) {
    c.copy.disabled = true;
    c.copyNote.textContent = '';
    return;
  }
  if (isStale()) {
    c.copy.disabled = true;
    c.copyNote.textContent = 'Idea or tone changed. Regenerate all four drafts before copying.';
    return;
  }
  const decision = getCopyAvailability({text:drafts[id], review:reviews[id], currentRevision:draftVersion[id], reviewRevision:draftVersion[id], acknowledged:c.ack.checked});
  c.copy.disabled = !decision.enabled;
  c.copyNote.textContent = decision.enabled ? '' : (decision.code === 'acknowledgment-required' ? `Copy paused: review ${PLATFORMS.find(p=>p.id===id)?.label ?? 'platform'} warnings below, then acknowledge if you choose to copy this exact draft.` : decision.explanation);
}
function renderPlatform(id, autoExpand = false) {
  const c = controls[id];
  c.area.disabled = !drafts;
  c.edit.disabled = !drafts;
  c.area.value = drafts ? drafts[id] : '';
  c.area.readOnly = true;
  c.edit.textContent = '✎ Edit draft';
  c.ack.checked = false;
  clearFeedback(id);
  reviews[id] = drafts ? runReview(id) : null;
  drawRisk(id, autoExpand);
  refreshCopy(id);
}
function updateAllAvailability() {
  for (const p of PLATFORMS) {
    controls[p.id].ack.checked = false;
    clearFeedback(p.id);
    refreshCopy(p.id);
  }
}

inspectAI.addEventListener('click', () => {
  resetAIReview();
  const valid = validateIdea(idea.value);
  if (!valid.valid) { aiNote.textContent = valid.reason; return; }
  try {
    const masked = createMaskPreview(idea.value);
    // Never display privateMappings, which contain unmasked secrets.
    proposedAI.value=masked.maskedText;
    if(!masked.validation.passedKnownPatterns) {aiNote.textContent='Masking is incomplete; nothing can be transmitted.'; return; }
    reviewedAI.disabled = false;
    aiNote.textContent = 'Limited known-pattern checks passed; anonymity is NOT guaranteed. AI remains disabled. Nothing was sent.';
  } catch { aiNote.textContent = 'Could not create a local masking preview. Nothing was sent.'; }
});
idea.addEventListener('input', () => {
  changeSequence++;
  counter.textContent = `${idea.value.length.toLocaleString()} / 1,000`;
  resetAIReview();
  if (isStale()) setStatus('Your idea changed. The existing drafts have not been replaced. Generate again to update them.');
  else setStatus(idea.value.trim() ? 'Ready to create offline examples.' : 'Enter a topic to begin.');
  updateAllAvailability();
});
tone.addEventListener('change', () => {
  changeSequence++;
  resetAIReview();
  if (isStale()) setStatus('Tone changed. Generate again to update all drafts.');
  updateAllAvailability();
});
generate.addEventListener('click', () => {
  const check = validateOfflineSource();
  if (!check.valid) { setStatus(check.reason); idea.focus(); return; }
  if (!TONES.includes(tone.value)) { setStatus('Choose a supported tone.'); return; }
  try { drafts = makeOfflineDrafts(idea.value, tone.value); }
  catch { setStatus('Could not prepare offline drafts. Please revise your idea.'); return; }
  generatedFor = idea.value;
  generatedTone = tone.value;
  revision++; changeSequence++;
  for (const p of PLATFORMS) {
    draftVersion[p.id] = revision;
    controls[p.id].detail.open = false;
    renderPlatform(p.id, Boolean(runReview(p.id).concerns));
  }
  hub.classList.remove('is-sparking');
  // Restart CSS-only visual effect without sending events/data anywhere.
  void hub.offsetWidth;
  hub.classList.add('is-sparking');
  setStatus('Four offline example drafts created. These are templates, not AI results. Review every word.');
  $('spark-facebook-title').focus();
});
for (const p of PLATFORMS) {
  const id = p.id;
  const c = controls[id];
  c.edit.addEventListener('click', () => {
    if (!drafts) return;
    c.area.readOnly = !c.area.readOnly;
    c.edit.textContent = c.area.readOnly ? '✎ Edit draft' : '✓ Done editing';
    if (!c.area.readOnly) c.area.focus();
  });
  c.area.addEventListener('input', () => {
    if (!drafts) return;
    drafts[id] = c.area.value;
    draftVersion[id]++; changeSequence++;
    c.ack.checked = false;
    clearFeedback(id);
    reviews[id] = runReview(id);
    drawRisk(id, Boolean(reviews[id].concerns));
    refreshCopy(id);
    setStatus(`${p.label} edited locally. Check this platform's privacy findings before copying.`);
  });
  c.ack.addEventListener('change', () => refreshCopy(id));
  c.copy.addEventListener('click', async () => {
    if (c.copy.disabled || !drafts || isStale()) return;
    // Snapshot and revision must remain the same before reporting a success.
    const snapshot = drafts[id];
    const atVersion = draftVersion[id];
    const state = getCopyAvailability({text:snapshot,review:reviews[id],currentRevision:atVersion,reviewRevision:atVersion,acknowledged:c.ack.checked});
    if (!state.enabled) return;
    c.copy.disabled = true;
    clearFeedback(id);
    try {
      if (!navigator.clipboard?.writeText) throw new Error('No clipboard');
      await navigator.clipboard.writeText(snapshot);
      c.outcome.textContent = drafts?.[id] === snapshot && draftVersion[id] === atVersion && !isStale()
        ? `Copied the exact ${p.label} post. Nothing was published.`
        : 'This draft changed while copying. Review and copy its latest version again.';
    } catch {
      if (drafts?.[id] === snapshot && draftVersion[id] === atVersion) {
        c.outcome.textContent = 'Automatic copy failed. Use Ctrl+C (or Command+C) on the text below.';
        c.fallback.value = snapshot;
        c.manual.hidden = false;
        c.fallback.focus();
        c.fallback.select();
      }
    } finally { refreshCopy(id); }
  });
}
reset.addEventListener('click', () => {
  if (!idea.value && !drafts) return;
  dialog.showModal();
  keep.focus();
});
keep.addEventListener('click', () => dialog.close());
clear.addEventListener('click', () => {
  if (!dialog.open) return;
  dialog.close();
  idea.value = '';
  counter.textContent = '0 / 1,000';
  drafts = null;
  generatedFor = null;
  generatedTone = null;
  revision++; changeSequence++;
  resetAIReview();
  for (const p of PLATFORMS) renderPlatform(p.id);
  setStatus('Studio cleared. Previously copied clipboard content cannot be erased here.');
  idea.focus();
});
for (const p of PLATFORMS) renderPlatform(p.id);
setStatus('Enter a topic to begin.');

/** Stage-only integration hook. Results always need a separate user-controlled Apply click. */
export function studioSnapshot() {
  return Object.freeze({idea:idea.value,tone:tone.value,changeSequence});
}
export function applyReviewedStudioDrafts({results,snapshot,source}={}) {
  if(!['offline-mock','owner-live'].includes(source) || !snapshot || snapshot.changeSequence !== changeSequence || snapshot.idea !== idea.value || snapshot.tone !== tone.value) return false;
  if(!results || typeof results!=='object' || Array.isArray(results) || Object.keys(results).length!==PLATFORMS.length) return false;
  if(!PLATFORMS.every(p=>typeof results[p.id]==='string'&&results[p.id].trim()&&results[p.id].length<=2000)) return false;
  const newDrafts=Object.fromEntries(PLATFORMS.map(p=>[p.id,results[p.id]]));
  drafts = newDrafts; generatedFor=idea.value; generatedTone=tone.value;
  revision++; changeSequence++;
  for(const p of PLATFORMS) { draftVersion[p.id]=revision; controls[p.id].detail.open=false; renderPlatform(p.id,Boolean(runReview(p.id).concerns)); }
  hub.classList.remove('is-sparking'); void hub.offsetWidth; hub.classList.add('is-sparking');
  setStatus(source==='owner-live'?'Applied four validated NVIDIA drafts after separate review. Recheck facts and privacy before copying; no automatic publishing.':'Applied four OFFLINE MOCK drafts after separate review. These are not fresh NVIDIA AI results. Edit, check risks, and copy only what you choose.');
  return true;
}

/** Scheduling never bypasses card review or the per-draft copy acknowledgment. */
export function getSchedulingDrafts() {
  if(!drafts || isStale()) return null;
  const result={};
  for(const p of PLATFORMS) {
    const id=p.id, c=controls[id];
    const decision=getCopyAvailability({text:drafts[id],review:reviews[id],currentRevision:draftVersion[id],reviewRevision:draftVersion[id],acknowledged:c.ack.checked});
    result[id]={text:drafts[id],copyAllowed:decision.enabled && c.area.readOnly};
  }
  return result;
}
