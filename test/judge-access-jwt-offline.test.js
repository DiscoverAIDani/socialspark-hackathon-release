/**
 * Synthetic Cloudflare Access RS256 tokens only. No remote key fetch, login,
 * secret, deployment, or model request. Keys generated in memory for tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createSign,webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {inspectOfflineJudgeAccessJwt as verify} from
  '../cloudflare/judge-access-jwt-offline.mjs';

const keys=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});
const otherKeys=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:65537});
const issuer='https://exampleteam.cloudflareaccess.com';
const audience='a'.repeat(32);
const nowMs=Date.UTC(2026,11,10,12,0,0);
const now=Math.floor(nowMs/1000);
const header={alg:'RS256',typ:'JWT',kid:'test-kid-1'};
const payload={
 type:'app',iss:issuer,aud:[audience],
 iat:now-30,exp:now+600,nbf:now-30,
 email:'judge@example.org',sub:'synthetic-user-123'
};
const jwk={...keys.publicKey.export({format:'jwk'}),
 kid:'test-kid-1',alg:'RS256',use:'sig'};
const trustedJwks={keys:[jwk]};
const encode=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');
function sign(p=payload,h=header,privateKey=keys.privateKey){
 const part=encode(h)+'.'+encode(p);
 const signer=createSign('RSA-SHA256');
 signer.update(part);
 signer.end();
 return part+'.'+signer.sign(privateKey).toString('base64url');
}
const request=token=>new Request('https://judge.example.org/api/judge-demo/generate',{
 headers:token===null?{}:{'Cf-Access-Jwt-Assertion':token}
});
const auth=async(token=sign(),overrides={})=>verify({
 request:request(token),expectedIssuer:issuer,expectedAudience:audience,
 approvedJudgeEmails:['judge@example.org'],trustedJwks,
 nowMs,cryptoImpl:webcrypto,...overrides
});
const denied=async(token,opts)=>{
 const r=await auth(token,opts);
 assert.equal(r.allowed,false);
 assert.equal(r.providerCallsAuthorized,false);
 assert.equal(Object.hasOwn(r,'email'),false);
 return r.reason;
};

test('synthetic RS256 signature and trusted judge identity pass offline verification',async()=>{
 const r=await auth();
 assert.deepEqual(r,{
   allowed:true,reason:'offline-judge-jwt-verified',
   providerCallsAuthorized:false
 });
});

test('missing, oversized, malformed and noncanonical tokens are rejected',async()=>{
 await denied(null);
 await denied('not.a.jwt');
 await denied(sign()+'A'.repeat(9000));
 const broken=sign().split('.');
 broken[0]+='=';await denied(broken.join('.'));
});

test('valid-looking token with a forged signature or unknown kid is rejected',async()=>{
 const r=await denied(sign(payload,header,otherKeys.privateKey));
 assert.equal(r,'access-token-signature-rejected');
 await denied(sign(payload,{...header,kid:'different-key'}));
});

test('header cannot override signature key source or algorithm',async()=>{
 await denied(sign(payload,{...header,alg:'none'}));
 await denied(sign(payload,{...header,alg:'HS256'}));
 await denied(sign(payload,{...header,jku:'https://attacker.invalid/jwks'}));
 await denied(sign(payload,{...header,jwk}));
 await denied(sign(payload,{...header,x5u:'https://attacker.invalid/key'}));
});

test('signature valid but wrong issuer, audience or token type is denied',async()=>{
 await denied(sign({...payload,iss:'https://other.cloudflareaccess.com'}));
 await denied(sign({...payload,aud:['b'.repeat(32)]}));
 await denied(sign({...payload,type:'org'}));
});

test('expired, future, invalid and reversed time claims are denied',async()=>{
 await denied(sign({...payload,exp:now-1}));
 await denied(sign({...payload,iat:now+300}));
 await denied(sign({...payload,nbf:now+300}));
 await denied(sign({...payload,iat:now+800,exp:now+400}));
 await denied(sign({...payload,exp:String(now+400)}));
});

test('no judge allowlist, unapproved identity or service account is denied',async()=>{
 await denied(sign(payload),{approvedJudgeEmails:[]});
 await denied(sign({...payload,email:'stranger@example.org'}));
 await denied(sign({...payload,email:undefined}));
 await denied(sign({...payload,email:'judge@example.org',sub:''}));
 await denied(sign({...payload,sub:'',common_name:'service-account'}));
});

test('verified identity comparison is case-insensitive without leaking identity',async()=>{
 const r=await auth(sign({...payload,email:'Judge@Example.Org'}));
 assert.equal(r.allowed,true);
 assert.equal(Object.hasOwn(r,'judgeEmail'),false);
});

test('missing, malformed, mismatched, or private signing keys fail closed',async()=>{
 await denied(sign(),{trustedJwks:null});
 await denied(sign(),{trustedJwks:{keys:[]}});
 await denied(sign(),{trustedJwks:{keys:[{...jwk,d:'a'}]}});
 await denied(sign(),{trustedJwks:{keys:[jwk,jwk]}});
 await denied(sign(),{trustedJwks:{keys:[{...jwk,kid:'other'}]}});
});

test('key rotation cannot bypass pinning: new key requires trusted JWKS update',async()=>{
 const newer={...otherKeys.publicKey.export({format:'jwk'}),
  kid:'test-kid-2',alg:'RS256',use:'sig'};
 const token=sign(payload,{...header,kid:'test-kid-2'},otherKeys.privateKey);
 await denied(token);
 const r=await auth(token,{trustedJwks:{keys:[jwk,newer]}});
 assert.equal(r.allowed,true);
});

test('cryptographic service unavailable and wrong app configuration deny',async()=>{
 await denied(sign(),{cryptoImpl:{subtle:{}}});
 await denied(sign(),{expectedIssuer:'https://evil.example/'});
 await denied(sign(),{expectedAudience:'wrong'});
});

test('production static-only state remains unchanged and verifier is inert',async()=>{
 const root=new URL('../',import.meta.url);
 const read=path=>readFile(new URL(path,root),'utf8');
 const [config,source,worker]=await Promise.all([
  read('wrangler.jsonc'),read('cloudflare/judge-access-jwt-offline.mjs'),
  read('cloudflare/judge-gateway-disabled-worker.mjs')
 ]);
 assert.equal(Object.hasOwn(JSON.parse(config),'main'),false);
 assert.doesNotMatch(source,/fetch\s*\(|https:\/\/[^'"\s]+\/api\/v1/);
 assert.match(source,/OFFLINE-ONLY/);
 assert.match(worker,/NOT REGISTERED IN WRANGLER/);
});
