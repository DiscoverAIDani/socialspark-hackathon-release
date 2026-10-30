# SocialSpark — External judge access (draft only; NO-GO for paid inference)

Updated 2026-10-29 America/Los_Angeles. This file is release planning, **not permission** to deploy or change Cloudflare policies. The only currently approved live test is the separately deployed **no-AI** `socialspark-judge-auth-test`. Keep that test Worker protected with **Cloudflare account members / All traffic**. Do not grant outside judges Cloudflare account membership, do not change the public `socialspark-hackathon-release` site, and do not merge this draft safety branch as part of judge setup.

## Grounded status

- Real owner-only Cloudflare Access sign-in was verified on `socialspark-judge-auth-test.daniellewilcott.workers.dev`: a fresh signed-out Incognito session redirected to Cloudflare Access; a legitimate Cloudflare account member reached the Worker; `ctx.access.getIdentity()` returned the signed-in identity; an authenticated response explicitly returned `inferenceEnabled:false` and `providerCallsAuthorized:false`.
- This does **not** prove an outside judge can sign in. Current Worker-level Allow policy admits **Cloudflare account members only**.
- Cloudflare supports an externally reachable Access application using a *specific list of email addresses* and a **one-time PIN** (OTP) identity provider, without giving those people Cloudflare account privileges.
- Organizer's response accepted a dedicated judge login and reserved capacity, but the official rules indicate judging **December 9–23, 2026**. Owner conservatively selected keeping genuine availability through **December 23 end-of-day PST**. This plan does not claim that the organizers supplied judge email addresses or accepted fictional-only prompts.
- The private/offline candidate `cloudflare/judge-external-eligibility-offline.mjs` checks a **signed-in, direct Worker Access context**, exact approved email list, matching application audience, and a server-provided time window. It **does not** authorize inference, provision identity providers, or run on the deployed test Worker.

## Proposed judge-only access configuration — NOT APPLIED

1. **Obtain verified reviewer identities or an officially accepted invitation mechanism** through a secure channel. None are in this repo. **NO broad email-domain wildcard, Cloudflare account membership invitation, shared administrator credentials, or app-wide Everyone/One-time-PIN Include rule.** If reviewer identities/accepted invitation mechanism are unavailable, the judge-only restricted route is still blocked.
2. **Use a distinct future judge application/Worker**, not the existing public site and not the already verified owner-only test Worker. Protect that specific Worker at the **All traffic** level (production + previews). Keep account-wide Workers Access **OFF** and do not add an overriding public hostname bypass.
3. When identity details are approved and a separate change is authorized, in **Zero Trust > Integrations > Identity providers**, add **One-time PIN** if it is not already configured; new Zero Trust organizations use Cloudflare account sign-in by default. In an Access policy for the future **judge Worker only**, choose **Allow** with **Include: Emails** listing exact approved individuals, with OTP configured as an allowed/required sign-in method as appropriate. **Selecting Login Methods: One-time PIN as the Include rule without an exact email selector would allow arbitrary email holders.**
4. During actual deployment review, explicitly verify the policy's target Worker identifier, that every associated `workers.dev` and preview route is protected, evaluation window, session duration, missing-email behavior, and that the public site is still accessible unauthenticated.
5. Test in a fresh Incognito browser with one **authorized external test identity** (approved in advance) and one **unauthorized outsider identity** (no credentials shared, no log leaks). Observe both denied and permitted requests, not just a sign-in screen. Tests must not generate paid NVIDIA/Nebius requests.
6. Before any paid inference authorization, add **server-side** independent eligibility checks (actual Access AUD and exact judge identity allowlist), verified subject-to-one-use-session binding, persistent global attempt/cost reservations, no silent retries, and an owner emergency stop. `ctx.access` does **not** propagate automatically through Service Bindings or RPC; pass only trusted, verified identity proofs to internal storage. Cloudflare's static-assets router also does **not** pass `ctx.access` to the user Worker; keep this direct Access check in a distinct, dynamic Worker.
7. Judge access must remain **nonbillable / disabled** until both model-compliance questions and the $25 maximum financial exposure constraint are resolved and the owner gives fresh, separate permission for inference and any production deployment.

### Explicit login / authorization matrix

| Situation | Intended behavior |
|---|---|
| Fresh signed-out visitor | Access login/denial before Worker |
| Verified owner (on isolated owner test Worker) | Non-AI `access-authenticated-test-only` |
| An arbitrary email can request a PIN | MUST NOT be granted judge access |
| Verified external email absent from exact judge list | DENY |
| Verified external email on list but wrong Access audience | DENY |
| Verified invited judge inside approved date range | **Eligible for a later safety preflight only**; **no inference authorized** |
| Existing approved judge with stolen second judge cookie+CSRF | DENY; preserve legitimate user's session |
| Expired Access token, missing signing key, missing session ledger | DENY |
| Attempt to access outside the approved judging period | DENY |
| All guards valid but billing cap unverified | **NO PROVIDER REQUESTS** |

## Financial and release NO-GO gates

The owner's maximum permissible **total out-of-pocket exposure is $25**. Promotional credits, disabled auto-top-ups, mock quota ceilings and an application-side attempt counter are **not proof** that the provider cannot bill above $25. Nebius public billing documentation describes positive/negative balances and postpaid services but provides no verified, immutable provider-side hard stop before exceeding the owner's $25 limit. Do not re-open the already-confirmed auto-top-up investigation; do not ask the owner for repeated screenshots or payment information.

**Required before an actual model credential can be enabled:** credible enforceable provider-level hard financial containment or another verifiable method that caps all possible charges (including in-flight/concurrent requests, retries and model pricing) at no more than the owner's limit; a budget that allows genuine judge passes; a secure way to allocate and revoke judge access; confirmation of permitted prompt scope; production-backed test evidence; and **distinct explicit owner approval**. If any of these cannot be met, the correct outcome is **leave live inference disabled**, retain the static Devpost demo, and explain the shortcoming without making billing assurances.

## Dates and test environment

- Proposed owner-chosen judging window: **2026-12-09 00:00 PST** (`2026-12-09T08:00:00Z`) through **2026-12-23 23:59:59 PST** (exclusive end `2026-12-24T08:00:00Z`). This is a proposed server-side policy; it is not applied.
- There is deliberately **no real judge email list**, client cookie, Access JWT, private key, Nebius token, payment card, production Durable Object migration or live inference script in this file.
- The production site's `wrangler.jsonc` remains static assets only and is **not** connected to this draft judge eligibility module.

## Current official references

- [Cloudflare: protect a single Worker with Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Cloudflare: Access policy selectors and dangerous Everyone/OTP Include rules](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/)
- [Cloudflare: OTP identity provider and its setup](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)
- [Cloudflare: approved external users via OTP policies](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/)
- [Nebius Token Factory billing overview](https://docs.tokenfactory.nebius.com/other-capabilities/billing) (may change; not a provider-side hard-cap confirmation)
