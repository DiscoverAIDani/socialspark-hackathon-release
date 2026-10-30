/**
 * OFFLINE v2 identity-bound judge sessions. DISTINCT from the old v1 mock
 * ledger: DO NOT migrate/reset v1 in a live service, or bind this to Wrangler.
 *
 * Hashed cookie and CSRF values are coupled to a server-keyed HMAC digest of
 * a VERIFIED signed Access subject (issuer + app audience + subject).
 * Identity digest is opaque; no emails, raw IDs, cookies or tokens in storage.
 * Every issue/consume runs in ONE atomic SQLite Durable Object transaction.
 *
 * NO provider transport, HTTP route, production bindings, startup fixture,
 * live provisioner, credentials, or permission to incur charges.
 */
import {SESSION_TTL_MS,MAX_ACTIVE_SESSIONS,
  MAX_ISSUED_SESSIONS_LIFETIME} from './judge-session-core.mjs';

export const BOUND_SESSION_LEDGER_KEY='judge-sessions-v2-bound';
export const BOUND_SESSION_INSTANCE_NAME='socialspark-judge-bound-session-v2';
const HEX=/^[a-f0-9]{64}$/;
const deny=reason=>Object.freeze({allowed:false,reason});
const plain=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&
  Object.getPrototypeOf(o)===Object.prototype&&
  Object.keys(o).length===keys.length&&keys.every(k=>Object.hasOwn(o,k));
const nonneg=v=>Number.isSafeInteger(v)&&v>=0;
const goodArgs=a=>plain(a,['sessionHash','csrfHash','judgeBindingDigest','nowMs'])&&
  HEX.test(a.sessionHash)&&HEX.test(a.csrfHash)&&HEX.test(a.judgeBindingDigest)&&
  a.sessionHash!==a.csrfHash&&Number.isSafeInteger(a.nowMs)&&a.nowMs>0&&
  a.nowMs<=Number.MAX_SAFE_INTEGER-SESSION_TTL_MS;
function goodState(v){
  if(!plain(v,['version','issuedLifetime','consumedLifetime','revision','active'])||
     v.version!==2||!nonneg(v.issuedLifetime)||
     v.issuedLifetime>MAX_ISSUED_SESSIONS_LIFETIME||
     !nonneg(v.consumedLifetime)||v.consumedLifetime>v.issuedLifetime||
     !nonneg(v.revision)||v.revision!==v.issuedLifetime+v.consumedLifetime||
     !Array.isArray(v.active)||v.active.length>MAX_ACTIVE_SESSIONS||
     v.active.length>v.issuedLifetime-v.consumedLifetime)return false;
  const names=new Set(),csfr=new Set();
  for(const a of v.active){
    if(!plain(a,['sessionHash','csrfHash','judgeBindingDigest','expiresAt'])||
       !HEX.test(a.sessionHash)||!HEX.test(a.csrfHash)||
       !HEX.test(a.judgeBindingDigest)||a.sessionHash===a.csrfHash||
       !nonneg(a.expiresAt)||a.expiresAt===0||names.has(a.sessionHash)||
       csfr.has(a.csrfHash))return false;
    names.add(a.sessionHash);csfr.add(a.csrfHash);
  }
  return true;
}
/** Local tests only. A production ledger must NEVER auto-initialize. */
export function offlineBoundSessionFixture(){
  return {version:2,issuedLifetime:0,consumedLifetime:0,revision:0,active:[]};
}
export function issueBoundJudgeSessionInTransaction(kv,args){
  if(!kv||typeof kv.get!=='function'||typeof kv.put!=='function')
    return deny('bound-storage-unavailable');
  if(!goodArgs(args))return deny('invalid-bound-session');
  try{
    const old=kv.get(BOUND_SESSION_LEDGER_KEY);
    if(!goodState(old))return deny('bound-ledger-missing-or-corrupt');
    if(old.issuedLifetime>=MAX_ISSUED_SESSIONS_LIFETIME)
      return deny('bound-session-lifetime-exhausted');
    const active=old.active.filter(a=>a.expiresAt>args.nowMs);
    if(active.length>=MAX_ACTIVE_SESSIONS)return deny('bound-active-session-limit');
    if(active.some(a=>a.sessionHash===args.sessionHash||a.csrfHash===args.csrfHash))
      return deny('bound-session-duplicate');
    kv.put(BOUND_SESSION_LEDGER_KEY,{
      ...old,issuedLifetime:old.issuedLifetime+1,revision:old.revision+1,
      active:[...active,{
        sessionHash:args.sessionHash,csrfHash:args.csrfHash,
        judgeBindingDigest:args.judgeBindingDigest,
        expiresAt:args.nowMs+SESSION_TTL_MS
      }]
    });
    return Object.freeze({allowed:true,reason:'offline-bound-session-issued'});
  }catch{throw Error('bound-session-storage-write-failed');}
}
export function consumeBoundJudgeSessionInTransaction(kv,args){
  if(!kv||typeof kv.get!=='function'||typeof kv.put!=='function')
    return deny('bound-storage-unavailable');
  if(!goodArgs(args))return deny('invalid-bound-session');
  try{
    const old=kv.get(BOUND_SESSION_LEDGER_KEY);
    if(!goodState(old))return deny('bound-ledger-missing-or-corrupt');
    const idx=old.active.findIndex(a=>
      a.sessionHash===args.sessionHash&&a.csrfHash===args.csrfHash);
    if(idx<0)return deny('bound-session-absent-or-replayed');
    const item=old.active[idx];
    if(item.expiresAt<=args.nowMs)return deny('bound-session-expired');
    // On identity mismatch: DO NOT consume owner's session or quota.
    // A later valid judge request can still use its own cookie+CSRF pair.
    if(item.judgeBindingDigest!==args.judgeBindingDigest)
      return deny('bound-session-not-owned-by-judge');
    kv.put(BOUND_SESSION_LEDGER_KEY,{
      ...old,consumedLifetime:old.consumedLifetime+1,revision:old.revision+1,
      active:old.active.filter((_,i)=>i!==idx)
    });
    return Object.freeze({allowed:true,reason:'offline-bound-session-consumed'});
  }catch{throw Error('bound-session-storage-write-failed');}
}
