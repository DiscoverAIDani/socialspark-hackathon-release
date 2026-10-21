import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const source = name => readFile(new URL(`../public/${name}`,import.meta.url),'utf8');
test('network layout contains four simultaneously visible platform cards',async()=>{
  const html=await source('index.html');
  const ids=['facebook','instagram','linkedin','tiktok'];
  assert.match(html, /class="spark-workspace"/);
  assert.match(html, /class="spark-hub" aria-hidden="true"/);
  assert.match(html, /<svg viewBox="0 0 185 535"/);
  for(const id of ids){
    assert.equal((html.match(new RegExp(`data-platform="${id}" aria-labelledby`, 'g'))||[]).length,1);
    for(const tail of [`studio-preview-${id}`,`studio-ack-${id}`,`studio-copy-${id}`,`studio-warnings-${id}`])
      assert.equal((html.match(new RegExp(`id="${tail}"`,'g'))||[]).length,1,tail);
  }
});
test('platform preview and editing use safe text operations instead of dynamic HTML injection',async()=>{
  const js=await source('studio.js');
  assert.match(js, /element.textContent = content/);
  assert.match(js, /drafts\[id\] = c.area.value/);
  assert.doesNotMatch(js,/\.innerHTML\s*=/);
  assert.doesNotMatch(js,/\bfetch\s*\(/);
  assert.doesNotMatch(js,/localStorage|sessionStorage/);
});
test('four cards independently gate copy on privacy acknowledgments, draft freshness and revision',async()=>{
  const js=await source('studio.js');
  assert.match(js,/c.ack.checked = false;/);
  assert.match(js,/getCopyAvailability\(\{text:drafts\[id\]/);
  assert.match(js,/isStale\(\)/);
  assert.match(js,/draftVersion\[id\]\+\+/);
  assert.match(js,/c.copy.disabled = !decision.enabled/);
  assert.match(js,/const snapshot = drafts\[id\]/);
});
test('warning details stay attached to their own platform and never replace user text',async()=>{
  const js=await source('studio.js');
  assert.ok(js.includes('detail: $(`studio-warnings-${p.id}`)'));
  assert.match(js,/c.riskList.replaceChildren\(\)/);
  assert.match(js,/if \(finding.sourceQuote\)/);
  assert.match(js,/drawRisk\(id, Boolean\(reviews\[id\]\.concerns\)\)/);
});
test('spark animation respects reduced motion and small screens remain one column',async()=>{
  const css=await source('styles.css');
  assert.match(css, /\.spark-workspace\{[^}]*grid-template-columns:/);
  assert.match(css, /@media\(max-width:850px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /\.spark-risk-badge\.needs-review\{[^}]*var\(--risk-deep\)/);
});
