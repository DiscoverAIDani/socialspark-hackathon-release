import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read = name => readFile(new URL(name,import.meta.url),'utf8');
test('offline model preview is opt-in, collapsed, and cannot send a request',async()=>{
  const html=await read('../public/index.html');
  assert.match(html,/<details class="studio-ai-preflight"/);
  assert.match(html,/id="studio-inspect-ai"/);
  assert.match(html,/id="studio-request-ai" type="button" disabled/);
  assert.match(html,/This is not consent to send anything/);
});
test('preflight preview relies on masked text and never displays privateMappings',async()=>{
  const source=await read('../public/studio.js');
  assert.match(source,/createMaskPreview\(idea.value\)/);
  assert.match(source,/proposedAI.value=masked.maskedText/);
  assert.doesNotMatch(source,/proposedAI\.value=masked\.privateMappings/);
  assert.match(source,/idea.addEventListener\('input'[\s\S]*?resetAIReview\(\)/);
  assert.doesNotMatch(source,/\bfetch\s*\(/);
});
