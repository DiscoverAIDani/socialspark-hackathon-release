/**
 * Unbound SQLite-backed Cloudflare Durable Object session coordinator.
 * NO wrangler Durable Object binding, HTTP route, Nebius transport, secrets,
 * deploy command or public session issuer exists. This class remains inert.
 *
 * A future approved gateway MUST use the SAME object name for all judges,
 * and verify both a Secure HttpOnly cookie and an independent CSRF header.
 * Both secrets must be consumed exactly once before any paid request.
 * Failure to persist a consumption means the request must not proceed.
 */
import {DurableObject} from 'cloudflare:workers';
import {
  JUDGE_SESSION_INSTANCE_NAME,
  generateJudgeSessionSecrets,hashJudgeSessionSecrets,
  issueJudgeSessionInTransaction,consumeJudgeSessionInTransaction
} from './judge-session-core.mjs';

const deny=reason=>Object.freeze({allowed:false,reason});

export class SocialSparkJudgeSessions extends DurableObject {
  /**
   * Internal, unbound primitive. NEVER expose directly to internet traffic;
   * future issuance route needs additional distributed abuse protection.
   */
  async issueForFutureGateway() {
    try {
      const secrets=generateJudgeSessionSecrets();
      const hashes=await hashJudgeSessionSecrets(secrets);
      const nowMs=Date.now();
      const decision=this.ctx.storage.transactionSync(
        ()=>issueJudgeSessionInTransaction(this.ctx.storage.kv,{...hashes,nowMs})
      );
      if (!decision.allowed) return decision;
      await this.ctx.storage.sync();
      // Secrets leave only through a future secure gateway, not durable storage.
      return {allowed:true,code:'offline-primitive-only',...secrets,
        expiresInSeconds:120};
    } catch {return deny('session-storage-unavailable');}
  }

  /** Internal, unbound one-time CSRF validation/consumption primitive. */
  async consumeForFutureGateway(cookieSecret,csrfSecret) {
    try {
      const hashes=await hashJudgeSessionSecrets({cookieSecret,csrfSecret});
      const nowMs=Date.now();
      const decision=this.ctx.storage.transactionSync(
        ()=>consumeJudgeSessionInTransaction(this.ctx.storage.kv,{...hashes,nowMs})
      );
      if(!decision.allowed)return decision;
      await this.ctx.storage.sync();
      return {allowed:true,code:'offline-session-consumed-only'};
    } catch {return deny('session-storage-unavailable');}
  }
}

// Exported only to document the canonical name; no Worker binds this class.
export const CANONICAL_JUDGE_SESSION_OBJECT=JUDGE_SESSION_INSTANCE_NAME;
