/**
 * Step 14J: offline, unbound one-use session / CSRF-token state machine.
 *
 * A future HTTPS gateway must place the session secret in a Secure, HttpOnly,
 * SameSite=Strict __Host- cookie and send the *different* CSRF secret to its
 * same-origin page. Both MUST be verified and consumed in one transaction.
 *
 * This module has NO HTTP endpoints, Nebius client, deployment, public
 * authorization, or implicit storage initialization. Never store raw tokens,
 * prompts, cookies, IP addresses or user identifiers in the ledger.
 *
 * A public token issuer needs independently enforced anti-abuse controls.
 * Sessions prevent accidental reuse / CSRF; they are NOT user authentication.
 */
export const JUDGE_SESSION_LEDGER_KEY = 'judge-sessions-v1';
export const JUDGE_SESSION_INSTANCE_NAME = 'socialspark-judge-session-coordinator-v1';
export const SESSION_TTL_MS = 120_000;
export const MAX_ACTIVE_SESSIONS = 16;
export const MAX_ISSUED_SESSIONS_LIFETIME = 1000;
export const SESSION_COOKIE_NAME = '__Host-SocialSparkJudge';
const SECRET_RE = /^[a-f0-9]{64}$/;
const DIGEST_RE = /^[a-f0-9]{64}$/;
const deny = reason => Object.freeze({allowed:false,reason});

const ownKeys=(obj,keys)=>!!obj && Object.getPrototypeOf(obj)===Object.prototype &&
  Object.keys(obj).length===keys.length && keys.every(key=>Object.hasOwn(obj,key));
const goodInt=n=>Number.isSafeInteger(n) && n>=0;

function validState(state) {
  if(!ownKeys(state,['version','issuedLifetime','consumedLifetime','revision','active']) ||
     state.version!==1 || !goodInt(state.issuedLifetime) ||
     state.issuedLifetime>MAX_ISSUED_SESSIONS_LIFETIME ||
     !goodInt(state.consumedLifetime) || state.consumedLifetime>state.issuedLifetime ||
     !goodInt(state.revision) || state.revision!==state.issuedLifetime+state.consumedLifetime ||
     !Array.isArray(state.active) || state.active.length>MAX_ACTIVE_SESSIONS ||
     state.active.length>state.issuedLifetime-state.consumedLifetime) return false;
  const unique=new Set();
  for(const record of state.active){
    if(!ownKeys(record,['sessionHash','csrfHash','expiresAt']) ||
       !DIGEST_RE.test(record.sessionHash) || !DIGEST_RE.test(record.csrfHash) ||
       record.sessionHash===record.csrfHash ||
       !goodInt(record.expiresAt) || record.expiresAt===0 ||
       unique.has(record.sessionHash)) return false;
    unique.add(record.sessionHash);
  }
  return true;
}

/** Test-only fixture. No production reset or provisioning method exists. */
export function offlineSessionFixture() {
  return {version:1,issuedLifetime:0,consumedLifetime:0,revision:0,active:[]};
}

/** Generate independent, cryptographically random 256-bit secrets. */
export function generateJudgeSessionSecrets(webCrypto=globalThis.crypto) {
  if(typeof webCrypto?.getRandomValues!=='function')throw Error('crypto-unavailable');
  const hex=()=>Array.from(webCrypto.getRandomValues(new Uint8Array(32)),
    byte=>byte.toString(16).padStart(2,'0')).join('');
  const cookieSecret=hex(),csrfSecret=hex();
  if(!SECRET_RE.test(cookieSecret) || !SECRET_RE.test(csrfSecret) || cookieSecret===csrfSecret)
    throw Error('crypto-unavailable');
  return Object.freeze({cookieSecret,csrfSecret});
}

async function hashSecret(secret,label,webCrypto) {
  if(!SECRET_RE.test(secret)||typeof webCrypto?.subtle?.digest!=='function')
    throw Error('token-invalid');
  const raw=new TextEncoder().encode('socialspark-judge-v1:'+label+':'+secret);
  const digest=await webCrypto.subtle.digest('SHA-256',raw);
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}

