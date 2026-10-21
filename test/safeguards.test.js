import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { scanHiddenCharacters, revealHiddenCharacters, removeFlaggedHiddenCharacters } from '../public/text-integrity.js';
import { assessLanguageCoverage } from '../public/language-coverage.js';
import { reviewText } from '../public/privacy.js';
import { createMaskPreview } from '../public/masking.js';

const edited = 'Call me at 916-555-0\u200B198.';

test('hidden zero-width space is revealed at an understandable position', () => {
  const findings = scanHiddenCharacters(edited);
  assert.equal(findings.length, 1);
  assert.deepEqual({ code: findings[0].codePoint, label: findings[0].label }, {code:'U+200B',label:'Zero-width space'});
  assert.match(revealHiddenCharacters(edited), /0\[U\+200B: Zero-width space\]198/);
});
test('detected hidden characters cannot silently disappear; explicit cleanup changes them', () => {
  const original = edited;
  assert.notEqual(removeFlaggedHiddenCharacters(original), original);
  assert.equal(removeFlaggedHiddenCharacters(original), 'Call me at 916-555-0198.');
  assert.equal(original, edited, 'Source text was not mutated');
});
test('copy-risk hidden characters cause incomplete review and fail-closed mask validation', () => {
  const result = reviewText(edited);
  assert.equal(result.complete, false);
  assert.equal(result.status, 'limited');
  assert.equal(createMaskPreview(edited).validation.passedKnownPatterns, false);
});
test('bidi override is visibly flagged without running or applying it', () => {
  const text = 'Safe\u202Eunsafe';
  assert.match(revealHiddenCharacters(text), /\[U\+202E: Right-to-left override\]/);
  assert.equal(reviewText(text).complete, false);
});
test('normal emoji ZWJ sequence remains intact and is not a false hidden-character warning', () => {
  const sample = 'I work as a 👩‍💻 developer.';
  assert.deepEqual(scanHiddenCharacters(sample), []);
  assert.equal(removeFlaggedHiddenCharacters(sample), sample);
  assert.equal(reviewText(sample).complete, true);
});
test('an unrelated zero-width joiner can interrupt a phone number and must be reported', () => {
  const text = 'Call 916-55\u200D5-0198.';
  assert.equal(scanHiddenCharacters(text)[0].codePoint, 'U+200D');
  assert.equal(createMaskPreview(text).validation.passedKnownPatterns, false);
});
test('English sentences still receive complete supported checking', () => {
  for (const s of ['We had a wonderful day.', 'Call me at 916-555-0198.', 'It is Friday.']) {
    assert.equal(assessLanguageCoverage(s).limited, false, s);
  }
});
test('single strong Spanish phrase triggers limited checking, not false clearance', () => {
  for (const post of ['Nuestra casa estará vacía.', 'Nos vamos de vacaciones.', 'My plans: Nos vamos el viernes.']) {
    const result = reviewText(post);
    assert.equal(result.languageLimited, true, post);
    assert.equal(result.complete, false, post);
    assert.equal(createMaskPreview(post).validation.passedKnownPatterns, false, post);
  }
});
test('Spanish and English mixed post clearly shows limitations', () => {
  const post = 'My weekend was nice. Nuestra casa estará vacía toda la semana.';
  assert.equal(reviewText(post).complete, false);
  assert.ok(reviewText(post).limitations.some(x => /English-first/.test(x)));
});
test('non-Latin script samples trigger explicit language-coverage limitation', () => {
  for (const post of ['我们明天离开家', 'ذهبت إلى المنزل', 'Уходим завтра', '明日は休み', '안녕하세요', 'שלום']) {
    assert.equal(reviewText(post).languageLimited, true, post);
    assert.equal(createMaskPreview(post).validation.passedKnownPatterns, false, post);
  }
});
test('foreign-language limit plus visible phone still reports detectable phone pattern', () => {
  const post = 'Nos vamos de vacaciones. Llámame 916-555-0198.';
  assert.equal(reviewText(post).complete, false);
  assert.ok(reviewText(post).findings.some(x => x.title === 'Possible phone number'));
});
test('hidden inspector uses textContent; buttons never silently clean the editor', async () => {
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(app, /hiddenRevealed\.textContent = revealHiddenCharacters/);
  assert.match(app, /removeHidden\.addEventListener\('click'/);
  assert.match(app, /removeFlaggedHiddenCharacters\(draft\.value\)/);
  assert.doesNotMatch(app, /\bfetch\s*\(/);
});
test('consent demo is not an API consent or an enabled AI request', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  assert.match(html, /id="ai-request" type="button" disabled/);
  assert.match(html, /id="ai-demo-check" type="checkbox" disabled/);
  assert.match(html, /NOT consent to an actual AI scan/);
  assert.match(app, /aiDemoCheck\.checked = false/);
  assert.match(app, /!preview\.validation\.passedKnownPatterns \|\| !result\.complete/);
});
