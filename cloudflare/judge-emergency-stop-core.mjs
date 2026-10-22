/**
 * OFFLINE EMERGENCY STOP DESIGN — NO DEPLOYMENT OR MODEL AUTHORIZATION.
 *
 * This is a future judge gateway's one-way, durable shutdown latch.
 * Missing, corrupt, or unavailable storage is treated as STOPPED.
 * No public or server-side API can initialize, reset or reopen this latch.
 * Test-only initialization is done directly by the workerd test framework.
 *
 * A valid clear latch is NOT provider authorization: normal policy still
 * explicitly disables paid inference, and all other gates remain mandatory.
 */
export const JUDGE_STOP_INSTANCE_NAME='socialspark-judge-emergency-stop-v1';
export const JUDGE_STOP_LEDGER_KEY='judge-emergency-stop-state-v1';

const denied=reason=>Object.freeze({
  valid:false,stopped:true,reason,providerCallsAuthorized:false
});
const view=(state)=>Object.freeze({
  valid:true,stopped:state.stopped,
  reason:state.stopped?'emergency-stop-latched':'offline-latch-clear-only',
  providerCallsAuthorized:false
});

function validState(value){
  if(!value||Object.getPrototypeOf(value)!==Object.prototype||
    Object.keys(value).length!==3||
    !Object.hasOwn(value,'version')||
    !Object.hasOwn(value,'stopped')||
    !Object.hasOwn(value,'revision')||
    value.version!==1||
    typeof value.stopped!=='boolean'||
    !Number.isSafeInteger(value.revision)||value.revision<0)return false;
  // A one-way stop has exactly one persisted transition, clear (rev 0) -> stop (rev 1).
  return value.stopped===false ? value.revision===0 : value.revision===1;
}

/** Offline fixture for test-framework use only. Never a deployable initializer. */
export function offlineEmergencyStopFixture(){
  return {version:1,stopped:false,revision:0};
}

/** Safe read: missing/corrupt storage always means inference must stop. */
export function inspectEmergencyStopForFutureGateway(kv){
  if(!kv||typeof kv.get!=='function')return denied('shutdown-storage-unavailable');
  try{
    const state=kv.get(JUDGE_STOP_LEDGER_KEY);
    return validState(state)?view(state):denied('shutdown-ledger-missing-or-invalid');
  }catch{
    return denied('shutdown-storage-unavailable');
  }
}

/**
 * Owner-side one-way stop primitive, only inside transactionSync.
 * There is no inverse operation, no authentication route, no HTTP entrypoint.
 */
export function latchEmergencyStopInTransaction(kv){
  if(!kv||typeof kv.get!=='function'||typeof kv.put!=='function')
    return denied('shutdown-storage-unavailable');
  try{
    const prior=kv.get(JUDGE_STOP_LEDGER_KEY);
    if(!validState(prior))return denied('shutdown-ledger-missing-or-invalid');
    if(prior.stopped)return view(prior); // already stopped: never reset
    kv.put(JUDGE_STOP_LEDGER_KEY,{version:1,stopped:true,revision:1});
    return view({version:1,stopped:true,revision:1});
  }catch{
    // Throw to roll back storage transactions when writes fail.
    throw Error('shutdown-storage-write-failed');
  }
}
