# Step 14M — Integrated Judge Security Flow (OFFLINE ONLY)

**NOT DEPLOYED. NOT MERGED. NOT A PUBLIC API. NO NVIDIA / NEBIUS NETWORK CALL.**

This branch combines the previously developed Turnstile, persistent global
rate-limit, one-use session/CSRF, prompt allowlist, server token policy, price
and lifetime quota checks into a **test-only orchestration layer**.

No live Worker entrypoint or activation route was added. The static-only
`wrangler.jsonc` remains unchanged. The real disabled Worker continues to
return HTTP 503 from `/api/judge-demo/generate` and 404 from the proposed
session route.

## Simulated session-issuance sequence

`offlineIssueJudgeSession(request, testDependencies)` checks:

1. Exact HTTPS origin, expected path, POST method, same-origin Fetch Metadata,
   content type, strict JSON with exactly one `turnstileToken`, and body
   limited to 2,304 bytes.
2. The existing Turnstile Siteverify adapter with an **explicitly injected
   fake response transport**, exact hostname/action and token lifetime.
3. The existing global rate limit reservation through **mock persistent**
   storage (3/min, 20/hour, 60/day, 1,000 lifetime; provisional).
4. Two independent 256-bit session and CSRF values. Only their SHA-256 hashes
   are added to the mock session ledger, with a 120-second lifetime.
5. Returns a **test-only cookie header template** (`__Host-`, HttpOnly,
   Secure, SameSite=Strict) and independent CSRF token, with explicit
   `providerCallsAuthorized:false`.

If any step fails, the result denies the request. Some quotas or Turnstile
tokens may remain consumed after a later failure: never auto-retry or refund.

## Simulated generation sequence

`offlineCheckJudgeGenerate(request, testDependencies)` checks:

1. The exact same-origin HTTPS POST route and allowed content type.
2. A single, correctly shaped secure-cookie secret and independent CSRF header;
   duplicate cookie names are rejected.
3. The pair's server-calculated hashes, consumed together exactly once through
   the existing **mock persistent** session ledger.
4. The pre-existing gateway's strict JSON schema with only the approved
   fictional `exampleId`, then independent simulated anti-abuse checks,
   server-computed model-token count (2,000 input / 1,250 output maxima),
   current-pricing check, and lifetime shared quota reservation.
5. The successful test-only result always includes
   `providerCallsAuthorized:false`. It **cannot** perform AI inference.

## Automated regression tests

- Complete fictional Turnstile → rate → hashed one-use session → prompt
  validation → server token/pricing → lifetime budget sequence.
- Replay rejection of Turnstile proof and session+CSRF pairs, duplicate cookie
  handling, wrong CSRF, origin spoofing, malformed or oversized JSON.
- Rate exhaustion, missing storage, unavailable dependencies and failed
  token/pricing checks; failures never permit provider calls.
- An end-to-end 21-attempt rehearsal confirms only 20 mock quota
  reservations can succeed, reserving exactly 100 cents total **in the
  application-side simulated ledger**.
- The currently disabled Worker remains HTTP 503/404 even after successful
  simulated preflight. Tests make no actual Siteverify or Nebius requests.

## Real deployment blockers: not yet implemented

- Cloudflare Worker routing and static asset integration, Durable Object
  migrations/bindings/one-time secure provisioning, durability/concurrency
  testing on actual Cloudflare Free infrastructure.
- Public Turnstile widget setup on the eventual verified deployment hostname
  and **real** Siteverify calls, exact origin/fetch-metadata/CSRF/cookie checks
  in a running Worker, reviewed CSP exceptions and privacy review.
- Real server-only model token accounting and model/version availability,
  current Nebius price and account exposure checks, provider-secret handling,
  enforceable per-request upper bounds, post-failure no-retry behavior,
  comprehensive abuse/DoS safeguards and controlled rollout.
- **Separate owner authorization for any live, potentially paid NVIDIA
  request or backend activation.** App-side reservations do not impose a
  provider-enforced $1 hard cap. Do not assume the Nebius $50 account balance
  is protected by this prototype.
- Judging and Devpost submission still require a genuinely accessible
  public demo URL, honest labeling of offline sample output, and final
  owner deployment approval.

No payment method was added, no deployment attempted, and the original
`main` release remains unchanged.

The integrated pipeline source is `cloudflare/judge-offline-pipeline.mjs`.
Its mock-only tests are `test/cloudflare-judge-pipeline.test.js` and
`test/cloudflare-judge-lifetime-flow.test.js`.
