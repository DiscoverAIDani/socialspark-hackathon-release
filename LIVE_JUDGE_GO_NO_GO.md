# SocialSpark — Decision-ready go/no-go packet
**Prepared October 22, 2026. Release status: HOLD. Not a deployment approval.**

## Snapshot: no need to redo completed Devpost fields

- The **public YouTube video** is already recorded and linked on Devpost: https://youtu.be/WAiW3YW-UJw (1:25).
- The **working demo URL** was already entered: https://socialspark-hackathon-release.daniellewilcott.workers.dev/.
- The last shared Devpost state was **4/5 steps complete, DRAFT**, not submitted. Do not recreate the video or re-enter the URL.
- Official submission deadline: **October 30, 2026, 10:00 a.m. PDT.**
- Official judging runs **December 1–15**, and access must remain free and unrestricted through December 15.
- Rules: https://nebiusglobalaihackathon.devpost.com/rules
- Organizer forum question about a 20-request shared budget still has **no organizer reply** as of this review: https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis

## Owner-only financial authorization is required

- The owner maintains their **personal financial risk ceiling and billing settings privately**, outside this public repository.
- No budget or app-side quota constitutes consent to use a payment method, make a billable request, modify provider billing, provision secrets or deploy.
- There is **NO verified account-level provider spending hard stop**. The application quota is not a guaranteed invoice cap.
- Cloudflare Free plan resource limits and app-side quotas are secondary guardrails; they do not guarantee Nebius billing.

## Candidate #1: keep the static demo only
- **Risk:** no new inference costs; currently working.
- **Eligibility risk:** a historical real Nemotron test alone does not show a current runtime Token Factory call. The offline-only demo may not satisfy the working-application requirement.
- This remains the default if no safely authorized, functional live pathway exists.

## Candidate #2: restricted live fictional-prompt judge endpoint
- **What is prepared:** isolated draft code and passing local Cloudflare security tests for Turnstile, hashed session+CSRF, global rate, SQLite quota, emergency stop, immutable fixed request and fake response validation.
- **Not ready:** real Siteverify secret/transport and deployment, actual Nebius API secret and model transport, provider tokenization and usage audit, exact provider pricing at launch, safe operator provisioning and emergency operations.
- **Eligibility risk:** fixed prompts plus a shared total of 20 inference attempts may be a **restriction**, contrary to published requirement. Do not assert compliance without explicit organizer confirmation.
- **Financial risk:** even if the app reserves a dollar of fictional usage, it is not a provider-enforced ceiling; tokens for failed or partial calls may still be billed.

## Candidate #3: genuinely accessible judge service with abuse controls
- This is closest in spirit to a fully usable runtime demo, but it cannot be interpreted as unlimited billable inference.
- To respect the owner's exposure ceiling, we still need a **provider-side enforceable balance/cap or other independently verified no-charge arrangement**. Current evidence does not establish one.
- Broad availability and a strict shared lifetime cap conflict; DO NOT quietly remove the cap or describe a restricted endpoint as unrestricted.
- A publicly available unthrottled model endpoint invites third-party traffic and can consume credits or cause charges. Do not launch without explicit risk agreement.

## Concrete release gate — all must be answered before any deployment or paid request

- [ ] **Rules:** written organizer acceptance of restricted demo, or revised access architecture with documented defensible compliance rationale.
- [ ] **Costs:** documented actual provider maximum financial exposure or a separate explicit owner risk acceptance that acknowledges the absence of a hard stop. Do not record the owner's private ceiling in a public repository.
- [ ] **Server:** final security review of a real Cloudflare Worker with no publicly writable quota reset or secret leakage; production access/rollback and emergency stop tested.
- [ ] **Secrets:** owner provisions private Turnstile and Nebius secrets only through an approved secure server interface, never chat/GitHub/client JS.
- [ ] **Verification:** real Cloudflare Siteverify success, hostname/action/freshness checks and replay control; fake tests are not substitutes.
- [ ] **Tokens:** provider-compatible chat-template/tokenizer or explicitly accepted conservative risk for the **fixed** prompt; never label JSON byte count as billable token count.
- [ ] **Model:** output can actually return four valid drafts within max output tokens; reasoning tokens, timeouts and inconsistent usage handled, real billing reconciled.
- [ ] **Authorization:** owner separately authorizes (A) deployment, and (B) a limited paid inference test; approval of one does not authorize the other.
- [ ] **Submission:** confirm public source LICENSE, README, required Devpost text/feedback/track; change draft to SUBMITTED before deadline with proof.

## What must NEVER happen on this draft branch

- Never merge queued security PRs to `main` or deploy by assuming green tests mean production approval.
- Never introduce API keys, card information, raw Turnstile tokens or user post content into the public repo or logs.
- Never relabel a mock/static response as real NVIDIA inference.
- Never add a private/hidden auto-retry that can lead to extra requests.
- Never install real secrets via a command that triggers immediate deployment without explicit approval.

**Current decision:** HOLD live activation. The code can continue being tested and documented safely. When the release gates are satisfied, request exactly the missing independent owner authorizations.
