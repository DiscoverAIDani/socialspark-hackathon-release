/**
 * Offline-only, single-host persistent quota prototype for the judge demo.
 *
 * NO provider calls, HTTP route, credentials, automatic initialization or live
 * authorization. A live, multi-instance/ephemeral deployment MUST NOT use this
 * as a production spending cap. Deployments need an owner-approved durable
 * transactional store shared by ALL instances, plus provider-side controls.
 *
 * A missing, corrupt, locked or unavailable ledger always denies requests.
 * An attempt is permanently reserved BEFORE any future upstream request and
 * is NEVER refunded automatically, even when the upstream call fails.
 *
 * Local file operations rely on exclusive create and atomic rename on one
 * durable local filesystem. A crash leaving the lock in place denies requests
 * until an operator investigates it; this module never clears stale locks.
 */
import {open, readFile, rename, unlink} from 'node:fs/promises';
import {dirname, isAbsolute, basename, join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {JUDGE_DEMO_POLICY} from './judge-demo-policy.mjs';

const KEYS = Object.freeze(['schemaVersion','attempts','reservedCents','maxAttempts','maxBudgetCents','revision']);
const INITIAL_STATE = Object.freeze({
  schemaVersion:1,
  attempts:0,
  reservedCents:0,
  maxAttempts:JUDGE_DEMO_POLICY.allowedAttemptsLifetime,
  maxBudgetCents:JUDGE_DEMO_POLICY.applicationBudgetCentsLifetime,
  revision:0
});
const result = (allowed, reason) => Object.freeze({allowed,reason});
const denied = reason => result(false,reason);

function validatePath(filePath) {
  if (typeof filePath !== 'string' || !isAbsolute(filePath) || filePath.includes('\0') || basename(filePath).startsWith('.')) {
    throw new TypeError('Ledger requires an absolute, non-hidden storage path');
  }
  return filePath;
}
function validState(state) {
  return state && Object.getPrototypeOf(state) === Object.prototype &&
    Object.keys(state).length === KEYS.length && KEYS.every(k=>Object.hasOwn(state,k)) &&
    state.schemaVersion === 1 && state.maxAttempts === INITIAL_STATE.maxAttempts &&
    state.maxBudgetCents === INITIAL_STATE.maxBudgetCents &&
    [state.attempts,state.reservedCents,state.revision].every(Number.isSafeInteger) &&
    state.attempts >= 0 && state.attempts <= state.maxAttempts &&
    state.reservedCents >= state.attempts && state.reservedCents <= state.maxBudgetCents &&
    state.revision === state.attempts;
}
async function load(filePath) {
  const raw = await readFile(filePath, {encoding:'utf8',flag:'r'});
  if (raw.length > 512) throw Error('Invalid quota ledger');
  const state = JSON.parse(raw);
  if (!validState(state)) throw Error('Invalid quota ledger');
  return state;
}
async function syncDirectory(folder) {
  const handle=await open(folder,'r');
  try {await handle.sync();} finally {await handle.close();}
}
async function durableReplace(filePath,state) {
  const folder=dirname(filePath);
  const temporary=join(folder,'.quota-tmp-'+randomUUID());
  let handle;
  try {
    handle=await open(temporary,'wx',0o600);
    await handle.writeFile(JSON.stringify(state)+'\n','utf8');
    await handle.sync();
    await handle.close();
    handle=undefined;
    await rename(temporary,filePath);
    await syncDirectory(folder);
  } catch {
    await handle?.close().catch(()=>{});
    await unlink(temporary).catch(()=>{});
    throw Error('Durable quota update failed');
  }
}

/**
 * EXPLICIT local initialization tool: never called by the application or API.
 * Missing state is NOT initialized by reserve(). Never use initialization as a
 * recovery mechanism for a missing/deleted ledger; owner investigation needed.
 */
export async function initializeLocalJudgeLedger(filePath) {
  validatePath(filePath);
  const lockPath=filePath+'.lock';
  let lock;
  try {lock=await open(lockPath,'wx',0o600);} catch {return denied('ledger-unavailable');}
  let created=false;
  try {
    const stateFile=await open(filePath,'wx',0o600);
    created=true;
    try {await stateFile.writeFile(JSON.stringify(INITIAL_STATE)+'\n','utf8');await stateFile.sync();}
    finally {await stateFile.close();}
    await syncDirectory(dirname(filePath));
  } catch {
    await lock.close().catch(()=>{});
    if (!created) await unlink(lockPath).catch(()=>{});
    return denied('ledger-unavailable');
  }
  try {await lock.close(); await unlink(lockPath); await syncDirectory(dirname(filePath));}
  catch {return denied('ledger-unavailable');}
  return result(true,'offline-ledger-initialized');
}

/** A planning ledger only: reservation is NOT provider authorization. */
export function createLocalJudgeLedger(filePath) {
  validatePath(filePath);
  const lockPath=filePath+'.lock';
  return Object.freeze({
    async reserveAttempt(reservationCents) {
      if (!Number.isSafeInteger(reservationCents) || reservationCents < 1 ||
          reservationCents > INITIAL_STATE.maxBudgetCents) return denied('invalid-reservation');
      let lock;
      try {lock=await open(lockPath,'wx',0o600);} catch {return denied('ledger-unavailable');}
      let response=denied('ledger-unavailable');
      let canRelease=false;
      try {
        const state=await load(filePath);
        if(state.attempts >= state.maxAttempts) {response=denied('lifetime-attempt-limit');canRelease=true;}
        else if (reservationCents > state.maxBudgetCents-state.reservedCents) {
          response=denied('lifetime-application-budget');canRelease=true;
        } else {
          const updated={...state,attempts:state.attempts+1,
            reservedCents:state.reservedCents+reservationCents,revision:state.revision+1};
          await durableReplace(filePath,updated);
          response=result(true,'offline-attempt-reserved');
          canRelease=true;
        }
      } catch {
        // Fail closed. A damaged ledger or failed disk write leaves the lock
        // in place; it must be investigated, never silently repaired/reset.
        response=denied('ledger-unavailable');
      }
      try {
        await lock.close();
        if(canRelease) {await unlink(lockPath);await syncDirectory(dirname(filePath));}
      } catch {return denied('ledger-unavailable');}
      return response;
    },
    /** For local owner diagnostics only; do not return it to a public API. */
    async offlineSnapshot() {
      try {
        const lock=await open(lockPath,'wx',0o600);
        try {const state=await load(filePath);return Object.freeze({...state});}
        finally {await lock.close();await unlink(lockPath);}
      } catch {return null;}
    }
  });
}
