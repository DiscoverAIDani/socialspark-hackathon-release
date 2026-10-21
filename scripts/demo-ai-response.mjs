/**
 * Offline demonstration with fixed, fictional masked-text fixture ONLY.
 * Logs only aggregate pass/fail labels, NEVER post content or identifiers.
 * Not connected to any model, API route, credential, or browser draft.
 */
import { validateAIResponse } from '../security/ai-response-validation.mjs';

const source = 'Call me at [PHONE_1].';
const context = { expectedRevision: 3, expectedMaskedText: source };
const good = () => ({
  schemaVersion: 1,
  postRevision: 3,
  analyzedMaskedText: source,
  findings: [{
    category: 'contact',
    sourceQuote: '[PHONE_1]',
    explanation: 'Sharing direct contact information can invite unwanted messages.',
    suggestedReplacement: 'Ask people to send a private message instead.'
  }],
  suggestedPost: 'Please send me a private message.'
});
const scenarios = [
  ['Supported response', good(), true, 'structure-and-quote-checks-only'],
  ['Outdated response', { ...good(), postRevision: 2 }, false, 'outdated-response'],
  ['Fabricated evidence', { ...good(), findings: [{ ...good().findings[0], sourceQuote: 'not present in source' }] }, false, 'unsupported-source-quote'],
  ['Unsafe suggested rewrite', { ...good(), suggestedPost: 'Call me at 415-555-0198.' }, false, 'unsafe-suggested-post'],
  ['Unresolved placeholder', { ...good(), suggestedPost: 'Call [PHONE_1] for details.' }, true, 'structure-and-quote-checks-only']
];
let passed = 0;
for (const [name, data, valid, code] of scenarios) {
  const result = validateAIResponse(JSON.stringify(data), context);
  const ok = result.valid === valid && result.code === code && (name !== 'Unresolved placeholder' || result.requiresManualPlaceholderEditing === true)
    && (result.valid !== true || result.autoApply === false);
  if (ok) passed += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} — ${name}\n`);
}
process.stdout.write(`${passed}/${scenarios.length} offline response checks passed. AI requests: DISABLED.\n`);
if (passed !== scenarios.length) process.exitCode = 1;
