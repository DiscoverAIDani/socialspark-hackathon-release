/**
 * Step 14K: OFFLINE global session-issuance rate limiter for a future
 * SQLite-backed Cloudflare Durable Object.
 *
 * No HTTP handler, networking, provider request, keys, anonymous identifier
 * tracking, or live activation. This is intentionally NOT a production-ready
 * anti-bot control. A global limit alone cannot prevent an attacker from
 * exhausting legitimate judges' access; a separately reviewed server-side
 * Turnstile challenge and further abuse checks are required before rollout.
 *
 * All judges must use ONE canonical Durable Object. The storage is never
 * auto-provisioned, auto-repaired or reset. On storage errors, fail closed.
 * This counts ALLOWED session-issuance attempts (even if later steps fail).
 */
export const RATE_LIMIT_INSTANCE_NAME='socialspark-global-session-rate-v1';
export const RATE_LIMIT_LEDGER_KEY='global-session-issue-rate-v1';

export const RATE_LIMIT_POLICY=Object.freeze({
  perMinute:3,
  perHour:20,
  perDay:60,
  lifetime:1000,
  windowType:'fixed-utc',
  liveEnabled:false
});

const denial=reason=>Object.freeze({allowed:false,reason});
const REQUIRED_FIELDS=Object.freeze([
  'version','minuteBucket','hourBucket','dayBucket',
  'minuteCount','hourCount','dayCount','lifetimeCount','revision'
]);
const natural=n=>Number.isSafeInteger(n)&&n>=0;

function validLedger(value) {
  if(!value || typeof value!=='object' || Array.isArray(value) ||
     Object.getPrototypeOf(value)!==Object.prototype ||
     Object.keys(value).length!==REQUIRED_FIELDS.length ||
     REQUIRED_FIELDS.some(key=>!Object.hasOwn(value,key)) ||
     value.version!==1) return false;
  for(const key of REQUIRED_FIELDS.filter(k=>k!=='version')) {
    if(!natural(value[key]))return false;
  }
  if(value.revision!==value.lifetimeCount ||
     value.lifetimeCount>RATE_LIMIT_POLICY.lifetime ||
     value.minuteCount>RATE_LIMIT_POLICY.perMinute ||
     value.hourCount>RATE_LIMIT_POLICY.perHour ||
     value.dayCount>RATE_LIMIT_POLICY.perDay ||
     value.minuteCount>value.hourCount ||
     value.hourCount>value.dayCount ||
     value.dayCount>value.lifetimeCount) return false;
  if(value.lifetimeCount===0){
    return value.minuteBucket===0&&value.hourBucket===0&&value.dayBucket===0&&
      value.minuteCount===0&&value.hourCount===0&&value.dayCount===0;
  }
  return value.minuteBucket>0 &&
    value.hourBucket===Math.floor(value.minuteBucket/60) &&
    value.dayBucket===Math.floor(value.minuteBucket/1440) &&
    value.minuteCount>=1&&value.hourCount>=1&&value.dayCount>=1;
}

/** Test data only. Never expose this as a public or automatic initializer. */
export function offlineRateFixture(){
  return {
    version:1,minuteBucket:0,hourBucket:0,dayBucket:0,
    minuteCount:0,hourCount:0,dayCount:0,
    lifetimeCount:0,revision:0
  };
}

/**
 * Execute ONLY inside one SQLite Durable Object transactionSync callback.
 * The return value is a preliminary session-issuance allowance, NEVER
 * authorization for paid inference. No asynchronous I/O inside transaction.
 */
export function reserveSessionIssueRateInTransaction(kv,{nowMs}={}){
  if(!kv||typeof kv.get!=='function'||typeof kv.put!=='function')
    return denial('rate-storage-unavailable');
  if(!Number.isSafeInteger(nowMs)||nowMs<=0)
    return denial('untrusted-clock');
  try {
    const previous=kv.get(RATE_LIMIT_LEDGER_KEY);
    if(!validLedger(previous))return denial('rate-ledger-missing-or-invalid');
    const minute=Math.floor(nowMs/60000);
    const hour=Math.floor(nowMs/3600000);
    const day=Math.floor(nowMs/86400000);
    if(previous.lifetimeCount!==0&&minute<previous.minuteBucket)
      return denial('clock-moved-backward');
    if(previous.lifetimeCount>=RATE_LIMIT_POLICY.lifetime)
      return denial('session-issuance-lifetime-exhausted');

    const minuteCount=minute===previous.minuteBucket?previous.minuteCount:0;
    const hourCount=hour===previous.hourBucket?previous.hourCount:0;
    const dayCount=day===previous.dayBucket?previous.dayCount:0;
    if(minuteCount>=RATE_LIMIT_POLICY.perMinute)return denial('global-minute-limit');
    if(hourCount>=RATE_LIMIT_POLICY.perHour)return denial('global-hour-limit');
    if(dayCount>=RATE_LIMIT_POLICY.perDay)return denial('global-day-limit');

    const next={
      version:1,minuteBucket:minute,hourBucket:hour,dayBucket:day,
      minuteCount:minuteCount+1,hourCount:hourCount+1,dayCount:dayCount+1,
      lifetimeCount:previous.lifetimeCount+1,
      revision:previous.revision+1
    };
    kv.put(RATE_LIMIT_LEDGER_KEY,next);
    return Object.freeze({allowed:true,reason:'offline-session-rate-reserved'});
  }catch {
    // Throw to force the Cloudflare transaction to roll back.
    throw Error('rate-storage-write-failed');
  }
}

/** Owner-side diagnostics only. Not a public JSON route. */
export function inspectSessionIssueRate(kv){
  try{
    const value=kv.get(RATE_LIMIT_LEDGER_KEY);
    return validLedger(value)?Object.freeze({...value}):null;
  }catch{return null;}
}
