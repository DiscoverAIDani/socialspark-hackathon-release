# Restricted Judge Gateway — Offline Design Gate

**Status: NOT DEPLOYED · NOT REGISTERED IN WRANGLER · PAID AI DISABLED**

This change implements defensive request parsing and an inert Worker HTTP
shell. It is not a live integration and it does not expose the Nebius API.

## What this branch adds

- `cloudflare/judge-gateway-core.mjs`: a bounded, offline-only request
  preflight. Rejects non-HTTPS targets, origin/host/path mismatches,
  unexpected methods, cross-origin requests, missing/invalid CSRF-token
  *format*, malformed and oversized bodies, extra fields, arbitrary prompt
  text, unapproved example IDs, failed session/abuse/token/pricing/quota
  checks, and unavailable services. Its positive result explicitly states
  `providerCallsAuthorized: false`.
- `cloudflare/judge-gateway-disabled-worker.mjs`: an **unbound** default-off
  Worker that returns HTTP 503 to the judge AI endpoint and has no other
  public API routes, including no activation route.
- Automated offline tests for hostile requests and fail-closed behavior.

The only approved example currently allowed by the pure policy is
`fictional-beginner-workshop`. The application must never allow a judge
to provide arbitrary posts to Nebius.

## Security boundary and outstanding work

The preflight accepts **injected test callbacks** to simulate checks. No real
session-issuing service, durable one-use CSRF/session verifier, distributed
abuse prevention, trusted Nemotron input-token counter, live pricing
verification, production quota reservation or owner activation exists yet.

**A positive offline preflight does NOT enable a model call.** There is no
Nebius transport in these Cloudflare modules. The Durable Object quota
prototype is still unbound. No API key is read, created, saved, or exposed.

Before any future live request:

1. Provision a single durable quota namespace and ledger with a non-resetting
   owner procedure; verify on real Cloudflare Workers and Durable Objects.
2. Build a server-issued, short-lived single-use session/CSRF exchange,
   protected against replay, plus independent abuse controls and rate limits.
3. Compose model prompts only from approved server-authored fictional examples;
   use authoritative model token accounting and verify current Nebius pricing.
4. Atomically reserve lifetime attempt/budget capacity *before* the provider
   call; count errors, timeouts and rejected outputs as attempted use. Never
   automatically retry or restore reserved capacity.
5. Keep server-side credentials only in Cloudflare secrets; confirm the
   account's Free hosting plan and the Nebius billing exposure separately.
6. Obtain an additional explicit owner approval for activation and any
   potentially billable requests, after secure HTTPS/runtime testing.

`wrangler.jsonc` intentionally retains only static assets and does not
reference the disabled Worker, quota Durable Object or any secrets. The
production `main` branch and Cloudflare setup have not been changed.

The user's planned limit remains 20 lifetime attempts and $1 of application-
side reservations. **This is NOT a provider-enforced maximum charge** and
does not isolate the broader Nebius account balance.
