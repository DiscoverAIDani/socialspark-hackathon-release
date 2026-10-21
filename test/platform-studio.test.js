import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAppServer } from '../server.mjs';
import { validateIdea, makeOfflineDrafts, PLATFORMS, TONES } from '../public/platform-drafts.js';
import { reviewText } from '../public/privacy.js';
import { getCopyAvailability } from '../public/copy-availability.js';

const source = () => readFile(new URL('../public/studio.js',import.meta.url),'utf8');
const layout = () => readFile(new URL('../public/index.html',import.meta.url),'utf8');
test('four defined platform drafts and tones, no account publishing',()=>{
  assert.deepEqual(PLATFORMS.map(x=>x.id), ['facebook','instagram','linkedin','tiktok']);
  assert.deepEqual(TONES, ['friendly','professional','playful']);
});
test('empty, invalid, and too-long ideas are rejected',()=>{
  assert.equal(validateIdea(' ').valid,false);
  assert.equal(validateIdea(null).valid,false);
  assert.equal(validateIdea('x'.repeat(1001)).valid,false);
  assert.throws(()=>makeOfflineDrafts(''),/topic/);
  assert.throws(()=>makeOfflineDrafts('Topic','not-a-tone'),/Unsupported/);
});
test('each platform draft includes the supplied topic with different wording',()=>{
  const data=makeOfflineDrafts('A fictional community workshop.');
  const list=Object.values(data);
  assert.equal(list.length,4);
  for(const draft of list) assert.match(draft,/A fictional community workshop\./);
  assert.equal(new Set(list).size,4);
  assert.match(data.instagram,/#Community/);
});
test('all tones differ and do not invent dates or locations',()=>{
  const data=TONES.map(t=>makeOfflineDrafts('A new event may be planned.',t));
  for(const item of data) {
    for(const draft of Object.values(item)){
      assert.doesNotMatch(draft,/2026|October|at 8 PM|123 Main Street/);
    }
  }
  assert.equal(new Set(data.map(x=>x.linkedin)).size,3);
});
test('the local generator exposes privacy risk to the same review engine',()=>{
  const drafts=makeOfflineDrafts('Call me at 916-555-0198 or visit me at 123 Main Street.');
  for(const draft of Object.values(drafts)){
    const review=reviewText(draft);
    assert.equal(review.concerns,true);
    assert.ok(review.findings.some(f=>f.title==='Possible phone number'));
    assert.ok(review.findings.some(f=>f.title==='Possible street address'));
    const blocked=getCopyAvailability({text:draft,review,reviewRevision:1,currentRevision:1,acknowledged:false});
    assert.equal(blocked.enabled,false);
    assert.equal(getCopyAvailability({text:draft,review,reviewRevision:1,currentRevision:1,acknowledged:true}).enabled,true);
  }
});
test('each platform has an independent edit, warning, acknowledgment and copy workflow',async()=>{
  const js=await source();
  assert.match(js,/Object.fromEntries\(PLATFORMS.map/);
  assert.match(js,/drafts\[id\] = c.area.value/);
  assert.match(js,/c.ack.checked = false/);
  assert.match(js,/isStale\(\)/);
  assert.match(js,/generatedTone !== tone.value/);
  assert.match(js,/navigator.clipboard.writeText\(snapshot\)/);
  assert.doesNotMatch(js, /\bfetch\s*\(/);
});
test('four visible editable output cards and accessible clear dialog',async()=>{
  const html=await layout();
  assert.match(html, /id="studio-idea"/);
  for(const platform of PLATFORMS){
    assert.match(html, new RegExp(`id="studio-preview-${platform.id}"`));
    assert.match(html, new RegExp(`id="studio-ack-${platform.id}"`));
    assert.match(html, new RegExp(`id="studio-risk-list-${platform.id}"`));
    assert.match(html, new RegExp(`id="studio-copy-${platform.id}"`));
  }
  assert.match(html, /class="spark-hub" aria-hidden="true"/);
  assert.match(html, /id="studio-clear-dialog"/);
  assert.match(html, /<details class="privacy-lab"/);
  assert.match(html, /<script type="module" src="\/studio.js"><\/script>/);
});
test('studio assets are allowlisted under no-outbound CSP',async()=>{
  const server=createAppServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const port=server.address().port;
    for(const path of ['/studio.js','/platform-drafts.js']) {
      const response=await fetch(`http://127.0.0.1:${port}${path}`);
      assert.equal(response.status,200);
      assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
    }
    const response=await fetch(`http://127.0.0.1:${port}/api/create`, {method:'POST',body:'test'});
    assert.equal(response.status,405);
  } finally {await new Promise(resolve=>server.close(resolve));}
});
