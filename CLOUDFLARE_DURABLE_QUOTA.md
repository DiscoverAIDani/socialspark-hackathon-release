# Cloudflare Judge Quota — Offline Prototype Only

**Not deployed. No Cloudflare Durable Object namespace or binding is configured.
No Nebius API call is enabled or authorized. The GitHub production branch is unchanged.**

## Intended architecture (not yet wired)

Future secure HTTPS Worker (not implemented)
  → one canonical Durable Object ID/name, shared by all judges
  → synchronous SQLite-backed storage transaction reserving an attempt
  → durable sync confirmation
  → separate mandatory checks for token count, fixed fictional prompt, rate
    limiting, IP / session abuse, pricing, key custody, consent, owner activation
  → only then may a **separately authorized** backend call Nebius.

The proposed single object name is `socialspark-judge-lifetime-quota-v1`.
Never derive the object name from a judge, session, IP, request, or region;
that would split the lifetime budget across independent counters.

## Frozen planning limits

- Lifetime attempted model requests: **20**, including failed requests.
- Lifetime application budget reservation: **100 cents**.
- Fixed per-attempt reservation: **5 cents**, for conservative planning only.
- Input/output token ceilings: **2,000 / 1,250**; they are NOT enforced by
  this isolated quota prototype until a trusted server-side tokenizer and
  approved request gateway are integrated.
- One previously approved fictional idea only until others are reviewed.
- Paid inference disabled, and no API key may be included in source code.

The usage ledger has no automatic reset after failure, cancellation, restart,
or redeployment. Storage that is missing, malformed or unavailable must block
inference. This stage intentionally does NOT expose a ledger initialization
or repair method. A one-time, owner-only provisioning and disaster-recovery
procedure needs separate security review before activation.

## Files and scope

- `cloudflare/judge-quota-core.mjs`: pure synchronous reservation logic.
- `cloudflare/judge-quota-do.mjs`: unbound Durable Object class, backed by
  `ctx.storage.kv` inside a `transactionSync`, then `storage.sync()`.
- `test/cloudflare-durable-quota.test.js`: offline simulations of missing
  ledger, 20 attempts, restart persistence, concurrent reservations,
  malformed data, and storage errors.
- `wrangler.jsonc`: unchanged from static-only preview; intentionally has
  **no** `main`, `durable_objects` binding, migration, or gateway route.

Cloudflare's production Durable Object runtime has not yet been tested.
The Node tests use mock storage; they do **not** establish Cloudflare
runtime correctness or guarantee a Nebius billing ceiling. Provider
charges can differ from local calculations, and the account-level $50
balance is NOT made inaccessible by this code.

## Deployment release blockers

Before ANY judge can make a live request, separately review and implement:

1. A Cloudflare Worker with HTTPS-only restricted API, correct origin/CSRF
   verification, abuse defenses, no logging of prompts, and server-only keys.
2. A single SQLite-backed Durable Object binding and `new_sqlite_classes`
   migration, plus trusted, non-resetting initialization of the ledger.
3. Real runtime tests in Cloudflare for transaction durability, object
   rehydration/redeployments, concurrency, lost writes and error cases.
4. Server-verified request template and input token counting; bounded output,
   current Nebius price validation and hard stop on unknown pricing.
5. A separate spending-risk review: the $1 application reservation is NOT a
   provider-side hard cost cap; Cloudflare Free limits and provider credit
   exposure must be checked before activation.
6. Owner's explicit separate authorization of the live deployment, maximum
   provider exposure and any potentially billable calls.

Do not merge or deploy this branch as if the backend were already ready.
