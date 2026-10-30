/**
 * LOCAL-TEST ONLY: never referenced in the production wrangler.jsonc.
 * V2 judge-bound sessions use one canonical SQLite Durable Object instance.
 * Internal RPC methods require the signed judge's HMAC binding digest; no
 * public request can invoke them through the disabled HTTP fixture.
 *
 * No startup initialization, no provisioning endpoint, no reactivation route,
 * no login service, no upstream network, and no inference authorization.
 */
import {DurableObject} from 'cloudflare:workers';
import {
  issueBoundJudgeSessionInTransaction,
  consumeBoundJudgeSessionInTransaction
} from './judge-bound-session-core.mjs';

const deny=reason=>Object.freeze({allowed:false,reason});
export class SocialSparkJudgeBoundSessionsV2 extends DurableObject {
  async issueBoundDigestForOfflineGateway({sessionHash,csrfHash,judgeBindingDigest}={}){
    try{
      const decision=this.ctx.storage.transactionSync(()=>
        issueBoundJudgeSessionInTransaction(this.ctx.storage.kv,{
          sessionHash,csrfHash,judgeBindingDigest,nowMs:Date.now()
        })
      );
      if(!decision.allowed)return decision;
      await this.ctx.storage.sync();
      return decision;
    }catch{return deny('bound-session-storage-unavailable');}
  }

  async consumeBoundDigestForOfflineGateway({sessionHash,csrfHash,judgeBindingDigest}={}){
    try{
      const decision=this.ctx.storage.transactionSync(()=>
        consumeBoundJudgeSessionInTransaction(this.ctx.storage.kv,{
          sessionHash,csrfHash,judgeBindingDigest,nowMs:Date.now()
        })
      );
      if(!decision.allowed)return decision;
      await this.ctx.storage.sync();
      return decision;
    }catch{return deny('bound-session-storage-unavailable');}
  }
}
