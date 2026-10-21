import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppServer } from '../server.mjs';

async function withServer(callback) {
  const server = createAppServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('content studio loads with privacy lab preserved and no enabled AI', async () => {
  await withServer(async origin => {
    const response = await fetch(origin);
    const html = await response.text();
    assert.equal(response.status, 200);
    assert.match(html, /SocialSpark — AI Social Media Content Studio/);
    assert.match(html, /Advanced Privacy Lab/);
    assert.match(html, /Offline examples only — real AI is not enabled/);
    assert.match(html, /experimental and cannot guarantee/);
    assert.match(html, /AI scan unavailable — provider verification pending/);
    assert.match(html, /id="copy"[^>]*disabled/);
    assert.equal(response.headers.get('cache-control'), 'no-store, max-age=0');
  });
});

test('security policy prevents browser-side outbound connections', async () => {
  await withServer(async origin => {
    const response = await fetch(origin + '/app.js');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.match(response.headers.get('content-security-policy'), /script-src 'self'/);
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  });
});

test('refuses POST requests rather than accepting draft content', async () => {
  await withServer(async origin => {
    const response = await fetch(origin + '/api/scan', { method: 'POST', body: 'secret draft text' });
    assert.equal(response.status, 405);
  });
});

test('unknown paths and traversal paths are not served', async () => {
  await withServer(async origin => {
    const response = await fetch(origin + '/not-an-asset');
    assert.equal(response.status, 404);
    const response2 = await fetch(origin + '/private.txt');
    assert.equal(response2.status, 404);
  });
});

test('HTML HEAD response has no response body', async () => {
  await withServer(async origin => {
    const response = await fetch(origin, { method: 'HEAD' });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '');
  });
});


test('privacy module is served but arbitrary server paths remain blocked', async () => {
  await withServer(async origin => {
    const response = await fetch(origin + '/privacy.js');
    assert.equal(response.status, 200);
    assert.match(await response.text(), /export function reviewText/);
    assert.equal((await fetch(origin + '/api/scan')).status, 404);
  });
});


test('v0.9 serves the explained demo gate module without exposing other paths', async () => {
  await withServer(async origin => {
    const result = await fetch(origin + '/demo-availability.js');
    assert.equal(result.status, 200);
    assert.match(await result.text(), /export function getDemoAvailability/);
    assert.match(result.headers.get('content-security-policy'), /connect-src 'none'/);
    assert.equal((await fetch(origin + '/package.json')).status, 404);
  });
});

test('v0.10 serves read-only copy guidance module under restrictive browser policy', async () => {
  await withServer(async origin => {
    const result = await fetch(origin + '/copy-availability.js');
    assert.equal(result.status, 200);
    assert.match(await result.text(), /export function getCopyAvailability/);
    assert.match(result.headers.get('content-security-policy'), /connect-src 'none'/);
  });
});
