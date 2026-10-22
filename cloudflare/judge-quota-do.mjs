/**
 * Unbound Cloudflare Durable Object prototype. NOT registered in wrangler.jsonc,
 * not imported by the current Worker, and not reachable from HTTP.
 *
 * Cloudflare SQLite-backed Durable Objects provide durable, strongly consistent
 * storage. ALL traffic must eventually target ONE canonical object name.
 * Never create an object per judge, session, IP address, or request.
 *
 * DO NOT deploy or expose this class before separate approval of server-side
 * authorization, genuine token accounting, owner provisioning, abuse controls,
 * provider budget risk, and live gateway design.
 */
import {DurableObject} from 'cloudflare:workers';
import {reserveJudgeAttemptInTransaction,inspectJudgeQuotaState} from './judge-quota-core.mjs';

const denied = Object.freeze({allowed:false,reason:'quota-storage-unavailable'});

export class SocialSparkJudgeLifetimeQuota extends DurableObject {
  /**
   * Pure quota reservation; NOT provider-request authorization.
   * No upstream network request, credential, or AI provider import exists here.
   * Deny if the ledger is unprovisioned or storage is unavailable.
   */
  async reserveAttemptForFutureGateway() {
    try {
      const decision=this.ctx.storage.transactionSync(
        ()=>reserveJudgeAttemptInTransaction(this.ctx.storage.kv)
      );
      if (!decision.allowed) return decision;
      // Never let an external caller treat the request as reserved until the
      // durable state write is synchronized.
      await this.ctx.storage.sync();
      return decision;
    } catch {
      return denied;
    }
  }

  /** Internal diagnostics only; future gateway must NOT expose publicly. */
  async readLifetimeStatusForOwner() {
    try {
      return this.ctx.storage.transactionSync(
        ()=>inspectJudgeQuotaState(this.ctx.storage.kv)
      );
    } catch {return null;}
  }
}
