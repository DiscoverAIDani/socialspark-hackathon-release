# SocialSpark — Judge AI Demo Release Gate (planning only)

**Status: BLOCKED. DO NOT DEPLOY LIVE NVIDIA/Nebius calls.**
This checklist documents the gap between the public, static offline demo and an optional restricted live judge demo. It is not an activation plan and grants no spending authorization.

## Verified state
- [x] Public Cloudflare Free static site serves four offline example drafts, with privacy warnings, acknowledgement reset, copy controls, and manual reminders.
- [x] Public GitHub repository contains the Node.js owner-only NVIDIA Nemotron 3 Nano integration; a separately authorized, earlier single live test generated and validated four drafts.
- [x] Public site is static-only (wrangler.jsonc assets), with no public inference endpoint or provider credentials.
- [x] The judge security building blocks are on unmerged safety branches. The integrated pipeline uses mocks and always reports providerCallsAuthorized:false.
- [x] The user has asked Devpost organizers whether a capped, fictional-prompts-only judge demo meets their access requirements; response pending.
- [x] Nebius dashboard showed $50 account balance, $0.88 trial credits (four days remaining when inspected), and a saved card.
- [ ] Provider-enforced hard spending cap demonstrated. **NOT VERIFIED.** App-side reservation is not a provider-side cap.

## Decisions awaiting independent evidence and approval
1. **Organizer's acceptance:** The proposed shared 20-attempt lifetime gate could exhaust before judging ends December 15, 2026. Obtain organizer guidance before treating a restricted demo as compliant. Never present offline examples as runtime inference.
2. **Spend exposure:** Verify model availability, current input/output pricing, billable failures, maximum request and response size, and whether an account-level enforceable hard stop is supported. A $1 application-side reservation is NOT a Nebius guarantee; the $50 balance and saved card increase possible exposure.
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
