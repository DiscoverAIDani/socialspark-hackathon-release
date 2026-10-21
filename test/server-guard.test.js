import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';
import http from 'node:http';

async function running(callback) {
  const server = createAppServer();
  await new Promise(resolve=>server.listen(0, '127.0.0.1', resolve));
  try { return await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise((resolve,reject)=>server.close(err=>err?reject(err):resolve())); }
}
test('v0.5 rejects URL-query text rather than making it part of page behavior', async()=>running(async origin=>{
  const result = await fetch(origin + '/?post=secret-test-post');
  assert.equal(result.status,400);
  assert.doesNotMatch(await result.text(),/secret-test-post/);
}));
test('v0.5 rejects hostile hostname before serving the page', async()=>running(async origin=>{
  const response = await new Promise((resolve, reject) => {
    const request = http.get(origin, { headers: {host: 'before-you-post.attacker.invalid'} }, result => {
      result.resume();
      result.on('end', () => resolve(result.statusCode));
    });
    request.on('error', reject);
  });
  assert.equal(response,400);
}));
test('v0.5 retains strict local-only CSP and no tracking', async()=>running(async origin=>{
  const result = await fetch(origin);
  assert.equal(result.status,200);
  assert.match(result.headers.get('content-security-policy'),/connect-src 'none'/);
  assert.equal(result.headers.get('cross-origin-opener-policy'),'same-origin');
  assert.equal(result.headers.get('cache-control'),'no-store, max-age=0');
  assert.match(await result.text(),/spending cap is \$0/);
}));
test('v0.5 has no active AI route even for masked requests', async()=>running(async origin=>{
  const result = await fetch(origin+'/api/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({maskedText:'Call me at [PHONE_1].'})});
  assert.equal(result.status,405);
}));
