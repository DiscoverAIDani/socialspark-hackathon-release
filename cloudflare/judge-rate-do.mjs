/**
 * UNBOUND, OFFLINE-PROTOTYPE Cloudflare Durable Object rate limiter.
 * NOT registered in wrangler config and NOT accessible over HTTP.
 *
 * This is one global coordinator shared across the entire judge demo.
 * No IPs, cookies, prompt text or identifiers are stored here.
 * It cannot authenticate visitors or approve paid AI calls.
 *
 * A future issuance gateway must check human/bot challenge verification
 * before issuing a token, then consume a global rate slot before creating
 * the short-lived one-use session. Global limits can be abused for denial
 * of service; this prototype is insufficient protection on its own.
 */
import {DurableObject} from 'cloudflare:workers';
import {
  RATE_LIMIT_INSTANCE_NAME,
  reserveSessionIssueRateInTransaction,
  inspectSessionIssueRate
} from './judge-rate-core.mjs';

const unavailable=Object.freeze({allowed:false,reason:'rate-storage-unavailable'});

export class SocialSparkGlobalSessionRate extends DurableObject {
  async reserveForFutureSessionIssuer(){
    try{
      const nowMs=Date.now();
      const decision=this.ctx.storage.transactionSync(
        ()=>reserveSessionIssueRateInTransaction(this.ctx.storage.kv,{nowMs})
      );
      if(!decision.allowed)return decision;
      await this.ctx.storage.sync();
      return decision;
    }catch{return unavailable;}
  }

  /** Private owner-only diagnostics primitive; no HTTP route. */
  async inspectForOwner(){
    try{
      return this.ctx.storage.transactionSync(
        ()=>inspectSessionIssueRate(this.ctx.storage.kv)
      );
    }catch{return null;}
  }
}

export const CANONICAL_GLOBAL_SESSION_RATE_OBJECT=RATE_LIMIT_INSTANCE_NAME;
