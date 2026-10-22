# SocialSpark — Judge Access Evidence & Go/No-Go Decision (2026-10-22)

> **STATUS: NOT LIVE FOR JUDGES. NO AUTHORIZATION TO DEPLOY OR SPEND.**
>
> This is an audit note on an **unmerged safety branch**, not a published judge endpoint, a release promise, or a waiver of organizer rules. The public Cloudflare site still serves static offline sample drafts.

## What has actually been demonstrated

**On 2026-10-22, the owner manually initiated ONE authorized, potentially billable NVIDIA/Nebius inference through the existing local Node.js owner-only browser path** (`127.0.0.1:4173`), after reviewing the fixed fictional neighborhood-shop idea, authorizing one request, and entering the private provider key into a hidden local PowerShell prompt (not GitHub/browser source).

The local UI reported a real provider response and four distinct, locally validated drafts: Facebook, Instagram, LinkedIn, and TikTok. The owner reviewed them and separately approved their transfer to the four editable platform cards. No automatic publishing occurred. The owner stopped the local server and the persistent one-attempt lock must not be deleted/reused.

**Evidence boundary:** These observations were reported through owner-provided screenshots. They are not an independently captured provider invoice, authoritative usage record, third-party network log, public uptime test, or a demonstration of unlimited judge access. The owner-only success is **not** proof that Cloudflare's public production Worker has NVIDIA inference enabled.

Offline regression evidence remains separate:
- Owner-only fixed shop trial: draft [PR #32](https://github.com/DiscoverAIDani/socialspark-hackathon-release/pull/32), **279/279** foundation tests passed; automated external inference is mocked.
- Status and test-label corrections: draft [PR #33](https://github.com/DiscoverAIDani/socialspark-hackathon-release/pull/33), **283/283** foundation tests passed; no new live request.
- Local Cloudflare workerd/SQLite judge safeguards: draft [PR #29](https://github.com/DiscoverAIDani/socialspark-hackathon-release/pull/29), **50/50** local integrated runtime tests passed with fake external providers/Turnstile. Draft [PR #31](https://github.com/DiscoverAIDani/socialspark-hackathon-release/pull/31) adds static-release locks.
- The deployed public site remains **offline-only**; its production `wrangler.jsonc` has an assets directory, with no Worker `main`, public session issuance, secrets, Durable Object bindings or real NVIDIA API handler.

## Official eligibility risks (not resolved)

Source: https://nebiusglobalaihackathon.devpost.com/rules

- Submissions close **Friday October 30, 2026, 10:00 AM PDT**.
- The official testing clause requires judges/sponsor/administrator to be able to use the working project **free of charge and without restriction**, through **December 15, 2026**.
- The required Nebius/NVIDIA implementation must be real: a locally demonstrated provider call is materially stronger evidence than a fully simulated demo, but **the public static demo alone does not demonstrate runtime inference**.
- The rules permit judges to rely on a writeup/video without using the app; this **does not waive** the project's requirements. Do not claim the owner-only local test makes the public site compliant.

Organizer clarification: The participant asked whether **fictional prompts only + a shared 20-attempt lifetime cap** meets the testing rules in https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis. As of the October 22 check, there was **no organizer answer**. Another participant's support is not organizer permission.

## Financial safety invariants

- User's maximum acceptable **out-of-pocket financial exposure is $25 for October 30–December 15, 2026**.
- An app-level lifetime quota, per-token reference price, local request counter, and software emergency stop **do not guarantee a provider-side billing ceiling**.
- **No enforceable Nebius account/provider-side $25 cap has been verified.** This is a hard blocker to suggesting assured financial safety, even if a single call is estimated to be inexpensive. Do not re-open top-up research unless a genuinely new issue requires it.
- A 20-request shared quota may itself prevent valid unrestricted judge use. Do **not** silently increase or remove it, or treat its present tests as demonstrating organizer compliance.
- No live deployment, paid test, provisioned secret, production CLI command, Worker activation, or merge is authorized by this document. There is no permission for a second live request.

## Decision matrix

| Scenario | Judge-access answer | Financial answer | Action without separate approval |
| --- | --- | --- | --- |
| Organizers explicitly accept restricted fixed-prompt demo and a finite allowance | Conditional only: still requires a deployed, working hosted service | Requires independently acceptable financial controls, with no guarantee inferred from quotas | Continue offline architecture/test review only |
| Organizers require unrestricted live use | Current fixed-text + 20-lifetime design does **not** establish compliance | Uncontrolled public usage conflicts with an unverified $25 provider cap | Do **not** activate live inference |
| No organizer reply by October 26 | **Unknown**; silence is not acceptance | Provider hard cap remains unverified | Preserve accurate offline submission; do not imply eligibility |
| Financial controls remain unverifiable on October 28–29 | Not a release gate pass even with simulated 100% CI | Owner's maximum acceptable exposure takes precedence | Submit truthful existing functionality before cutoff, without speculative live claims |

## Future release prerequisites — all currently blocked

1. Document written organizer access interpretation (or explicitly record no response and assume no exception).
2. Resolve **financial exposure** within the owner's $25 maximum by independently verifiable controls; failing that, **no launch**. No unapproved payment or paid request.
3. Design and offline-test a public **HTTPS Worker** with real Turnstile Siteverify, trusted one-use session, strict origin/CSRF, server-only secret bindings, Durable Object quota/rate and authenticated emergency stop. Passing mocked tests is not live proof.
4. Establish model-compatible **server-side token counting** and trustworthy provider response/usage verification. Verify model and pricing under separately authorized conditions.
5. Obtain **separate explicit owner authorization** for exact deployment and for any potentially billable inference, then conduct a separately authorized end-to-end test; don't reuse the owner-only trial authorization.
6. Verify actual judge access and availability through **December 15**. Do not promise uptime or unrestricted use based on a local test.

## Submission wording guardrails

Accurate: *“SocialSpark's current public website demonstrates offline four-platform draft editing and privacy checks. In a separate, owner-authorized local test, the NVIDIA Nemotron 3 Nano integration through Nebius Token Factory successfully generated four platform-specific drafts; the owner reviewed and applied them. Public live inference is not yet enabled.”*

Not accurate: *“Judges can freely generate live NVIDIA drafts on the public demo,”* *“NVIDIA is free/unlimited through December 15,”* or *“The hosted model is protected by a provider-enforced $25 cap.”*

The YouTube demonstration and Devpost working URL are already recorded as complete. This review **does not repeat or alter** them. Do not change Devpost content on the user's behalf.

**Release state:** STOPPED. GitHub draft only, public static-only, no paid request, no deployment, no live judge access.
