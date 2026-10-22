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

## October 21–22, 2026: Turnstile server-binding rehearsal
- [x] Added an isolated Worker-side **binding contract** named `JUDGE_TURNSTILE_SECRET`; it reads the value from a future trusted Cloudflare server environment, never from the browser or repository. **The actual secret has NOT been set up or accessed.**
- [x] Only an **explicitly injected test transport** is allowed. There is no fallback network fetch, no real Siteverify call, no NVIDIA request, and no public Worker route.
- [x] The test handler refuses missing/invalid/mistaken site-key-as-secret values; verifies exact hostname/action and origin via fake Siteverify; checks replay, bad payloads, false verification and the emergency stop; all with canonical local SQLite Durable Object sessions.
- [x] Local Cloudflare workerd/SQLite CI **37/37 passed** on this safety branch. Production `wrangler.jsonc` remains assets-only, without secrets, Worker bindings or enabled model inference.
- [ ] **No live secret provisioning** until a separate approved Worker version, financial-risk agreement and launch checklist are ready. Cloudflare documents that `wrangler secret put` creates a version **and deploys it immediately**; never run it casually to prepare this project. A dashboard secret addition also requires a deployment. See https://developers.cloudflare.com/workers/configuration/secrets/
- [ ] Real Siteverify connectivity, a secret stored exclusively in Cloudflare, server-side abuse controls, judge UI integration, provider cost controls and an explicit owner-approved deployment are still blockers.

## October 22, 2026: Nemotron fixed request builder
- [x] A non-networked request-envelope builder uses only the **approved fictional beginner workshop** and the pre-existing four-platform SocialSpark prompt. It rejects client-supplied prompts, model overrides, additional fields, and arbitrary post text.
- [x] The model is fixed to `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B`, with `max_tokens:1250`, `stream:false` and no retry mechanism.
- [x] It refuses missing, malformed, or over-limit **simulated** trusted token-counter results and never outputs provider authorization, API credentials or an HTTP request.
- [x] Foundation tests: **392/392 passed** on this safety branch; production `main` stays static-only.
- [ ] The **actual model-compatible server tokenizer is NOT integrated**. A test callback is not authoritative token measurement or billing protection. A separately reviewed Worker implementation and provider billing controls remain required.
- [ ] No real Nemotron call, provider transport, public inference API, or runtime secret has been configured. This is NOT a live demonstration.

## October 22, 2026: session HTTP response boundary, still not deployed
- [x] Added an unbound, **local-test-only** HTTP response adapter for `POST /api/judge-demo/session`, using the existing strict request verifier, fake Turnstile Siteverify, shared SQLite-backed one-use sessions, and an emergency stop. No production Worker imports it.
- [x] A successful **simulated** session returns only an ephemeral CSRF token and a `Secure; HttpOnly; SameSite=Strict` cookie. It never returns a model answer or inference permission.
- [x] Generation requests always return `503 judge-live-ai-disabled`, even with valid test session dependencies. Missing transport, invalid origin, unsupported method, failed challenge, and stopped service never expose a session.
- [x] Real local Cloudflare workerd/SQLite CI: **44/44 passed**, including seven new HTTP boundary tests. Original `main` remains assets-only.
- [ ] This helper must remain excluded from the production Worker until separately authorized secure release. A mock Siteverify response is NOT real bot verification; no actual secret has been provisioned.
- [ ] No account-level provider hard cap verified. Budget estimates and usage reservations do not guarantee invoice totals. Do not activate live AI or paid API without separate authorization.

## October 22, 2026: isolated Siteverify outbound transport
- [x] Reviewed Cloudflare's official [Turnstile server-side validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/) contract: HTTPS JSON POST to the exact Siteverify URL; 300-second token validity and one-time redemption.
- [x] Prepared a no-default-network, no-retry transport adapter. It checks exact origin, POST method, content type, bounded `secret` and `response` fields, timeout signal, no redirects, and no unexpected visitor metadata; it reconstructs a canonical request rather than forwarding caller extras.
- [x] Integrated the adapter into **local-only** HTTP + SQLite tests with an injected fake outbound sender. A success verifies only simulated session issuance, **never AI inference authorization**. Network failure must deny without a cookie or global rate/quota charge.
- [ ] No production entrypoint imports the transport. No real Siteverify request or key provision has occurred. Connecting a real network sender and secret must await separate deployment approval; the provider model API is likewise disabled.
- [ ] A passing Turnstile challenge is an anti-abuse control, not authentication, a guaranteed prevention of denial-of-service, a Nebius billing cap, or permission to send paid model requests.
- [ ] Do not run `wrangler secret put` to stage a secret: Cloudflare documents that it immediately deploys a Worker version. Review an owner-controlled staged-version release instead when separately authorized.

