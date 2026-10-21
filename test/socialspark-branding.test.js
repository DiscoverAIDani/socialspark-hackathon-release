import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAppServer} from '../server.mjs';
const source = async file => readFile(new URL(`../public/${file}`,import.meta.url),'utf8');

test('official project identity and honest offline status are prominent', async()=>{
 const html=await source('index.html');
 assert.match(html, /<title>SocialSpark — AI Social Media Content Studio \(Electric Spark Network\)<\/title>/);
 assert.match(html, /class="brand-wordmark"/);
 assert.match(html, /Social<\/span><span class="brand-spark">Spark/);
 assert.match(html, /Offline examples only — real AI is not enabled/);
 assert.match(html, /Spark sample drafts/);
 assert.doesNotMatch(html, /Before You Post/);
});

test('brand mark remains a static local-only SVG with safe icon semantics',async()=>{
 const html=await source('index.html');
 const logo=await source('socialspark-mark.svg');
 assert.match(html, /class="brand-icon" src="\/socialspark-mark.svg" alt=""/);
 assert.match(html, /rel="icon" type="image\/svg\+xml"/);
 assert.match(logo, /<svg /);
 assert.match(logo, /SocialSpark chat bubbles and electric bolt/);
 assert.doesNotMatch(logo, /<script|<foreignObject|(?:xlink:)?href=|onload=|https?:\/\/(?!www\.w3\.org)/i);
});

test('electric palette does not replace the dark red privacy risk color',async()=>{
 const css=await source('styles.css');
 assert.match(css, /--electric:#00cdb9/);
 assert.match(css, /--spark-yellow:#ffd166/);
 assert.match(css, /--risk: #841b29/);
 assert.match(css, /@media\(max-width:600px\)/);
});

test('brand asset is allowlisted but provider transmissions still blocked',async()=>{
 const server=createAppServer(); await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {
  const origin=`http://127.0.0.1:${server.address().port}`;
  const logo=await fetch(`${origin}/socialspark-mark.svg`);
  assert.equal(logo.status,200);
  assert.match(logo.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(logo.headers.get('content-security-policy'), /connect-src 'none'/);
  const response=await fetch(`${origin}/ai/generate`,{method:'POST',body:'fictional topic'});
  assert.equal(response.status,405);
 } finally {await new Promise(resolve=>server.close(resolve));}
});
