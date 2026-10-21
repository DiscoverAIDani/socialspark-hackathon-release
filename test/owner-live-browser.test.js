import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createAppServer} from '../server.mjs';
import {FIXTURE_IDEA} from '../security/nebius-fake-session.mjs';
import {createOwnerLiveController} from '../security/owner-live-controller.mjs';

const fakeDrafts={facebook:'Join a fictional beginner workshop. Everyone is welcome!',instagram:'A beginner-friendly workshop is coming! ✨ #LearnTogether #Community',linkedin:'We invite learners to a fictional beginner workshop open to everyone.',tiktok:'Curious about learning? ✨ Join a fictional beginner workshop! #LearnTogether'};
const fakeTransport=()=>({ok:true,body:new ReadableStream({start(c){c.enqueue(new TextEncoder().encode(JSON.stringify({choices:[{message:{content:JSON.stringify(fakeDrafts)}}]})));c.close();}})});
const input={maskedText:FIXTURE_IDEA,revision:1,tone:'friendly'};
const key='DUMMY_TEST_KEY_1234567890123456';
async function withServer(liveTrial,fn){
 const server=createAppServer(liveTrial?{ownerLiveTrial:liveTrial}:{});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{return await fn(base);}finally{await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}
async function withDir(fn){const d=await mkdtemp(join(tmpdir(),'socialspark-owner-trial-'));try{return await fn(d);}finally{await rm(d,{force:true,recursive:true});}}
const post=(base,path,csrf,body,headers={})=>fetch(base+path,{method:'POST',headers:{Origin:base,'Sec-Fetch-Site':'same-origin','Content-Type':'application/json','X-SocialSpark-Csrf':csrf,...headers},body:JSON.stringify(body)});
const session=async base=>(await (await fetch(base+'/api/owner-live/session')).json());

test('default preview blocks owner trial without any provider requests; protected CSP',async()=>{
 await withServer(null,async base=>{
   assert.equal((await fetch(base+'/api/owner-live/session')).status,404);
   assert.equal((await post(base,'/api/owner-live/complete','garbage',input)).status,405);
   const page=await fetch(base);
   assert.match(page.headers.get('content-security-policy'),/connect-src 'none'/);
   assert.doesNotMatch(await page.text(),/data-socialspark-owner-live="yes"/);
 });
});
test('live and offline bridge cannot be combined',()=>{
 assert.throws(()=>createAppServer({offlineBridge:true,ownerLiveTrial:{}}),/combine/);
});
test('unlocked local trial only has same-origin CSP; key is absent from HTML and browser JS',async()=>{
 await withDir(async dir=>withServer({key,lockPath:join(dir,'one.lock'),fetchImpl:fakeTransport},async base=>{
   const page=await fetch(base);
   assert.match(page.headers.get('content-security-policy'),/connect-src 'self'/);
   const html=await page.text();assert.match(html,/data-socialspark-owner-live="yes"/);
   assert.match(html,/id="owner-live-consent"[^>]+disabled/);
   assert.match(html,/id="owner-live-apply"[^>]+disabled/);
   assert.doesNotMatch(html,new RegExp(key));
   const script=await(await fetch(base+'/studio-owner-live.js')).text();
   assert.doesNotMatch(script,/Bearer|NEBIUS_API_KEY|DUMMY_TEST_KEY|localStorage|sessionStorage/);
   assert.match(script,/applyButton.addEventListener\('click'/);
   assert.match(script,/requestButton.addEventListener\('click'/);
 }));
});
test('cross-origin, fake csrf, arbitrary text, and premature completion are blocked with zero calls',async()=>{
 await withDir(async dir=>{
   let calls=0;const transport=async(...args)=>{calls++;return fakeTransport(...args);};
   await withServer({key,lockPath:join(dir,'one.lock'),fetchImpl:transport},async base=>{
     const {csrf}=await session(base);
     assert.equal((await post(base,'/api/owner-live/prepare',csrf,input,{Origin:'http://evil.test'})).status,403);
     assert.equal((await post(base,'/api/owner-live/prepare','bad',input)).status,403);
     assert.equal((await post(base,'/api/owner-live/prepare',csrf,{...input,maskedText:'My private address is 123 Main St'})).status,409);
     assert.equal((await post(base,'/api/owner-live/prepare',csrf,{...input,tone:'playful'})).status,409);
     assert.equal((await post(base,'/api/owner-live/complete',csrf,{...input,ticket:'a'.repeat(64),confirm:'LIVE OWNER FICTIONAL REQUEST'})).status,409);
     const {ticket}=await (await post(base,'/api/owner-live/prepare',csrf,input)).json();
     assert.equal((await post(base,'/api/owner-live/complete',csrf,{...input,ticket,confirm:'no'})).status,409);
     assert.equal(calls,0);
     assert.deepEqual(await readdir(dir),[]);
   });
 });
});
test('one specifically approved fictional trial calls fake model once, returns validated four, never retries',async()=>{
 await withDir(async dir=>{
  let calls=0;const lockPath=join(dir,'one.lock');
  await withServer({key,lockPath,fetchImpl:async(...args)=>{calls++;return fakeTransport(...args);}},async base=>{
    const {csrf}=await session(base);
    const {ticket}=await (await post(base,'/api/owner-live/prepare',csrf,input)).json();
    const completeBody={...input,ticket,confirm:'LIVE OWNER FICTIONAL REQUEST'};
    const res=await post(base,'/api/owner-live/complete',csrf,completeBody);
    assert.equal(res.status,200);const result=await res.json();
    assert.equal(result.mode,'owner-live');assert.equal(result.providerAttempts,1);
    assert.deepEqual(Object.keys(result.drafts),['facebook','instagram','linkedin','tiktok']);
    assert.equal(calls,1);
    assert.equal((await session(base)).used,true);
    assert.equal((await post(base,'/api/owner-live/complete',csrf,completeBody)).status,409);
    assert.equal((await post(base,'/api/owner-live/prepare',csrf,input)).status,409);
    assert.equal(calls,1);
    assert.doesNotMatch(await readFile(lockPath,'utf8'),new RegExp(key+'|workshop|facebook','i'));
  });
 });
});
test('persistent lock blocks the same trial after restart even with fresh tokens and fake network',async()=>{
 await withDir(async dir=>{
  const lockPath=join(dir,'one.lock');let calls=0;
  const trial={key,lockPath,fetchImpl:async(...args)=>{calls++;return fakeTransport(...args);}};
  async function attempt(base){const {csrf}=await session(base);const {ticket}=await (await post(base,'/api/owner-live/prepare',csrf,input)).json();return post(base,'/api/owner-live/complete',csrf,{...input,ticket,confirm:'LIVE OWNER FICTIONAL REQUEST'});}
  await withServer(trial,async base=>assert.equal((await attempt(base)).status,200));
  await withServer(trial,async base=>{const res=await attempt(base);assert.equal(res.status,409);assert.equal((await res.json()).code,'one-use-lock-unavailable');});
  assert.equal(calls,1);
 });
});
test('model failure after reservation consumes the attempt; error never reveals provider body or key',async()=>{
 await withDir(async dir=>{
  let calls=0;const lockPath=join(dir,'one.lock');
  await withServer({key,lockPath,fetchImpl:async()=>{calls++;return {ok:false,status:403,body:'SECRET_PROVIDER_BODY'};}},async base=>{
    const {csrf}=await session(base),{ticket}=await (await post(base,'/api/owner-live/prepare',csrf,input)).json();
    const res=await post(base,'/api/owner-live/complete',csrf,{...input,ticket,confirm:'LIVE OWNER FICTIONAL REQUEST'});
    const raw=await res.text();
    assert.equal(res.status,409);assert.equal(JSON.parse(raw).code,'provider-access-denied-403');
    assert.equal(calls,1);assert.ok((await readdir(dir)).includes('one.lock'));
    assert.doesNotMatch(raw,/SECRET|TEST_KEY/);
  });
 });
});
test('owner controller fails closed on invalid key before endpoint exists',()=>{
 assert.throws(()=>createOwnerLiveController({key:'short',lockPath:'/tmp/does-not-matter'}),/not configured/);
});