/** The only values that may reach durable storage are the digests. */
export async function hashJudgeSessionSecrets(secrets,webCrypto=globalThis.crypto) {
  if(!ownKeys(secrets,['cookieSecret','csrfSecret']))throw Error('token-invalid');
  const [sessionHash,csrfHash]=await Promise.all([
    hashSecret(secrets.cookieSecret,'cookie',webCrypto),
    hashSecret(secrets.csrfSecret,'csrf',webCrypto)
  ]);
  return Object.freeze({sessionHash,csrfHash});
}

function validArgs({sessionHash,csrfHash,nowMs}={}) {
  return typeof sessionHash==='string' && DIGEST_RE.test(sessionHash) &&
    typeof csrfHash==='string' && DIGEST_RE.test(csrfHash) &&
    sessionHash!==csrfHash &&
    Number.isSafeInteger(nowMs) && nowMs>0 && nowMs<=Number.MAX_SAFE_INTEGER-SESSION_TTL_MS;
}

/** Must execute fully within ctx.storage.transactionSync(). */
export function issueJudgeSessionInTransaction(kv,args) {
  if(!kv || typeof kv.get!=='function' || typeof kv.put!=='function')
    return deny('session-storage-unavailable');
  if(!validArgs(args))return deny('invalid-session-arguments');
  try {
    const current=kv.get(JUDGE_SESSION_LEDGER_KEY);
    if(!validState(current))return deny('session-ledger-missing-or-invalid');
    if(current.issuedLifetime>=MAX_ISSUED_SESSIONS_LIFETIME)return deny('session-issuance-exhausted');
    const active=current.active.filter(item=>item.expiresAt>args.nowMs);
    if(active.length>=MAX_ACTIVE_SESSIONS)return deny('too-many-outstanding-sessions');
    if(active.some(item=>item.sessionHash===args.sessionHash))return deny('duplicate-session');
    kv.put(JUDGE_SESSION_LEDGER_KEY,{
      ...current,
      issuedLifetime:current.issuedLifetime+1,
      revision:current.revision+1,
      active:[...active,{
        sessionHash:args.sessionHash,csrfHash:args.csrfHash,
        expiresAt:args.nowMs+SESSION_TTL_MS
      }]
    });
    return Object.freeze({allowed:true,reason:'offline-session-issued'});
  }catch {throw Error('session-storage-write-failed');}
}

/** A successful consume deletes the pair before any model call. Never retry. */
export function consumeJudgeSessionInTransaction(kv,args) {
  if(!kv || typeof kv.get!=='function' || typeof kv.put!=='function')
    return deny('session-storage-unavailable');
  if(!validArgs(args))return deny('invalid-session-arguments');
  try {
    const current=kv.get(JUDGE_SESSION_LEDGER_KEY);
    if(!validState(current))return deny('session-ledger-missing-or-invalid');
    const index=current.active.findIndex(item=>item.sessionHash===args.sessionHash &&
      item.csrfHash===args.csrfHash);
    if(index<0)return deny('session-not-found-or-replayed');
    if(current.active[index].expiresAt<=args.nowMs)return deny('session-expired');
    kv.put(JUDGE_SESSION_LEDGER_KEY,{
      ...current,consumedLifetime:current.consumedLifetime+1,
      revision:current.revision+1,
      active:current.active.filter((_,i)=>i!==index)
    });
    return Object.freeze({allowed:true,reason:'offline-session-consumed'});
  }catch {throw Error('session-storage-write-failed');}
}

/** Produces a cookie TEMPLATE; no HTTP issuance route is implemented here. */
export function formatSecureJudgeCookie(cookieSecret) {
  if(typeof cookieSecret!=='string' || !SECRET_RE.test(cookieSecret))throw Error('token-invalid');
  return SESSION_COOKIE_NAME+'='+cookieSecret+'; Path=/; Max-Age=120; Secure; HttpOnly; SameSite=Strict';
}
