/**
 * TEST FIXTURE ONLY. Exposes the existing inert 503/404 Worker; exports
 * Durable Object classes solely so Cloudflare Vitest can bind them locally.
 * No HTTP provisioning/activation endpoints, no secrets or provider calls.
 * Not referenced by root wrangler.jsonc; DO NOT DEPLOY this fixture.
 */
export {SocialSparkJudgeLifetimeQuota} from '../cloudflare/judge-quota-do.mjs';
export {SocialSparkJudgeSessions} from '../cloudflare/judge-session-do.mjs';
export {SocialSparkGlobalSessionRate} from '../cloudflare/judge-rate-do.mjs';
export {default} from '../cloudflare/judge-gateway-disabled-worker.mjs';
