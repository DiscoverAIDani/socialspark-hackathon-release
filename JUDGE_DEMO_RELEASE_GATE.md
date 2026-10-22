# SocialSpark — Judge AI Demo Release Gate (planning only)

**Status: BLOCKED. DO NOT DEPLOY LIVE NVIDIA/Nebius calls.**
This checklist documents the gap between the public, static offline demo and an optional restricted live judge demo. It is not an activation plan and grants no spending authorization.

## Verified state
- [x] Public Cloudflare Free static site serves four offline example drafts, with privacy warnings, acknowledgement reset, copy controls, and manual reminders.
- [x] Public GitHub repository contains the Node.js owner-only NVIDIA Nemotron 3 Nano integration; a separately authorized, earlier single live test generated and validated four drafts.
- [x] Public site is static-only (wrangler.jsonc assets), with no public inference endpoint or provider credentials.
- [x] The judge security building blocks are on unmerged safety branches. Local workerd/SQLite tests cover session issuance, replay, global quotas, persistent emergency stop, and simulated HTTP routing. The integrated pipeline uses mocks and always reports providerCallsAuthorized:false.
- [x] Offline cost-envelope tests compare the planned specific model against Nebius published October 21, 2026 reference rates ($0.06 input / $0.24 output per 1M). At 2,000+1,250 maximum tokens this reference computes $0.000420 per request, **not an invoice or hard cap**.
- [x] Offline response validation checks mocked OpenAI-style usage totals, token ceilings, price reference, model name and safety-screened four-platform drafts; actual billable provider usage/response fields have not been verified end-to-end.
- [x] The user has asked Devpost organizers whether a capped, fictional-prompts-only judge demo meets their access requirements; response pending.
- [x] Provider account and payment details are deliberately **not** documented in the public code repository. Billing controls need a private, direct account check before approval.
- [ ] Provider-enforced hard spending cap demonstrated. **NOT VERIFIED.** App-side reservation is not a provider-side cap.

## October 21–22, 2026: verified local Cloudflare RPC integration
- [x] Canonical local Durable Object bridge now targets one **fixed** named instance each for sessions, global rate, lifetime quota, and emergency stop. No browser-selected object IDs or fallback in-memory quota.
- [x] Real local Cloudflare SQLite tests verify hash-only one-time issuance/consumption via internal RPC, no replay after eviction, and 80 concurrent reservations producing exactly 20 allowed + 60 denied under the existing **prototype** lifetime quota.
- [x] Real local session-rate tests verify 25 simultaneous reservations result in exactly 3 allowed within the fixed minute window.
- [x] At the end of those tests, the **actual default Worker** still returns HTTP 503 for AI generation and 404 for public session issuance. The current site's production Wrangler configuration remains static assets only.
- [x] Cloudflare local runtime CI **31/31 passed** on the development branch; foundation tests also passed.
- [ ] The proposed shared 20-request cap is **NOT established as Devpost compliant**. A deliberate limit can block legitimate judges and is NOT free unrestricted access.
- [ ] Real Turnstile hostname/sitekey/secret, Siteverify, trusted model tokenizer, exact price and provider-usage verification, provider-enforced spending limit, secret provisioning, authenticated operations, production rollout and independent authorized live test are **NOT done**.

