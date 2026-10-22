import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../cloudflare/judge-gateway-disabled-worker.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';

test('inert Cloudflare Worker never enables or invokes live model calls',async()=>{
  for (const method of ['GET','POST','PUT']) {
    const response=await worker.fetch(new Request('https://demo.example.org'+JUDGE_API_PATH,{
      method,
      ...(method==='POST'?{body:JSON.stringify({
        exampleId:'fictional-beginner-workshop',liveEnabled:true,key:'FAKE'
      })}:{})
    }));
    assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{ok:false,code:'judge-live-ai-disabled'});
    assert.equal(response.headers.get('cache-control'),'no-store, max-age=0');
    assert.match(response.headers.get('content-security-policy'),/connect-src 'none'/);
  }
});

test('unbound Worker has no session, activation or other publicly callable routes',async()=>{
  for (const path of ['/api/activate','/api/session','/api/admin','/api/owner-live/complete','/internal','/']) {
    const response=await worker.fetch(new Request('https://demo.example.org'+path));
    assert.equal(response.status,404,path);
    assert.equal(response.headers.get('access-control-allow-origin'),null);
  }
});

test('disabled gateway does not echo attacker text or credentials',async()=>{
  const response=await worker.fetch(new Request('https://demo.example.org'+JUDGE_API_PATH,{
    method:'POST',
    headers:{Authorization:'Bearer PRIVATE_SHOULD_NOT_ECHO'},
    body:'SECRET_POST_CONTENT_SHOULD_NOT_ECHO'
  }));
  assert.doesNotMatch(await response.text(),/PRIVATE_SHOULD_NOT_ECHO|SECRET_POST_CONTENT_SHOULD_NOT_ECHO/);
});