## October 22, 2026: fixed-prompt admission precheck (not model token count)
- [x] Official NVIDIA Nemotron 3 Nano tokenizer artifacts are published (FP8/BF16); NVIDIA documents `AutoTokenizer.apply_chat_template(..., add_generation_prompt=True)`. These do **not** prove the exact chat template/extra parameters used by Nebius' particular hosted endpoint. References: https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8 and https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16
- [x] The server-only fixed fictional request is audited for exact allowed messages, roles, model, temperature, `max_tokens`, no stream and <=1200 JSON wire bytes (current fixture: **1038 bytes**). Arbitrary user posts, parameter overrides and changed prompts are refused before any tokenizer callback. The audit returns `authoritativeTokenCount:false` and `providerCallsAuthorized:false` explicitly.
- [x] Added tests for prompt mutation, token-provider absence and spoofed settings. Production Worker still does NOT import this code.
- [ ] Wire size is only an early size guard. **Do NOT treat 1038 JSON bytes as a token count or a guarantee against provider billing.** Before any real model call, verify the model-compatible chat template and server-side tokenizer, and reconcile against the provider's authoritative usage object.
- [ ] NVIDIA Nemotron 3 Nano supports reasoning; reasoning can consume the generation token allowance. Do not assume `max_tokens:1250` guarantees four usable final drafts. Verify hosted support for disabling thinking or another compatible approach **without an unauthorized billable call**. No undocumented `extra_body` flags have been inserted.
- [ ] The official [Devpost hackathon rules](https://nebiusglobalaihackathon.devpost.com/rules) require a runtime Nebius call (or deployment on Nebius AI Cloud) and free, unrestricted judge access through Dec 15. Static examples and a shared cap alone do not establish eligibility; organizer clarification pending.

## October 22, 2026: full offline judge-path integration test
- [x] Added end-to-end local Cloudflare workerd/SQLite tests spanning canonical one-time sessions, a fake Turnstile result, persistent quota reservations, exact fictional Nemotron request, pinned **reference estimate**, and the established four-platform content-safety validator.
- [x] A **simulated** valid response yields four fake, reviewed platform drafts without touching the public Worker, Cloudflare Siteverify, Nebius or any billing API. Returned modes remain labeled offline and `providerCallsAuthorized:false`.
- [x] The test asserts that mismatched provider-style usage is rejected **after** reservation and that a possibly billable failed attempt is never refunded automatically; a pricing check denial stops before quota reservation. Emergency stop blocks the request and the existing actual Worker continues HTTP 503/404.
- [ ] This is not evidence that the hosted Nemotron request succeeds, that the provider's model uses the same token count/response schema, or that the current 20-attempt cap is compliant with judge access. A separately approved live verification remains necessary.

## Decisions awaiting independent evidence and approval
1. **Organizer's acceptance:** The proposed shared 20-attempt lifetime gate could exhaust before judging ends December 15, 2026. Obtain organizer guidance before treating a restricted demo as compliant. Never present offline examples as runtime inference.
2. **Spend exposure:** Verify model availability, current input/output pricing, billable failures, maximum request and response size, the privately verified billing controls, and whether an account-level enforceable hard stop is supported. The $1 application-side reservation is NOT a Nebius guarantee. Keep account/payment details private.
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
- **Stop/go rule:** no new paid provider requests or live deployment until the owner separately approves actual possible charges, and provider hard-cap uncertainty and private billing risk are reviewed.

## Local testing vs actual financial safety
- The 20 lifetime attempts / five cents reservation is an **application simulation**, not a Nebius account budget or guaranteed bill maximum. A cap on attempts may also conflict with unrestricted judging access.
- The posted-rate token estimate assumes one successful call, no retry, and counts exactly as expected. It cannot include unreported tokens, billing anomalies, abuse before enforcement, or other account usage.
- The emergency-stop implementation is a local, unbound test fixture. No operational public kill switch or verified provider-level stop is currently deployed.
- Pricing, response shape, current model availability, and account payment settings require independent real verification before activation.
