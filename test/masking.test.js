import test from 'node:test';
import assert from 'node:assert/strict';
import { createMaskPreview } from '../public/masking.js';

const preview = s => createMaskPreview(s);
const masked = s => preview(s).maskedText;

test('BYP-004 bank account number masked, context retained, original input unchanged', () => {
  const source = 'My bank account number is 123456789012. Please send payment there.';
  assert.equal(masked(source), 'My bank account number is [ACCOUNT_1]. Please send payment there.');
  assert.equal(source.includes('123456789012'), true);
  assert.equal(preview(source).validation.passedKnownPatterns, true);
});
test('BYP-001 child age, name and school are masked without rebuilding the original', () => {
  const m = masked('My 8-year-old daughter Emma attends Lincoln Elementary School.');
  assert.match(m, /\[AGE_1\]/);
  assert.match(m, /\[CHILD_NAME_1\]/);
  assert.match(m, /\[SCHOOL_1\]/);
  assert.doesNotMatch(m, /8-year-old|Emma|Lincoln/);
});
test('BYP-003 name, workplace, city are masked in combined example', () => {
  const m = masked('My name is Sarah Miller. I work at Cedar Grove Dental in Sacramento.');
  assert.match(m, /\[NAME_1\]/);
  assert.match(m, /\[WORKPLACE_1\]/);
  assert.match(m, /\[LOCATION_1\]/);
  assert.doesNotMatch(m, /Sarah Miller|Cedar Grove Dental|Sacramento/);
});
test('addresses, phones, emails, coordinates, and identifiers are replaced', () => {
  const input = 'Come to 123 Main Street. Call 916-555-0198 or email sarah@example.com. GPS 38.5678, -121.4567. SSN 123-45-6789.';
  const m = masked(input);
  for (const value of ['123 Main Street','916-555-0198','sarah@example.com','38.5678','121.4567','123-45-6789']) assert.ok(!m.includes(value), value);
  for (const tag of ['ADDRESS','PHONE','EMAIL','LOCATION','IDENTIFIER']) assert.match(m, new RegExp('\\['+tag+'_1\\]'));
});
test('travel context remains but Friday replaced with a date placeholder', () => {
  const m = masked("We're leaving Friday and our home will be empty all week.");
  assert.match(m, /We're leaving \[DATE_1\]/);
  assert.match(m, /our home will be empty/);
});
test('financial number masking does not apply to an unrelated order number', () => {
  const source = 'My online order number is 123456789012 and it shipped today.';
  assert.equal(masked(source), source);
});
test('several phones produce unique placeholders, no raw values', () => {
  const m = masked('Call 916-555-0198 or 415-555-0144.');
  assert.match(m, /\[PHONE_1\]/);
  assert.match(m, /\[PHONE_2\]/);
  assert.doesNotMatch(m, /555-0/);
});
test('cannot pass known-pattern validation for hidden characters and unsupported language', () => {
  assert.equal(preview('Call me at 916-555-0\u200B198.').validation.passedKnownPatterns, false);
  assert.equal(preview('Nos vamos de vacaciones el viernes. Nuestra casa estará vacía toda la semana.').validation.passedKnownPatterns, false);
});
test('empty and ordinary posts remain unchanged', () => {
  for (const source of ['', 'Had a wonderful day with my friends.']) {
    assert.equal(masked(source), source);
  }
});
test('any private mapping is local to the call, never embedded in masked text', () => {
  const result = preview('Call me at 916-555-0198.');
  assert.equal(result.privateMappings[0].original, '916-555-0198');
  assert.doesNotMatch(result.maskedText, /916/);
});

test('punctuation outside a masked address remains intact', () => {
  assert.equal(masked('Visit 123 Main Street. Thanks!'), 'Visit [ADDRESS_1]. Thanks!');
});
test('secrets can be masked without changing the rest of the sentence', () => {
  const m = masked('My password is SecretValue123, do not share.');
  assert.match(m, /\[SECRET_1\]/);
  assert.doesNotMatch(m, /SecretValue123/);
});
test('masking remains limited for potentially unsupported characters', () => {
  assert.equal(preview('我的地址在这里').validation.passedKnownPatterns, false);
});
test('user-authored text is unchanged; markup is inert preview text', () => {
  const source = '<script>alert(1)</script> Call 916-555-0198.';
  const m = masked(source);
  assert.match(m, /<script>alert\(1\)<\/script>/);
  assert.match(m, /\[PHONE_1\]/);
  assert.equal(source.includes('916-555-0198'), true);
});
test('browser app uses plain-text preview and never enables AI scanning', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(app, /previewText\.value = preview\.maskedText/);
  assert.match(html, /id="masked-text" readonly/);
  assert.match(html, /id="ai-request" type="button" disabled>/);
  assert.doesNotMatch(app, /\bfetch\s*\(/);
});

test('BYP-004 regression: two different phones mask exactly with no stray trailing digit', () => {
  const source = 'Call me at 916-555-0198 or my office at 415-555-0136.';
  const result = preview(source);
  assert.equal(result.maskedText, 'Call me at [PHONE_1] or my office at [PHONE_2].');
  assert.equal(result.validation.passedKnownPatterns, true);
  assert.equal(result.replacements.length, 2);
});

test('BYP-005: same phone repeated reuses the same placeholder and mapping', () => {
  const source = 'Call me at 916-555-0198. You can also text me at 916-555-0198.';
  const result = preview(source);
  assert.equal(result.maskedText, 'Call me at [PHONE_1]. You can also text me at [PHONE_1].');
  assert.equal(result.replacements.length, 2);
  assert.equal(result.privateMappings.length, 1);
  assert.equal(result.privateMappings[0].original, '916-555-0198');
});

test('same value in different types never shares a placeholder', () => {
  const source = 'My password is Alpha123. My password is Alpha123.';
  const result = preview(source);
  assert.equal(result.maskedText, 'My password is [SECRET_1]. My password is [SECRET_1].');
  assert.equal(result.privateMappings.length, 1);
});

test('unmasked unattended-home context blocks local validation even when a date is masked', () => {
  const result = preview("We're leaving Friday, and our house will be empty all week!");
  assert.match(result.maskedText, /\[DATE_1\]/);
  assert.match(result.maskedText, /house will be empty/);
  assert.equal(result.validation.passedKnownPatterns, false);
  assert.ok(result.validation.issues.some(issue => issue.includes('privacy concern')));
});

test('hidden Unicode inside phone means validation cannot pass for AI use', () => {
  const result = preview('Call 916-555-0\u200b198 tomorrow.');
  assert.equal(result.validation.passedKnownPatterns, false);
  assert.ok(result.validation.issues.length > 0);
});

test('an older cached review cannot override checks for the current post', () => {
  const stale = { complete: true, findings: [], limitations: [], status: 'clear' };
  const result = createMaskPreview('My bank account number is 123456789012.', stale);
  assert.equal(result.maskedText, 'My bank account number is [ACCOUNT_1].');
  assert.equal(result.validation.passedKnownPatterns, true);
});

test('masking child context and two distinct personal details preserves placeholders', () => {
  const result = preview('My 8-year-old daughter Emma attends Lincoln Elementary School. Call 916-555-0198.');
  assert.match(result.maskedText, /\[AGE_1\]/);
  assert.match(result.maskedText, /\[CHILD_NAME_1\]/);
  assert.match(result.maskedText, /\[SCHOOL_1\]/);
  assert.match(result.maskedText, /\[PHONE_1\]/);
  assert.doesNotMatch(result.maskedText, /Lincoln|Emma|916-555/);
});

test('no code in browser or server sends draft or preview to remote AI', async () => {
  const { readFile } = await import('node:fs/promises');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const server = await readFile(new URL('../server.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(app, /\bfetch\s*\(/);
  assert.doesNotMatch(server, /api\/scan|NVIDIA_API_KEY|fetch\s*\(/);
});

test('phone in two formats uses one identity placeholder', () => {
  const source = 'Call 916-555-0198 or (916) 555-0198.';
  const result = preview(source);
  assert.equal(result.maskedText, 'Call [PHONE_1] or [PHONE_1].');
  assert.equal(result.privateMappings.length, 1);
});
