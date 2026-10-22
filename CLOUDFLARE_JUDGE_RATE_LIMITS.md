# Step 14K — Offline Global Session Rate Limits

**NOT DEPLOYED · NOT MERGED · NO NEBIUS REQUESTS · LIVE AI DISABLED**

This change adds a single global Durable Object **prototype** for limiting
requests to issue judge-session tokens. It is not yet bound to Cloudflare or
connected to the session issuer. It cannot enable paid inference.

## Conservative provisional limits

| Window | Maximum accepted session issuance attempts |
| --- | ---: |
| Fixed UTC minute | 3 |
| Fixed UTC hour | 20 |
| Fixed UTC day | 60 |
| Lifetime | 1,000 |

These limits are design defaults pending owner review, not activated settings.
They count session **issuance slots**, not Nemotron requests. The already
approved independent AI allowance remains **20 lifetime model attempts**
with **$1.00 of application-side planned reservations** and paid AI disabled.

Successful rate reservations consume the slot even if a later session issuance
fails. All windows use the **same single Durable Object** and its persistent
SQLite-backed KV storage; counters cannot reset on process restart. Clock
rollback, missing ledger, invalid state, exceeded limit, and storage failure
must deny.

There is no automatic initialization, reset, refund or quota repair endpoint.

## Files

- `cloudflare/judge-rate-core.mjs`: synchronous transaction reservation
  logic with strict persisted-state validation and fixed UTC windows.
- `cloudflare/judge-rate-do.mjs`: **unbound** Cloudflare Durable Object
  wrapper using `ctx.storage.transactionSync` and `storage.sync()`.
- `test/cloudflare-judge-rate.test.js`: offline unit tests for per-window
  limits, concurrent requests, simulated restarts, clock rollback, corruption,
  missing storage, failed disk writes and default-off status.

## Why global limits are not enough

A single attacker could use available slots to block legitimate judges.
Before a public issuer is approved, add a **real bot/human verification
control**, such as Cloudflare Turnstile, and independently validate its
one-use tokens with Cloudflare **Siteverify on the server**. A client-only
Turnstile widget does not protect the endpoint. Turnstile validation and
issuance throttling must occur before generating or granting session tokens.
Protect against automated scraping, denial of service, forged/replayed
challenges and unnecessary use of the lifetime issuance allowance.

Do not store raw IP addresses, private post content, or identifiers in the
global ledger. Bot mitigation design must have a separate privacy review.

## Release restrictions

The current `wrangler.jsonc` still contains **static assets only**:
no Worker entrypoint, Durable Object binding, migration or public session
endpoint. No Cloudflare runtime tests have been performed for this quota
prototype. The existing disabled Worker returns 503 if wired accidentally.

This module is not a provider spending cap, and cannot protect the user's
$50 Nebius account balance from a future improperly enabled gateway.

Before production: verify one canonical object routing, durable
transaction behavior in actual Cloudflare Workers, server-side Turnstile
verification, request/session abuse protection, server-computed token counts,
current Nebius pricing, budget reservations and explicit owner activation.
