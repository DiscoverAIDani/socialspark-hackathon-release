/**
 * OFFLINE-ONLY Cloudflare Access JWT verification prototype for a future
 * judge-only SocialSpark gateway. No route imports this module. It has no
 * network transport, cloud credentials, real judge identity, secrets, provider
 * access, deployment activation or permission to make a billable request.
 *
 * Cloudflare docs:
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 *
 * A trusted future gateway MUST securely load/refresh its team's Access JWKS
 * (keys rotate), PIN the actual issuer/AUD and judge identity allowlist,
 * protect every entrypoint with Access, and do an owner-approved live security
 * review. A preloaded JWKS here is test input, not a key fetched from a token.
 *
 * This prototype verifies RS256 against a trusted, supplied public key and
 * then checks issuer, audience, clock, application token and judge allowlist.
 * DO NOT treat "allowed" as paid-inference authorization.
 */
const HEADER_NAME='cf-access-jwt-assertion';
const TOKEN_RE=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const SEGMENT_RE=/^[A-Za-z0-9_-]+$/;
const EMAIL_RE=/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}$/;
const deny=reason=>Object.freeze({allowed:false,reason,providerCallsAuthorized:false});
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  Object.getPrototypeOf(v)===Object.prototype;
const seconds=ms=>Math.floor(ms/1000);
const cleanEmail=e=>typeof e==='string'&&e.length<=254&&e===e.trim()?
  e.toLowerCase():null;
const validIssuer=iss=>typeof iss==='string'&&
  /^https:\/\/[a-z0-9-]{1,63}\.cloudflareaccess\.com$/.test(iss);
const validAudience=aud=>typeof aud==='string'&&
  /^[A-Za-z0-9_-]{20,128}$/.test(aud);
function decode(segment,maxBytes){
  if(typeof segment!=='string'||segment.length>maxBytes*2||
     !SEGMENT_RE.test(segment))return null;
  try{
    const decoded=atob(segment.replace(/-/g,'+').replace(/_/g,'/')+
      '='.repeat((4-segment.length%4)%4));
    if(decoded.length>maxBytes)return null;
    const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));
    // Reject ambiguous/malleable noncanonical Base64url spellings.
    const canonical=btoa(String.fromCharCode(...bytes))
      .replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    return canonical===segment?bytes:null;
  }catch{return null;}
}
function parseSegment(segment,maxBytes){
  const bytes=decode(segment,maxBytes);
  if(!bytes)return null;
  try{
    const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
    return isObject(value)?value:null;
  }catch{return null;}
}
function acceptableJwk(k,kid){
  return isObject(k)&&k.kty==='RSA'&&k.kid===kid&&
    (k.alg===undefined||k.alg==='RS256')&&
    (k.use===undefined||k.use==='sig')&&
    !['d','p','q','dp','dq','qi','oth','k'].some(x=>Object.hasOwn(k,x))&&
    typeof k.n==='string'&&/^[A-Za-z0-9_-]{300,1024}$/.test(k.n)&&
    k.e==='AQAB';
}