## October 21, 2026: owner-created Cloudflare Turnstile widget
- [x] Owner created a **Managed** widget named SocialSpark Judge Demo on the existing `socialspark-hackathon-release.daniellewilcott.workers.dev` hostname; future security-rule skipping was left OFF.
- [x] Public site key is pinned in `judge-preview/turnstile-public-config.mjs` **outside public/**; expected verification action agrees with the existing offline server Siteverify verifier.
- [x] Browser-facing ephemeral token lifecycle and exact-origin checks are unit-tested with fake Turnstile. CI foundation tests **386/386 passed** after reviewing the port guard.
- [ ] The owner has NOT shared or configured the private Turnstile secret. **Never ask for it in chat or put it in GitHub**; future Cloudflare secret binding requires owner-directed setup on a separately approved runtime.
- [ ] No actual Turnstile script, challenge or Siteverify call has run. The public website continues using its no-network CSP and offline-only content.
- [ ] All real AI / billing launch gates still apply, independently of the Turnstile widget.

## Decisions awaiting independent evidence and approval
1. **Organizer's acceptance:** The proposed shared 20-attempt lifetime gate could exhaust before judging ends December 15, 2026. Obtain organizer guidance before treating a restricted demo as compliant. Never present offline examples as runtime inference.
2. **Spend exposure:** Verify model availability, current input/output pricing, billable failures, maximum request and response size, actual auto-top-up state, and whether an account-level enforceable hard stop is supported. The $1 application-side reservation is NOT a Nebius guarantee. Keep account/payment details private.
3. **Separate owner authorization:** Obtain explicit approval for the exact live deployment, acceptable actual financial exposure, Cloudflare Free resources, and each new potentially billable test. A previous one-off test is not blanket approval.
4. **Real infrastructure:** Implement and review one canonical Cloudflare SQLite Durable Object for global quota, globally enforced session issuance limits, one-use CSRF/session tokens, HTTPS origin controls, and replay/timeout/race denial. Test on actual workerd/Cloudflare Free runtime before exposing any binding.
5. **Bot/DoS controls:** Configure actual Turnstile with exact public hostname and server-side Siteverify. Turnstile is not authentication.
6. **Secure backend:** Never expose API key to browser, repo, logs or URLs. Verify server-side token counting and immutable allowed fictional prompts. Fail closed on service, storage, price, or provider uncertainty. No automatic retries.
7. **Release safety:** Keep default disabled regardless of client flags; document emergency shutdown; test quotas after restarts, concurrent requests, expiration, and partial failures; verify the original private repo stays private.
8. **Submission accuracy:** Keep Devpost wording aligned with what judges can actually invoke: honest offline fallback, historical successful live test, and independently verified live judge access only if approved.

## Manual stop/go checklist
- [ ] Organizer access interpretation documented.
- [ ] Public endpoint safely tested without paid inference.
- [ ] Financial exposure decision documented and separately authorized.
- [ ] All required security gates passed in runtime, with no secrets leaked.
- [ ] Separate approval for exactly scoped live activation granted.
- [ ] Independent end-to-end judge test authorized and passed.
- [ ] Verified judge access retained through December 15, 2026.

**No changes to live Cloudflare site. No API calls. No payments. No secret provisioning. Do not merge safety branches or activate live inference without separate permission.**

## October 2026 no-reply fallback and safe deadline
- **Official submission cutoff:** Friday October 30, 2026, 10:00 AM PDT. Do not leave the first submission attempt until the last morning.
- **Judging availability requirement:** through Tuesday December 15, 2026. The rules say free access **without restriction**, though judges can choose to judge from descriptions/video alone. This does **not** constitute permission for an offline-only substitute or a 20-call shared cap; organizer interpretation is still unresolved.
- **October 26 gate:** in the absence of guidance, default to a truthful offline submission, not unapproved paid inference. Review separately whether a live architecture can satisfy both provider spend safety and the judging rule.
- **October 28–29 target:** submit the most accurate completed demonstration before the Oct 30 cutoff; do not invent runtime functionality. Correct or update only within Devpost's permitted submission rules.
- **Stop/go rule:** no new paid provider requests or live deployment until the owner separately approves actual possible charges, and payment-method / top-up / provider hard-cap uncertainty is reviewed.

## Local testing vs actual financial safety
- The 20 lifetime attempts / five cents reservation is an **application simulation**, not a Nebius account budget or guaranteed bill maximum. A cap on attempts may also conflict with unrestricted judging access.
- The posted-rate token estimate assumes one successful call, no retry, and counts exactly as expected. It cannot include unreported tokens, billing anomalies, abuse before enforcement, or other account usage.
- The emergency-stop implementation is a local, unbound test fixture. No operational public kill switch or verified provider-level stop is currently deployed.
- Pricing, response shape, current model availability, and account payment settings require independent real verification before activation.
