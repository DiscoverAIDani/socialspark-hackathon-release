/**
 * ALL OFFLINE: synthetic RSA keypair/JWT and simulated Turnstile + Durable
 * Object ledgers. No Cloudflare Access, provider call, real bill or deployment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {offlineAuthenticatedIssueJudgeSession as issue,
  offlineAuthenticatedCheckJudgeGenerate as generate}
  from '../cloudflare/judge-authenticated-offline-pipeline.mjs';
import {JUDGE_SESSION_PATH} from '../cloudflare/judge-offline-pipeline.mjs';
import {JUDGE_API_PATH} from '../cloudflare/judge-gateway-core.mjs';
import {TURNSTILE_JUDGE_ACTION} from '../cloudflare/judge-turnstile-core.mjs';
import {offlineSessionFixture,JUDGE_SESSION_LEDGER_KEY,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction}
  from '../cloudflare/judge-session-core.mjs';
import {offlineRateFixture,RATE_LIMIT_LEDGER_KEY,
  reserveSessionIssueRateInTransaction}
  from '../cloudflare/judge-rate-core.mjs';
import {offlineFixtureState,JUDGE_QUOTA_STORAGE_KEY,
  reserveJudgeAttemptInTransaction}
  from '../cloudflare/judge-quota-core.mjs';

const ORIGIN='https://judge.example.org';
const NOW=Date.UTC(2026,11,10,12,0);
const CLOCK=Math.floor(NOW/1000);
const ISSUER='https://examplename.cloudflareaccess.com';
const AUD='a'.repeat(32);
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const other=generateKeyPairSync('rsa',{modulusLength:2048});
const HEADER={alg:'RS256',typ:'JWT',kid:'offline-test-key'};
const CLAIMS={
  iss:ISSUER,aud:[AUD],type:'app',
  iat:CLOCK-30,nbf:CLOCK-30,exp:CLOCK+600,
  email:'judge@example.org',sub:'synthetic-judge-identity'
};
const jwk={...publicKey.export({format:'jwk'}),kid:HEADER.kid,alg:'RS256',use:'sig'};
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function signedJwt(claims=CLAIMS,header=HEADER,key=privateKey){
  const parts=b64(header)+'.'+b64(claims);
  const signed=createSign('RSA-SHA256');
  signed.update(parts); signed.end();
  return parts+'.'+signed.sign(key).toString('base64url');
}
const authFor=(more={})=>({
 expectedIssuer:ISSUER,expectedAudience:AUD,
 approvedJudgeEmails:['judge@example.org'],
 trustedJwks:{keys:[jwk]},nowMs:NOW,cryptoImpl:webcrypto,...more
});
function storeFixture(){
  const map=new Map([
    [JUDGE_SESSION_LEDGER_KEY,offlineSessionFixture()],
    [RATE_LIMIT_LEDGER_KEY,offlineRateFixture()],
    [JUDGE_QUOTA_STORAGE_KEY,offlineFixtureState()]
  ]);
  const kv={
    get:k=>map.has(k)?structuredClone(map.get(k)):undefined,
    put:(k,v)=>map.set(k,structuredClone(v))
  };
  const transact=fn=>{
    const snapshot=new Map([...map].map(([k,v])=>[k,structuredClone(v)]));
    try{return fn();}
    catch(error){map.clear();for(const [k,v] of snapshot)map.set(k,v);throw error;}
  };
  return {kv,transact,read:k=>kv.get(k)};
}
function fixture(){
 const store=storeFixture(),calls=[];
 const session={
   expectedOrigin:ORIGIN,
   expectedHostname:'judge.example.org',
   turnstileSecret:'ONLY_A_FAKE_TURNSTILE_SECRET',
   nowMs:NOW,
   siteverifyTransport:async()=>{
     calls.push('turnstile');
     return Response.json({
       success:true,hostname:'judge.example.org',
       action:TURNSTILE_JUDGE_ACTION,
       challenge_ts:new Date(NOW-30_000).toISOString()
     });
   },
   reserveRateSlot:async args=>{
     calls.push('rate');
     return store.transact(()=>reserveSessionIssueRateInTransaction(store.kv,args));
   },
   issueSessionDigest:async args=>{
     calls.push('issue');
     return store.transact(()=>issueJudgeSessionInTransaction(store.kv,args));
   }
 };
 const generateOptions={
   expectedOrigin:ORIGIN,nowMs:NOW,
   consumeSessionDigest:async args=>{
     calls.push('consume');
     return store.transact(()=>consumeJudgeSessionInTransaction(store.kv,args));
   },
   checkGenerateAbuse:async()=>{calls.push('abuse');return true;},
   measureInputTokens:async()=>{calls.push('tokens');return 120;},
   checkVerifiedPrice:async()=>{calls.push('pricing');return true;},
   reserveQuota:async()=>{calls.push('quota');
     return store.transact(()=>reserveJudgeAttemptInTransaction(store.kv));}
 };
 return {session,generate:generateOptions,calls,store};
}
function request(path,token=signedJwt(),headers={}){
 return new Request(ORIGIN+path,{
   method:'POST',
   headers:{
     'Origin':ORIGIN,'Sec-Fetch-Site':'same-origin',
     'Content-Type':'application/json',
     ...(token!==null?{'Cf-Access-Jwt-Assertion':token}:{}),
     ...headers
   },
   body:JSON.stringify(path===JUDGE_SESSION_PATH?
     {turnstileToken:'synthetic-turnstile-token-0001'}:
     {exampleId:'fictional-beginner-workshop'})
 });
}
function generateRequest(issued,token=signedJwt(),headers={}){
 return request(JUDGE_API_PATH,token,{
   Cookie:issued.setCookieTemplate.split(';',1)[0],
   'X-SocialSpark-Csrf':issued.csrfToken,...headers
 });
}
const denied=r=>{
 assert.equal(r.accepted,false);
 assert.equal(r.providerCallsAuthorized,false);
};

test('signed judge identity is required for both mock session and mock generate',async()=>{
 const s=fixture();
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor(),session:s.session
 });
 assert.equal(issued.accepted,true);
 assert.equal(issued.providerCallsAuthorized,false);
 assert.deepEqual(s.calls,['turnstile','rate','issue']);

 const result=await generate(generateRequest(issued),{
   auth:authFor(),generate:s.generate
 });
 assert.deepEqual(result,{
   accepted:true,code:'offline-preflight-only',
   exampleId:'fictional-beginner-workshop',providerCallsAuthorized:false
 });
 assert.deepEqual(s.calls,['turnstile','rate','issue','consume','abuse','tokens','pricing','quota']);
 assert.equal(s.store.read(JUDGE_QUOTA_STORAGE_KEY).attempts,1);
});

test('missing, forged and wrong-identity tokens cannot mint a session',async()=>{
 for(const token of [
   null,
   signedJwt(CLAIMS,HEADER,other.privateKey),
   signedJwt({...CLAIMS,email:'unauthorized@example.org'}),
   signedJwt({...CLAIMS,exp:CLOCK-5}),
   signedJwt({...CLAIMS,aud:['b'.repeat(32)]}),
   signedJwt({...CLAIMS,type:'org'})
 ]){
   const s=fixture();
   const result=await issue(request(JUDGE_SESSION_PATH,token),{
     auth:authFor(),session:s.session
   });
   denied(result);
   assert.equal(result.code,'judge-access-denied');
   assert.deepEqual(s.calls,[],'denied before fake Turnstile and database');
   assert.equal(s.store.read(JUDGE_SESSION_LEDGER_KEY).issuedLifetime,0);
 }
});

test('an expired or forged token cannot consume an existing session or quota',async()=>{
 const s=fixture();
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor(),session:s.session
 });
 assert.equal(issued.accepted,true);
 const before=s.store.read(JUDGE_QUOTA_STORAGE_KEY);
 for(const token of [
   null,signedJwt(CLAIMS,HEADER,other.privateKey),
   signedJwt({...CLAIMS,email:'not-a-judge@example.org'}),
   signedJwt({...CLAIMS,exp:CLOCK-1})
 ]){
   denied(await generate(generateRequest(issued,token),{
     auth:authFor(),generate:s.generate
   }));
 }
 assert.equal(s.store.read(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,0);
 assert.deepEqual(s.store.read(JUDGE_QUOTA_STORAGE_KEY),before);
 assert.deepEqual(s.calls,['turnstile','rate','issue']);
 const success=await generate(generateRequest(issued),{
   auth:authFor(),generate:s.generate
 });
 assert.equal(success.accepted,true);
});

test('authentication success does not bypass CSRF, token/pricing, or quota gates',async()=>{
 const s=fixture();
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor(),session:s.session
 });
 denied(await generate(generateRequest(issued,signedJwt(),{
   'X-SocialSpark-Csrf':'wrong'
 }),{auth:authFor(),generate:s.generate}));
 assert.equal(s.store.read(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,0);

 const s2=fixture();
 const issued2=await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor(),session:s2.session
 });
 denied(await generate(generateRequest(issued2),{
   auth:authFor(),generate:{...s2.generate,checkVerifiedPrice:async()=>false}
 }));
 assert.equal(s2.store.read(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
});

test('configuration cannot substitute a different signed request for the actual request',async()=>{
 const s=fixture();
 const forged=signedJwt(CLAIMS,HEADER,other.privateKey);
 const realRequest=request(JUDGE_SESSION_PATH,forged);
 const auth=authFor({request:request(JUDGE_SESSION_PATH,signedJwt())});
 const result=await issue(realRequest,{auth,session:s.session});
 denied(result);
 assert.equal(result.code,'judge-access-denied');
 assert.deepEqual(s.calls,[]);
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor(),session:s.session
 });
 assert.equal(issued.accepted,true);
 const fakeGen=generateRequest(issued,forged);
 const goodGen=generateRequest(issued,signedJwt());
 const outcome=await generate(fakeGen,{
   auth:authFor({request:goodGen}),generate:s.generate
 });
 denied(outcome);
 assert.equal(s.store.read(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,0);
 assert.equal(s.store.read(JUDGE_QUOTA_STORAGE_KEY).attempts,0);
});

test('missing Access config or simulated services fails closed without side effects',async()=>{
 const s=fixture();
 denied(await issue(request(JUDGE_SESSION_PATH),{session:s.session}));
 denied(await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor({trustedJwks:null}),session:s.session
 }));
 denied(await issue(request(JUDGE_SESSION_PATH),{auth:authFor()}));
 assert.deepEqual(s.calls,[]);
 const issued=await issue(request(JUDGE_SESSION_PATH),{
   auth:authFor(),session:s.session
 });
 assert.equal(issued.accepted,true);
 denied(await generate(generateRequest(issued),{
   auth:authFor({trustedJwks:null}),generate:s.generate
 }));
 denied(await generate(generateRequest(issued),{auth:authFor()}));
 assert.equal(s.store.read(JUDGE_SESSION_LEDGER_KEY).consumedLifetime,0);
});

test('full mock flow is still absent from production Worker and static configuration',async()=>{
 const root=new URL('../',import.meta.url);
 const load=p=>readFile(new URL(p,root),'utf8');
 const [config,wrapper,disabled]=await Promise.all([
   load('wrangler.jsonc'),
   load('cloudflare/judge-authenticated-offline-pipeline.mjs'),
   load('cloudflare/judge-gateway-disabled-worker.mjs')
 ]);
 assert.deepEqual(Object.keys(JSON.parse(config)).sort(),
   ['assets','compatibility_date','name']);
 assert.match(wrapper,/OFFLINE ONLY/);
 assert.doesNotMatch(wrapper,/fetch\s*\(/);
 assert.doesNotMatch(disabled,/judge-authenticated-offline-pipeline/);
 assert.match(disabled,/NOT REGISTERED IN WRANGLER/);
});