/** The caller provides a TRUSTED JWKS, never a URL or unverified JWT header. */
export async function inspectOfflineJudgeAccessJwt({
  request,expectedIssuer,expectedAudience,approvedJudgeEmails,
  trustedJwks,nowMs,cryptoImpl=globalThis.crypto,identityBindingKey
}={}){
  if(!(request instanceof Request))return deny('request-required');
  if(!validIssuer(expectedIssuer)||!validAudience(expectedAudience)||
     !Array.isArray(approvedJudgeEmails)||approvedJudgeEmails.length<1||
     approvedJudgeEmails.length>100||
     !approvedJudgeEmails.every(e=>cleanEmail(e)===e&&EMAIL_RE.test(e))||
     !isObject(trustedJwks)||!Array.isArray(trustedJwks.keys)||
     trustedJwks.keys.length<1||trustedJwks.keys.length>16||
     !Number.isSafeInteger(nowMs)||nowMs<=0||
     !cryptoImpl?.subtle?.importKey||!cryptoImpl?.subtle?.verify)
    return deny('auth-configuration-unavailable');

  const token=request.headers.get(HEADER_NAME);
  if(typeof token!=='string'||token.length>8192||!TOKEN_RE.test(token))
    return deny('missing-or-invalid-access-token');
  const segments=token.split('.');
  if(segments.length!==3)return deny('invalid-access-token');
  const [h,p,s]=segments;
  const header=parseSegment(h,1024),payload=parseSegment(p,4096);
  const signature=decode(s,1024);
  if(!header||!payload||!signature||signature.length<256||
     header.alg!=='RS256'||
     (header.typ!==undefined&&header.typ!=='JWT')||
     typeof header.kid!=='string'||header.kid.length>128||
     !/^[A-Za-z0-9_-]+$/.test(header.kid)||
     Object.hasOwn(header,'jku')||Object.hasOwn(header,'jwk')||
     Object.hasOwn(header,'x5u')||Object.hasOwn(header,'crit'))
    return deny('access-token-header-rejected');
  const matches=trustedJwks.keys.filter(k=>acceptableJwk(k,header.kid));
  if(matches.length!==1)return deny('access-signing-key-unavailable');

  try{
    const k=matches[0];
    const key=await cryptoImpl.subtle.importKey('jwk',{
      kty:'RSA',n:k.n,e:k.e,alg:'RS256',ext:true,key_ops:['verify']
    },{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
    const signedBytes=new TextEncoder().encode(h+'.'+p);
    const valid=await cryptoImpl.subtle.verify(
      {name:'RSASSA-PKCS1-v1_5'},key,signature,signedBytes);
    if(valid!==true)return deny('access-token-signature-rejected');
  }catch{return deny('access-signature-verification-unavailable');}

  const aud=payload.aud;
  const validAud=aud===expectedAudience ||
    (Array.isArray(aud)&&aud.length>0&&aud.length<=12&&
     aud.every(v=>typeof v==='string')&&aud.includes(expectedAudience));
  const now=seconds(nowMs);
  if(payload.iss!==expectedIssuer||!validAud||
     payload.type!=='app'||
     !Number.isSafeInteger(payload.iat)||payload.iat>now+60||
     !Number.isSafeInteger(payload.exp)||payload.exp<=now||
     payload.exp<=payload.iat||
     (payload.nbf!==undefined&&
      (!Number.isSafeInteger(payload.nbf)||payload.nbf>now+60))||
     typeof payload.sub!=='string'||payload.sub.length<1||
     payload.sub.length>256)
    return deny('access-token-claims-rejected');

  const email=cleanEmail(payload.email);
  if(!email||!EMAIL_RE.test(email)||!approvedJudgeEmails.includes(email))
    return deny('judge-identity-not-approved');

  // Optional offline v2 identity binding. The server-only 256-bit key is
  // REQUIRED by v2; never derive this from email alone, nor accept it from
  // browser input. This value must never be returned by a public HTTP route.
  // Legacy offline callers that omit the key remain non-binding prototypes.
  let judgeBindingDigest;
  if(identityBindingKey!==undefined){
    if(!(identityBindingKey instanceof Uint8Array)||
       identityBindingKey.byteLength!==32||
       !cryptoImpl?.subtle?.sign)
      return deny('identity-binding-unavailable');
    try{
      const key=await cryptoImpl.subtle.importKey('raw',identityBindingKey,
        {name:'HMAC',hash:'SHA-256'},false,['sign']);
      const canonical=JSON.stringify([
        'socialspark-judge-subject-binding-v2',
        expectedIssuer,expectedAudience,payload.sub
      ]);
      const mac=await cryptoImpl.subtle.sign('HMAC',key,
        new TextEncoder().encode(canonical));
      judgeBindingDigest=Array.from(new Uint8Array(mac),
        b=>b.toString(16).padStart(2,'0')).join('');
      if(!/^[a-f0-9]{64}$/.test(judgeBindingDigest))
        return deny('identity-binding-unavailable');
    }catch{return deny('identity-binding-unavailable');}
  }
  // Never return a raw email, subject, bearer token or identity key.
  return Object.freeze({
    allowed:true,reason:'offline-judge-jwt-verified',
    providerCallsAuthorized:false,
    ...(judgeBindingDigest?{judgeBindingDigest}:{})
  });
}
