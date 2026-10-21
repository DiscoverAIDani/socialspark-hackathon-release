import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createAppServer} from '../server.mjs';
import {FIXTURE_IDEA} from '../security/nebius-fake-session.mjs';

async function withApp(offlineBridge,cb){
  const server=createAppServer({offlineBridge});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try {return await cb(base);} finally {await new Promise(resolve=>server.close(resolve));}
}
async function session(base){const r=await fetch(base+'/api/mock/session');return {r,value:await r.json()};}
function post(base,path,csrf,body,override={}){
  return fetch(base+path,{method:'POST',headers:{Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-SocialSpark-Csrf':csrf,...override},body:JSON.stringify(body)});
}
const allowed={maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'};

test('default server refuses the offline bridge and retains zero-connect policy',async()=>{
  await withApp(false,async base=>{
    assert.equal((await fetch(base+'/api/mock/session')).status,404);
    assert.equal((await post(base,'/api/mock/prepare','irrelevant',allowed)).status,405);
    assert.match((await fetch(base)).headers.get('content-security-policy'),/connect-src 'none'/);
  });
});
test('explicit offline rehearsal mode changes CSP only to same-origin and not to provider origins',async()=>{
  await withApp(true,async base=>{
    const r=await fetch(base);assert.equal(r.status,200);
    const csp=r.headers.get('content-security-policy');
    assert.match(csp,/connect-src 'self'/);
    assert.doesNotMatch(csp,/https?:\/\/|tokenfactory|connect-src \*/);
  });
});
test('mock endpoint rejects cross-origin or missing CSRF',async()=>{
  await withApp(true,async base=>{
    const {value}=await session(base);
    assert.equal((await post(base,'/api/mock/prepare',value.csrf,allowed,{Origin:'http://evil.invalid'})).status,403);
    assert.equal((await post(base,'/api/mock/prepare','invalid',allowed)).status,403);
    const r=await fetch(base+'/api/mock/prepare',{method:'POST',body:JSON.stringify(allowed)});
    assert.equal(r.status,403);
  });
});
test('mock endpoint permits only one fixed fictional example and no arbitrary masked text',async()=>{
  await withApp(true,async base=>{
    const {value}=await session(base);
    for(const bad of [{...allowed,maskedText:'A real private note'},{...allowed,tone:'professional'},{...allowed,revision:5}]){
      const r=await post(base,'/api/mock/prepare',value.csrf,bad);assert.equal(r.status,400);
    }
    assert.equal((await post(base,'/api/mock/prepare',value.csrf,{...allowed,secret:'leak'})).status,400);
  });
});
test('mock requires separate prepare/complete and refuses an invented ticket',async()=>{
  await withApp(true,async base=>{
    const {value}=await session(base);
    const r=await post(base,'/api/mock/complete',value.csrf,{...allowed,ticket:'0'.repeat(64),confirm:'OFFLINE MOCK ONLY'});
    assert.equal(r.status,409);
  });
});
test('mock refuses to complete when the separate confirmation is missing',async()=>{
  await withApp(true,async base=>{
    const {value}=await session(base);
    const {ticket}=await (await post(base,'/api/mock/prepare',value.csrf,allowed)).json();
    const r=await post(base,'/api/mock/complete',value.csrf,{...allowed,ticket,confirm:'NO'});
    assert.equal(r.status,400);
  });
});
test('mock returns four validated drafts after one-time approval; no replay or external request',async()=>{
  await withApp(true,async base=>{
    const {value:meta}=await session(base);
    assert.equal(meta.externalRequests,0);
    const prepare=await post(base,'/api/mock/prepare',meta.csrf,allowed);
    assert.equal(prepare.status,200);
    const {ticket}=await prepare.json();
    const input={...allowed,ticket,confirm:'OFFLINE MOCK ONLY'};
    const response=await post(base,'/api/mock/complete',meta.csrf,input);
    assert.equal(response.status,200);
    const result=await response.json();
    assert.equal(result.mode,'offline-mock');
    assert.equal(result.creditsSpent,0);assert.equal(result.providerRequests,0);
    assert.deepEqual(Object.keys(result.drafts),['facebook','instagram','linkedin','tiktok']);
    for(const draft of Object.values(result.drafts))assert.ok(draft.includes('workshop'));
    assert.equal((await post(base,'/api/mock/complete',meta.csrf,input)).status,409);
    assert.equal((await post(base,'/api/mock/prepare',meta.csrf,allowed)).status,409);
  });
});
test('rehearsal rejects oversized request and method abuse',async()=>{
  await withApp(true,async base=>{
    const {value}=await session(base);
    assert.equal((await post(base,'/api/mock/prepare',value.csrf,{...allowed,extra:'x'.repeat(5000)})).status,413);
    assert.equal((await fetch(base+'/api/mock/complete')).status,403);
    assert.equal((await post(base,'/api/ai/live',value.csrf,allowed)).status,405);
  });
});
test('browser bridge uses click-only fetch, no key input, and requires independent apply',async()=>{
  const [script,studio,html]=await Promise.all(['../public/studio-ai-bridge.js','../public/studio.js','../public/index.html'].map(x=>readFile(new URL(x,import.meta.url),'utf8')));
  assert.match(script,/requestButton\.addEventListener\('click'/);
  assert.match(script,/applyButton\.addEventListener\('click'/);
  assert.match(script,/applyReviewedStudioDrafts/);
  assert.match(script,/source:'offline-mock'/);
  assert.match(script,/!unchanged\(pending\.snapshot\)/);
  assert.doesNotMatch(script,/NEBIUS_API_KEY|Bearer|localStorage|sessionStorage|eval\(/);
  assert.match(studio,/source\s*===\s*'owner-live'|\['offline-mock','owner-live'\]\.includes\(source\)/);
  assert.match(html,/id="bridge-consent"[^>]*disabled/);
  assert.match(html,/id="bridge-request"[^>]*disabled/);
  assert.match(html,/id="bridge-apply"[^>]*disabled/);
  assert.match(html,/OFFLINE SIMULATION/);
});
test('this version disables historical third live attempt',async()=>{
  const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(pkg.scripts['live:fictional'],undefined);
  assert.equal(pkg.scripts['studio:rehearsal'],'node scripts/start-studio-rehearsal.mjs');
  const file=await readFile(new URL('../scripts/live-nebius-once.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(file,/performFictionalLiveTest|fetch\(/);
});
