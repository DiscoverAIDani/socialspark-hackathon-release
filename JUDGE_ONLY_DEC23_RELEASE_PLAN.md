# SocialSpark — judge-only live inference plan through December 23, 2026

**Prepared October 29, 2026. STATUS: DESIGN / NO-GO.** This file is not a deployment instruction or permission to use paid inference, publish a judge endpoint, configure a secret, change the submitted Devpost entry, or merge any draft PR.

## Authoritative scope and dates

- The [official Devpost rules](https://nebiusglobalaihackathon.devpost.com/rules) say the judging period runs December **9–23, 2026** (until **12:00 PM Pacific on December 23**) and require free, unrestricted judging access throughout the judging period.
- [Janet Fang, marked Manager, replied on October 29](https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis): a separate judge login with reserved capacity is acceptable, real Nebius/NVIDIA runtime calls must remain available, and reasonable abuse limits must still allow a **full judging pass**. She did not specify a minimum request count.
- The owner **posted a follow-up** asking whether preapproved fictional prompts are sufficient and requesting clarification of Janet's **December 15** mention against the rules' **December 23** end date. No follow-up acceptance is assumed.
- **Conservative planning horizon: December 23, 2026, end of day Pacific** (through 11:59 PM PST), which exceeds the noon end in the current rules. If the organizer responds authoritatively, reconcile before any operation. This extra period does not alter the owner's privately specified maximum spending exposure.
- The entry and its revised narrated public YouTube demonstration are **already submitted and verified**. Do not resubmit, re-record, or replace the currently accurate static public demo without a separate owner-approved reason.

## Current state, not future promises

- The production `main` Wrangler file is **assets-only**, and the live website uses local offline example templates. No public Nebius/NVIDIA inference occurs.
- A separately approved local owner-run test successfully used NVIDIA Nemotron 3 Nano via Nebius Token Factory to generate four real drafts. The original one-use local attempt lock must stay consumed; do not repeat that test.
- Security proof-of-concepts exist **only on unmerged draft branches**. Workerd/SQLite and mock-transport tests are not production validation.
- The current `JUDGE_DEMO_POLICY` is **20 shared lifetime attempts, 100 simulated application-side cents, and a single approved fictional input**. These are **NOT judged sufficient or officially accepted**. They MUST NOT silently become production access limits.
- **No provider-enforced cap on total Nebius charges has been independently verified.** Application counters and cheap estimates are not hard financial protection. The owner has a private fixed maximum acceptable exposure; planning must not increase or publicize it.

## Candidate architecture for separate owner-approved release

1. **Preserve the static site.** If a real judge service is approved, isolate it behind a separate Cloudflare hostname/application. Do not silently replace the public static demo or weaken its `connect-src 'none'` policy.
2. **Judge authentication, not only bot checking.** Consider Cloudflare Access in front of that future Worker. Permit only explicitly approved judge identities using a verified email one-time PIN or an appropriate identity provider; use an owner-verified allowlist, **not** `Everyone` or a broad wildcard. Turnstile by itself is **not authentication**. Do not invent judge emails, login credentials, or assume organizers will know a private URL. Agree on an authorized channel for sharing access information.
3. **Authenticate every request inside the Worker, too.** Verify Cloudflare Access's signed JWT, issuer/audience, validity period and intended identity/server-side allowlist rather than trusting a spoofable header or client-submitted email. See [Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/) and [JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/). Use a canonical, auditable scope and avoid logging identity, raw tokens, prompts or returned posts. Authentication alone does not prevent runaway cost.
4. **Use normal privacy and consent protections.** A judge should see exactly what would be sent, with local masking warnings and fresh opt-in. Do not assume a fixed fictional prompt is sufficient until the organizer answers. If broader prompts are required, redesign and security-review rather than stripping the existing approved-example allowlist without consent.
5. **Server-only paid inference.** Provider credentials belong exclusively in a protected server secret binding. Confirm Nebius model and endpoint, trusted token count, current price and authoritative response usage. Use strict per-request bounds, no automatic retry, short timeout, immutable input/review revisions, failure-safe output checks and an owner-controlled shutdown. Never forward arbitrary browser-provided headers, model IDs, base URLs or authorization.
6. **True reserved capacity.** Choose a capacity policy only after the organizer clarifies full-pass requirements. Avoid a shared 20-attempt cap that can be exhausted before a legitimate judge session. Sessions and accounting must support multiple authenticated judges, protect against one user consuming all capacity, and distinguish abusive activity from genuine evaluation; do not promise availability that a finite budget cannot support.
7. **Durable global accounting.** Before a model request, atomically reserve capacity and verify the stop latch through canonical Durable Object instances. Count timeouts, malformed responses, partial outputs and failed requests as possibly billable attempts. For the proposed expanded policy, create **new, versioned** ledger semantics—do not reset, repurpose or silently increase the prototype's 20-attempt ledger.
8. **Financial gate.** A separately confirmed, enforceable provider-side limit or other independently verified zero-exposure sponsored arrangement must be established before saying the service is financially bounded. If not available, **NO-GO** until the owner explicitly reviews risk; never interpret a financial risk ceiling as authorization to incur charges. No top-up investigation is required or requested here.
9. **Emergency operation and end date.** Separate and test owner-only stop/rollback procedures; deny on missing/corrupt quota or stop state, auth failures, identity errors, provider failures and inaccessible secrets. Confirm how the service will remain available without human intervention through December 23. Include a planned shutdown after the conservative end date, but don't create an unauthenticated remote reactivation or reset endpoint.

## October 29 — security and billing research checkpoint (offline)

- A **non-deployed JWT verifier prototype** now exists at `cloudflare/judge-access-jwt-offline.mjs`, with synthetic RSA signatures and identity tests at `test/judge-access-jwt-offline.test.js`. Its accepted result explicitly says `providerCallsAuthorized:false`. No Worker imports the module; it does not create a Cloudflare Access application, issue login credentials, load a real team JWKS, or open a public endpoint.
- Tests confirm a signed JWT must match the intended team **issuer**, application **audience**, approved judge email, active validity window, and a **trusted**, caller-supplied RS256 signing public key. Forged, expired, service-token, wrong-app, wrong-user and untrusted-key examples are denied. Tests use synthetic keys only.
- Cloudflare [requires Worker-side JWT validation](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/) and notes Access signing keys **rotate approximately every six weeks**. A trustworthy key refresh procedure and outage/rotation failure policy are still missing; never accept an untrusted JWK embedded in a token, and never retrieve signing keys from an attacker-provided URL.
- **New financial finding:** Nebius [Token Factory Supplemental Terms](https://docs.nebius.com/legal/token-factory), **effective October 22, 2026**, section 6.1 describes fees as **post-paid** unless an agreement provides otherwise, and section 6.2 permits free credits to be modified or revoked. The public documentation **does not establish an enforceable provider-side spending hard stop for this account**. Assume none until independently verified in the actual account/service contract. A locally simulated reservation, a rate limit, a low model token price, or automatic top-ups being disabled are not a provider-enforced financial ceiling.
- This research materially **reinforces NO-GO** for live deployment without separate financial protection and explicit owner approvals. It neither changes actual account settings nor uses billable inference.

## October 29 — currently available promo credits are not a hard spending stop

- The owner reports that promotional credit remains available in the Nebius Token Factory account, with **no expiration date shown**. Treat its future validity and provider-side billing protection as **unverified**, even if its balance is sufficient for many small model requests. Do **not** publish the account-specific amount or infer an expiration date.
- Official [Token Factory Billing documentation](https://docs.tokenfactory.nebius.com/other-capabilities/billing) says promo codes increase the account balance, while the API rejects calls once the balance is **negative**. It does not promise refusal before the next request crosses zero, and it does **not** establish a contractual per-key or per-project maximum billable exposure.
- A new **`cloudflare/judge-release-evidence-offline.mjs`** checklist distinguishes genuine independent operating evidence from reassuring but insufficient details such as promo credits or disabled automatic top-ups. **No checklist flags, even if all marked true, can return deployment or provider-call authorization.**
- **`test/judge-release-evidence-offline.test.js`** covers missing/false evidence, mistaking credit for a hard cap, fictional assertions of full readiness, unknown fields, private account data in public code, immutable results, and the production Wrangler static-only configuration.
- **CI foundation 452 tests passed, zero failed**, after the new tests; this is a static/offline regression, **not** a live billing, authentication, or judge inference test.
- **Operational judgment:** promotional credits can fund some eligible calls if valid, but deploying real inference still requires verified financial controls, genuine full-pass login and gateway, and separately requested owner consent. Continue as **NO-GO** until those are evidenced.

## October 29 late evening — both endpoints require signed judge auth (offline)

- Added `cloudflare/judge-authenticated-offline-pipeline.mjs`, an **unbound, nonnetworked** integration wrapper that verifies the trusted signed Cloudflare Access JWT **before simulated session issuance** and **again before simulated generation**. Missing, forged, expired, wrong-audience, or unapproved-identity credentials deny **before** mock Turnstile, CSRF session consumption, anti-abuse checks, token/pricing preflight or quota reservations.
- Added `test/judge-authenticated-offline-pipeline.test.js`. Synthetic RSA keys and mocked Durable Object ledgers verify both successful offline checks and denials without mutating mock counters. A regression checks that supplied options **cannot substitute a valid different request** for the actual HTTP request being authenticated.
- Foundation CI **459/459 passed, 0 failures**. The existing `wrangler.jsonc` is still static-only. **No real Access application, Worker route, third-party API, secrets, deployment, merge, provider usage or billable traffic.**
- **Further security gap:** authenticating both requests is necessary but not sufficient for production. The prototype **does not bind the signed Access subject to the previously issued one-use session**, does not securely refresh Access JWKS keys, does not protect a newly deployed Worker by actual Access policy, and has no cost-safe provider transport. All remain explicit NO-GO release blockers.

## Offline test / actual evidence matrix

| Safety requirement | Offline status | Missing production evidence |
| --- | --- | --- |
| Static public Cloudflare `main` stays no-network | Existing regression tests pass | Owner-approved production change must remain separate |
| Canonical SQLite Durable Object rate, one-use session, quota, emergency stop | Local `workerd` mocks exercise mechanisms | Real Cloudflare bindings, provisioning, rollback and persistence |
| Turnstile verify with exact hostname/action | Mock response transport only | Real secret and actual Siteverify over network |
| Judge identity | **NOT IMPLEMENTED** | Verified Access policy and signed JWT in Worker; authorized judge delivery |
| Judge requests and capacity | Single fictional case, **20-lifetime mock quota** | Organizer accepts input scope, capacity for full pass, correct durable policy |
| Nebius generation transport | One prior owner-only real LOCAL test; judge Worker mocks | Owner-approved real server transport, usage accounting, privacy and cost validation |
| Real spending limit | **NOT VERIFIED** | Provider-enforced bound or separately approved safe alternative |
| Online judge test | **NOT DONE** | Independent authorized end-to-end test (can be billable) and externally confirmed judge login |
| Availability through December 23 | **NOT VERIFIED** | Monitored service and outage/expiry response plan |

## Release gates / required owner input (NO SHORTCUTS)

**Until all checks below are evidenced, the default recommendation is NO-GO and static submission remains unchanged.**

- **Organizer scope:** response on fictional-only prompts; if not answered, assume judge functionality must allow a credible full workflow, not just one canned output.
- **Identity delivery:** judge email/identity method and legitimate secure invitation path supplied/approved by owner; no guesswork.
- **Financial exposure:** owner privately verifies a provider-side stop or other arrangement compatible with their fixed maximum; *do not publish the maximum*.
- **Implementation:** independently reviewed Worker, Access JWT validation, true provider transport, real Turnstile, durable accounting, emergency stop, data-handling policies, and no-retry limits.
- **Owner actions:** *separate express approval* for (A) deployment, (B) any potentially billable model test, and (C) any release of judge-specific access instructions.
- **Evidence:** complete verified judge-flow, predictable error handling and operating plan through December 23. Passing mock tests alone is not proof of compliance.

**Safety statement:** This document must not be converted to an executable deploy/runbook or merged into `main` by automated workflows. Secrets are never placed in GitHub or in chat. In particular, `wrangler secret put` deploys an updated Worker version immediately; even secret staging requires a separate approved path. See [Cloudflare secret handling](https://developers.cloudflare.com/workers/configuration/secrets/).
