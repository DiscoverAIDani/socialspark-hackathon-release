/**
 * OFFLINE ONLY: simulated Cloudflare Access signed tokens, HMAC identities,
 * independent v2 session ledger, simulated Turnstile and mock quota.
 * No actual judge login, provider usage, secret, model or deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {
 offlineBoundIssueJudgeSession as issue,
 offlineBoundCheckJudgeGenerate as generate
} from '../cloudflare/judge-bound-auth-offline-pipeline.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {TURNSTILE_JUDGE_ACTION} from '../cloudflare/judge-turnstile-core.mjs';
import {offlineBoundSessionFixture,BOUND_SESSION_LEDGER_KEY,
 issueBoundJudgeSessionInTransaction,consumeBoundJudgeSessionInTransaction}
 from '../cloudflare/judge-bound-session-core.mjs';
import {offlineRateFixture,RATE_LIMIT_LEDGER_KEY,
 reserveSessionIssueRateInTransaction} from '../cloudflare/judge-rate-core.mjs';
import {offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY,
 reserveJudgeAttemptInTransaction} from '../cloudflare/judge-quota-core.mjs';
import {inspectOfflineJudgeAccessJwt} from '../cloudflare/judge-access-jwt-offline.mjs';

const origin='https://judge.example.org';
const nowMs=Date.UTC(2026,11,10,12,0);
const now=Math.floor(nowMs/1000);
const issuer='https://examplename.cloudflareaccess.com';
const audience='a'.repeat(32);
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
const otherPair=generateKeyPairSync('rsa',{modulusLength:2048});
const key=Uint8Array.from({length:32},(_,i)=>i+21); // synthetic test-only key
const anotherKey=Uint8Array.from({length:32},(_,i)=>i+67);
const header={alg:'RS256',typ:'JWT',kid:'synthetic-bound-jwk'};
const base={
 iss:issuer,aud:[audience],type:'app',
 iat:now-30,nbf:now-30,exp:now+600,
 email:'judge-a@example.org',sub:'judge-a-stable-sub'
};
const jwk={...pair.publicKey.export({format:'jwk'}),kid:header.kid,alg:'RS256',use:'sig'};
function token(claims=base,keyMaterial=pair.privateKey){
 const h=Buffer.from(JSON.stringify(header)).toString('base64url');
 const p=Buffer.from(JSON.stringify(claims)).toString('base64url');
 const s=createSign('RSA-SHA256');s.update(h+'.'+p);s.end();
 return h+'.'+p+'.'+s.sign(keyMaterial).toString('base64url');
}
const bToken=()=>token({...base,email:'judge-b@example.org',sub:'judge-b-stable-sub'});
function auth(extra={}){
 return {
   expectedIssuer:issuer,expectedAudience:audience,
   approvedJudgeEmails:['judge-a@example.org','judge-b@example.org'],
   trustedJwks:{keys:[jwk]},nowMs,cryptoImpl:webcrypto,
   identityBindingKey:key,...extra
 };
}
function request(path,jwt=token(),headers={}){
 return new Request(origin+path,{
  method:'POST',
  headers:{
   Origin:origin,'Sec-Fetch-Site':'same-origin',
   'Content-Type':'application/json',
   ...(jwt===null?{}:{'Cf-Access-Jwt-Assertion':jwt}),
   ...headers
  },
  body:JSON.stringify(path===JUDGE_SESSION_PATH?
   {turnstileToken:'test-fake-turnstile-proof-000001'}:
   {exampleId:'fictional-beginner-workshop'})
 });
}
function generateRequest(result,jwt=token(),headers={}){
 return request(JUDGE_API_PATH,jwt,{
   Cookie:result.setCookieTemplate.split(';',1)[0],
   'X-SocialSpark-Csrf':result.csrfToken,...headers
 });
}
function suite(){
 const map=new Map([
   [BOUND_SESSION_LEDGER_KEY,offlineBoundSessionFixture()],
   [RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
   [JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()]
 ]);
 const kv={
   get:k=>map.has(k)?structuredClone(map.get(k)):undefined,
   put:(k,v)=>map.set(k,structuredClone(v))
 };
 const transactionSync=fn=>{
   const before=new Map([...map].map(([k,v])=>[k,structuredClone(v)]));
   try{return fn();}catch(error){map.clear();for(const [k,v] of before)map.set(k,v);throw error;}
 };
 const events=[];
 const session={
   expectedOrigin:origin,expectedHostname:'judge.example.org',
   turnstileSecret:'SYNTHETIC_SECRET_NEVER_DEPLOY',nowMs,
   siteverifyTransport:async()=>{
     events.push('turnstile');
     return Response.json({
       success:true,hostname:'judge.example.org',
       action:TURNSTILE_JUDGE_ACTION,
       challenge_ts:new Date(nowMs-30000).toISOString()
     });
   },
   reserveRateSlot:async args=>{
     events.push('rate');
     return transactionSync(()=>reserveSessionIssueRateInTransaction(kv,args));
   },
   issueBoundSessionDigest:async args=>{
     events.push('bound-issue');
     return transactionSync(()=>issueBoundJudgeSessionInTransaction(kv,args));
   }
 };
 const gen={
   expectedOrigin:origin,nowMs,
   consumeBoundSessionDigest:async args=>{
     events.push('bound-consume');
     return transactionSync(()=>consumeBoundJudgeSessionInTransaction(kv,args));
   },
   checkGenerateAbuse:async()=>{events.push('abuse');return true;},
   measureInputTokens:async()=>{events.push('tokens');return 120;},
   checkVerifiedPrice:async()=>{events.push('price');return true;},
   reserveQuota:async()=>{
     events.push('quota');
     return transactionSync(()=>reserveJudgeAttemptInTransaction(kv));
   }
 };
 return {session,gen,events,kv,read:k=>kv.get(k)};
}
function deny(r){
 assert.equal(r?.accepted,false);
 assert.equal(r.providerCallsAuthorized,false);
}

test('same verified judge can issue then consume one bound session (all offline)',async()=>{
 const s=suite();
 const issuance=await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 });
 assert.equal(issuance.accepted,true);
 assert.equal(issuance.providerCallsAuthorized,false);
 assert.deepEqual(s.events,['turnstile','rate','bound-issue']);
 const bound=s.read(BOUND_SESSION_LEDGER_KEY);
 assert.equal(bound.version,2);
 assert.equal(bound.active.length,1);
 assert.match(bound.active[0].judgeBindingDigest,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(bound).includes('judge-a@example.org'),false);
 assert.equal(JSON.stringify(bound).includes('judge-a-stable-sub'),false);
 const result=await generate(generateRequest(issuance),{
   auth:auth(),generate:s.gen
 });
 assert.equal(result.accepted,true);
 assert.equal(result.providerCallsAuthorized,false);
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).consumedLifetime,1);
 assert.equal(s.read(JUDGE_QUOTA_STORAGE_KEY).attempts,1);
});

test('Judge B cannot use Judge A cookie+CSRF; real owner can still consume it',async()=>{
 const s=suite();
 const issuance=await issue(request(JUDGE_SESSION_PATH),{
  auth:auth(),session:s.session
 });
 assert.equal(issuance.accepted,true);
 const before=s.read(BOUND_SESSION_LEDGER_KEY);
 const cross=await generate(generateRequest(issuance,bToken()),{
   auth:auth(),generate:s.gen
 });
 deny(cross);
 assert.deepEqual(s.read(BOUND_SESSION_LEDGER_KEY),before);
 assert.equal(s.read(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
 assert.equal(s.events.includes('abuse'),false);
 const owner=await generate(generateRequest(issuance,token()),{
   auth:auth(),generate:s.gen
 });
 assert.equal(owner.accepted,true);
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).consumedLifetime,1);
});

test('same approved email but altered verified Access subject fails binding',async()=>{
 const s=suite();
 const issuance=await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 });
 assert.equal(issuance.accepted,true);
 const altered=token({...base,sub:'different-verified-subject'});
 deny(await generate(generateRequest(issuance,altered),{
   auth:auth(),generate:s.gen
 }));
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).consumedLifetime,0);
 assert.equal(s.read(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
});

test('changing server-side binding key denies consumption of existing session',async()=>{
 const s=suite();
 const issuance=await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 });
 deny(await generate(generateRequest(issuance),{
   auth:auth({identityBindingKey:anotherKey}),generate:s.gen
 }));
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).consumedLifetime,0);
 assert.equal(s.read(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
});

test('bad, missing and untrusted identities cannot trigger fake Turnstile or quota',async()=>{
 for(const jwt of [
   null,token(base,otherPair.privateKey),
   token({...base,exp:now-1}),
   token({...base,email:'stranger@example.org'}),
   token({...base,aud:['b'.repeat(32)]})
 ]){
   const s=suite();
   deny(await issue(request(JUDGE_SESSION_PATH,jwt),{
     auth:auth(),session:s.session
   }));
   assert.deepEqual(s.events,[]);
   assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).issuedLifetime,0);
 }
});

test('missing HMAC server key or legacy v1 callbacks fail closed',async()=>{
 const s=suite();
 const badKeys=[undefined,null,new Uint8Array(16),new Uint8Array(33),'test'];
 for(const identityBindingKey of badKeys){
   deny(await issue(request(JUDGE_SESSION_PATH),{
     auth:auth({identityBindingKey}),session:s.session
   }));
 }
 const v1Service={
   ...s.session,issueBoundSessionDigest:undefined,
   issueSessionDigest:async()=>({allowed:true})
 };
 deny(await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:v1Service
 }));
 assert.deepEqual(s.events,[]);
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).issuedLifetime,0);
});

test('missing or corrupt v2 ledger fails closed (no silent initialization)',async()=>{
 const s=suite();
 s.kv.put(BOUND_SESSION_LEDGER_KEY,{version:1,active:[]});
 deny(await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 }));
 assert.equal(s.events.includes('bound-issue'),true);
 assert.equal(s.read(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
});

test('bound session is one-use; replay cannot reach quota',async()=>{
 const s=suite();
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 });
 assert.equal((await generate(generateRequest(issued),{
   auth:auth(),generate:s.gen
 })).accepted,true);
 deny(await generate(generateRequest(issued),{
   auth:auth(),generate:s.gen
 }));
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).consumedLifetime,1);
 assert.equal(s.read(JUDGE_QUOTA_STORAGE_KEY).attempts,1);
});

test('separate signed Access tokens for same verified subject have same binding',async()=>{
 const s=suite();
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 });
 const renewed=token({...base,iat:now-10,exp:now+500});
 const result=await generate(generateRequest(issued,renewed),{
   auth:auth(),generate:s.gen
 });
 assert.equal(result.accepted,true);
});

test('server key and verified request cannot be overridden by client config request',async()=>{
 const s=suite();
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:auth(),session:s.session
 });
 const forJudgeB=generateRequest(issued,bToken());
 const forJudgeA=generateRequest(issued,token());
 const r=await generate(forJudgeB,{
   auth:auth({request:forJudgeA}),generate:s.gen
 });
 deny(r);
 assert.equal(s.read(BOUND_SESSION_LEDGER_KEY).consumedLifetime,0);
});

test('signed identity binding is scoped to application audience and issuer',async()=>{
 const req=request(JUDGE_SESSION_PATH);
 const first=await inspectOfflineJudgeAccessJwt({request:req,...auth()});
 const changed=await inspectOfflineJudgeAccessJwt({
   request:request(JUDGE_SESSION_PATH,token({...base,aud:['b'.repeat(32)]})),
   ...auth({expectedAudience:'b'.repeat(32)})
 });
 assert.equal(first.allowed,true);
 assert.equal(changed.allowed,true);
 assert.notEqual(first.judgeBindingDigest,changed.judgeBindingDigest);
 assert.equal(first.providerCallsAuthorized,false);
 assert.equal(Object.hasOwn(first,'sub'),false);
 assert.equal(Object.hasOwn(first,'email'),false);
});

test('live deployment, provider inference, and legacy production wiring remain disabled',async()=>{
 const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
 const [wrangler,worker,bridge]=await Promise.all([
   read('wrangler.jsonc'),read('cloudflare/judge-gateway-disabled-worker.mjs'),
   read('cloudflare/judge-bound-auth-offline-pipeline.mjs')
 ]);
 assert.deepEqual(Object.keys(JSON.parse(wrangler)).sort(),
   ['assets','compatibility_date','name']);
 assert.match(worker,/NEVER authorizes or invokes NVIDIA\/Nebius inference/);
 assert.doesNotMatch(worker,/judge-bound-auth-offline-pipeline/);
 assert.doesNotMatch(bridge,/fetch\s*\(/);
 assert.match(bridge,/NO route/);
});
