# Step 14J — One-Time Judge Sessions (OFFLINE ONLY)

**NOT DEPLOYED • NOT MERGED • NO PAID AI • NO LIVE PUBLIC SESSION ROUTE**

This branch adds a planned anti-replay mechanism for SocialSpark's future judge demo without exposing a public session issuer or changing the Cloudflare deployment configuration.

## How the future flow is intended to work

1. The restricted, secure HTTPS Worker performs independent issuance-rate and abuse checks.
2. It obtains a fresh pair of cryptographically random **256-bit** values from a **single canonical** Durable Object, shared by all judges.
3. The Worker places the session value in a `__Host-SocialSparkJudge` cookie with `Secure; HttpOnly; SameSite=Strict; Path=/` and returns only the different CSRF value to the same-origin browser, under a `no-store` policy. No third-party origins are permitted.
4. The browser uses the CSRF value in an `X-SocialSpark-Csrf` header and automatically sends the first-party session cookie when selecting an approved fictional example.
5. Server verifies the origin, exact request, CSRF header, and cookie; the canonical Durable Object **atomically consumes the matching hashed pair** in persistent storage. A subsequent replay fails. The token expires after **120 seconds**.
6. The session check alone NEVER authorizes a paid model request. The separately approved pricing, secure input validation, global 20-request quota, $1 planned budget, live-owner authorization and upstream call guards would still be necessary.

Only SHA-256 digests of the two different tokens are kept in durable storage; plaintext token values are transient, never placed in URLs or logged. No IP addresses, post content or personal identifiers are stored in the session ledger.

## Fail-safe and abuse limits

- The ledger is deliberately **not automatically initialized or reset**. Missing/corrupt storage denies session operations.
- A given pair is usable exactly once. Incorrect cookie/CSRF pairing, unknown IDs, expired tokens and replays fail.
- A maximum of **16 unexpired sessions** can exist globally at once.
- A maximum of **1,000 session issuances over the ledger lifetime**, without automatic reset.
- When storage transactions or durability verification fail, operations must stop.
- Issuing sessions does NOT consume the planned Nebius attempt quota. A future secure server must enforce additional rate and abuse limits **before session issuance** or attackers could exhaust sessions and cause denial of service.

## Implementation

- `cloudflare/judge-session-core.mjs`: offline-only random token generation, SHA-256 hashing, validation, one-use atomic ledger operations, strict cookie template.
- `cloudflare/judge-session-do.mjs`: **unbound** Cloudflare Durable Object wrapper using `ctx.storage.transactionSync()` and `storage.sync()`.
- `test/cloudflare-judge-sessions.test.js`: simulated restart, expiry, replay, wrong CSRF, exhaustion, corrupt storage, and security tests.

**No session route or cookie exchange is deployed.** The existing gateway continues to deny live requests, and `wrangler.jsonc` remains static-only, with no worker entrypoint or Durable Object binding.

## Release blockers before live judging

A separate implementation and test of the HTTPS session endpoint, secure cookie parsing (including duplicate rejection), CSRF token delivery, origin/fetch-metadata checks, pre-issuance abuse throttling, real Cloudflare runtime persistence, shared quota binding, authoritative token counting, Nebius pricing, secure provider secrets, and an explicit final owner approval are required.

The app-side $1 planning budget is NOT a provider-enforced ceiling. Existing Nebius funds remain potentially exposed if any future paid gateway is improperly enabled. Do not deploy or activate from this branch.
