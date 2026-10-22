/**
 * UNBOUND SQLITE DURABLE OBJECT — OFFLINE EMERGENCY STOP PROTOTYPE.
 * No public route, no provider transport, no setter to reopen the latch.
 * Only the local test harness binds this class. DO NOT DEPLOY OR EXPOSE.
 */
import {DurableObject} from 'cloudflare:workers';
import {
  JUDGE_STOP_INSTANCE_NAME,
  inspectEmergencyStopForFutureGateway,
  latchEmergencyStopInTransaction
} from './judge-emergency-stop-core.mjs';

const storageError=Object.freeze({
  valid:false,stopped:true,reason:'shutdown-storage-unavailable',
  providerCallsAuthorized:false
});

export class SocialSparkJudgeEmergencyStop extends DurableObject {
  async inspectForFutureGateway(){
    try{
      return this.ctx.storage.transactionSync(()=>
        inspectEmergencyStopForFutureGateway(this.ctx.storage.kv));
    }catch{return storageError;}
  }

  /** One-way and internal only. Not an HTTP endpoint or live permission. */
  async latchStopForFutureOwner(){
    try{
      const state=this.ctx.storage.transactionSync(()=>
        latchEmergencyStopInTransaction(this.ctx.storage.kv));
      if(!state.valid||!state.stopped)return storageError;
      await this.ctx.storage.sync();
      return state;
    }catch{return storageError;}
  }
}

export const CANONICAL_JUDGE_STOP_OBJECT=JUDGE_STOP_INSTANCE_NAME;
