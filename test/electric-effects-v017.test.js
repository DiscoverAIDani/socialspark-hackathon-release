import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=(name)=>readFile(new URL('../public/'+name, import.meta.url),'utf8');
test('each platform has a separately colored electric path and moving visual charge',async()=>{
  const html=await read('index.html'); const css=await read('styles.css');
  for (const name of ['facebook','instagram','linkedin','tiktok']) {
    assert.match(html,new RegExp('id="spark-'+name+'"'));
    assert.match(html,new RegExp('spark-charge-'+name));
  }
  assert.match(css,/\.spark-hub \.spark-charge\s*\{/);
  assert.match(css,/@keyframes charge-flow/);
});
test('electric animations are purely visual and honor reduced motion',async()=>{
  const html=await read('index.html'); const css=await read('styles.css');
  assert.match(html,/class="spark-hub" aria-hidden="true"/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)\{\.spark-hub \.spark-aura/);
  assert.doesNotMatch(html,/onmouseover=|onclick=/);
});
test('new studio warning copy references its own platform, not the legacy section',async()=>{
  const js=await read('studio.js');
  assert.match(js,/Copy paused: review/);
  assert.match(js,/decision.code === 'acknowledgment-required'/);
  assert.doesNotMatch(js,/Section 02/);
});
test('warning detail height limited without removing the acknowledgment checkbox',async()=>{
  const css=await read('styles.css'); const html=await read('index.html');
  assert.match(css,/\.spark-risk-details \{max-height:165px;overflow:auto;/);
  for (const p of ['facebook','instagram','linkedin','tiktok']) assert.match(html,new RegExp('id="studio-ack-'+p+'"'));
});
