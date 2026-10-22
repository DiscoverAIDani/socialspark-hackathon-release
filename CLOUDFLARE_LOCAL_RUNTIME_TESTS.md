# Step 14N — Cloudflare local runtime verification

**Verified Oct 21, 2026: all 7 workerd runtime tests passed in GitHub Actions.**

This is a **local-only developer test harness**. Nothing is deployed to
Cloudflare's network and no real Turnstile or NVIDIA/Nebius request occurs.

## Results

Cloudflare's current `@cloudflare/vitest-plugin` was used to execute real
Workers runtime APIs (inside local Miniflare/workerd), including real
SQLite-backed Durable Object `ctx.storage.kv`, `transactionSync` and
`storage.sync()` calls.

The seven checks verify:
1. Actual disabled HTTP Worker always returns **503 AI disabled**, with
   no session issuance or owner activation route (404).
2. Missing/uninitialized quota ledger fails closed.
3. **32 simultaneous** quota reservation attempts: exactly **20** succeed
   with **100 cents reserved**, further attempts fail.
4. Durable Object eviction/reconstruction does **not reset** quota usage.
5. Session cookie/CSRF secrets redeem exactly once. Incorrect and replayed
   pairs fail, including after eviction.
6. Uninitialized rate storage fails closed; **10 simultaneous** global
   reservation attempts allow only **3** in a minute; quota survives eviction.
7. Session/rate issuance cannot auto-provision missing state.

The existing `npm test` Foundation suite also passed on the same commit.

## Structure

- `runtime-security/package.json` — separately pinned Vitest and Cloudflare
  local test tools, **not** SocialSpark production dependencies.
- `runtime-security/wrangler.runtime.jsonc` — **test-only** Worker name,
  SQLite Durable Object bindings and migrations; no remote routes; distinct
  from the root `wrangler.jsonc`.
- `runtime-security/fixture-worker.mjs` — re-exports existing default-deny
  Worker and the actual Durable Object classes. **No test initialization,
  provisioning or data-clearing HTTP endpoints exist.**
- `runtime-security/vitest.config.mjs` and `cloudflare-checks.mjs` —
  local runtime integration checks, using test-helper-only temporary seeding.
- `.github/workflows/cloudflare-runtime-local.yml` — run on this test branch
  only, with read-only GitHub permissions, no Cloudflare tokens, no deployment,
  no paid services, and no Nebius secret.

The Github Actions job installs tests only within `runtime-security` and
uses Node 24, avoiding an npm 10 dependency-resolution failure encountered
during initial setup. It does not change the normal app runtime.

## Scope and remaining release gates

Tests **DO NOT** establish security of an actual internet-facing Worker,
simulate all adversarial cases, prove multi-region behavior, or guarantee
persistence after a *real production redeployment*.

Before public judge access, separately:
- Implement reviewed Worker HTTP routes, allowed fixed fictional examples,
  strict same-origin/HTTPS handling, cookie/CSRF issuance, and body limits.
- Add production SQLite Durable Object bindings, migrations, canonical object
  routing, *one-time owner-only ledger initialization* (no resets) and
  comprehensive Cloudflare production verification with explicit approval.
- Complete real Turnstile widget and server Siteverify, pre-issuance abuse
  controls, conservative approved server-side token counting and current
  Nebius price review, provider-secret management and billable-calls review.
- Require explicit owner approval for any live paid inference and any
  deployment/public URL. Current `main` remains untouched and private.
- Stay on Free Cloudflare hosting only.

The existing **20-attempt and $1.00 application-reservation limits are
planning safeguards, NOT a Nebius-side hard spending cap.** The user's broader
Nebius account balance is not insulated by this work.

Cloudflare docs:
- https://developers.cloudflare.com/workers/testing/vitest-integration/
- https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/
- https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/
