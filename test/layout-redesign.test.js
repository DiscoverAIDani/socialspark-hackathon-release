import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
test('desktop workspace has two independent side-by-side columns, no duplicate controls', () => {
  assert.match(html, /class="workspace"/);
  // Sections stay in the same logical keyboard/read order as before.
  const order = ['editor-heading', 'review-heading', 'mask-heading', 'ai-heading', 'suggestion-heading'];
  let last = -1;
  for (const id of order) { const n=html.indexOf(`aria-labelledby="${id}"`); assert.ok(n>last, `order of ${id}`); last=n; }
  assert.match(css, /\.workspace\s*\{[^}]*display:grid;[^}]*grid-template-columns:minmax\(0,1\.06fr\) minmax\(0,\.94fr\)/);
  for (const id of ['draft','checks','findings','masked-text','confirm-clear','load-suggestion','apply-confirmation','copy']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1, `one #${id}`);
  }
});
test('warning palette is dark red and not reused for success statuses', () => {
  assert.match(css, /--risk: #841b29/);
  assert.match(css, /\.finding\s*\{[^}]*var\(--risk-light\)/);
  assert.match(css, /\.status\.concerns\s*\{[^}]*var\(--risk-deep\)/);
  assert.match(css, /\.status\.warning\s*\{[^}]*#425b57/);
  assert.match(css, /\.status\.clear\s*\{[^}]*#195a3d/);
});
test('one-column mobile fallback and visible focus styling are preserved', () => {
  assert.match(css, /@media \(max-width: 980px\)/);
  assert.match(css, /\.workspace \{grid-template-columns:1fr/);
  assert.match(css, /button:focus-visible/);
  assert.match(css, /\.workspace \.panel\[aria-labelledby\] \{grid-area:auto/);
  assert.match(html, /aria-labelledby="review-heading"/);
});
test('logic remains local and disabled AI stays unavailable', () => {
  assert.match(js, /renderResults\(\)/);
  assert.match(html, /id="ai-request" type="button" disabled/);
  assert.match(js, /suggestionMessage\.textContent = '';/);
});
