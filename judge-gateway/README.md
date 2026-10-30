# SocialSpark judge-only inference gateway — NOT DEPLOYED

**Status (2026-10-30): OFFLINE-PREPARED / LOCKED / NOT APPROVED FOR LIVE TRAFFIC.**

The separate Cloudflare Worker is a prototype for an invite-only evaluation link. It is **not attached** to the current public SocialSpark site, Devpost submission, or Pages deployment. There are **no live Nebius calls** in its tests. No secrets or invite codes are checked in.

## Reviewable behavior

- Serves a small private judge page with **six fixed fictional ideas** and three writing tones. A judge cannot send their own text, phone number or unmasked social post. *Acceptance of fixed fictional prompts for judging is not confirmed by the organizer.*
- Requires a high-entropy 256-bit invitation code, entered in a password box and sent as a bearer header only (never URL/cookie/localStorage). Stores **only its SHA-256** in D1. Each invitation can be revoked. The judge must first click **Review exact fictional prompt**; the server creates a two-minute, single-use approval ticket bound to that invitation, exact prompt ID and tone. The judge then checks a separate consent box and completes Turnstile before generating. A client-supplied boolean alone is never sufficient.
- Requires same-origin HTTPS, strict JSON shape/size, fresh Cloudflare Turnstile **server-side** verification with action and hostname matching, and valid invitation **inside** a single atomic shared D1 reservation.
- D1 gate uses one atomic UPDATE conditioned on enabled flag, UTC evaluation window, total request allowance, invite state, unused exact-prompt ticket and **one active provider request globally**. It then consumes the ticket before inference. It increments the lifetime request counter **before** provider inference and does not refund failures. Unexpected database responses fail closed. A crash can leave the gate locked; manual inspection is then required.
- Requests use existing Nebius draft adapter and response validation. Output appears as text, for human review only. No automatic publishing, scheduling, copying, or retries.
- No prompt text, invite code, API key or generated output is written to persistent storage by this code. Provider and platform data handling still require independent confirmation.
- **Hard-coded financial-authorization cutoff:** 2026-12-15 23:59 Pacific (2026-12-16 08:00 UTC exclusive). Calls after that point are impossible with this revision, even if D1 remains enabled. Published judging continues to 2026-12-23, so further explicit financial authorization AND a reviewed code change would be required to serve judges after Dec 15.

## Explicit independent deployment and spending gates

Both of these secret/configuration flags must be set to exact values or all inference is disabled:

- \`JUDGE_GATE_ENABLED=EXPLICITLY_APPROVED\`
- \`JUDGE_BILLING_HARD_CAP_CONFIRMED=YES_PROVIDER_ENFORCED\`

**Neither flag is set by code or is permission from the owner.** They must not be set until:
1. The owner separately authorizes deploying this Worker and making potentially billable inference calls, including total hosting and provider exposure.
2. Nebius **account-side enforced maximum exposure** is verified, considering past and future charges and whether trial credits are actually usable. The existing $25 maximum out-of-pocket window is October 30 through December 15 only. Cloudflare hosting/D1 charges must also be considered. A locally coded quota is **not a financial hard cap**.
3. The exact NVIDIA replacement model ID, permissions, price schedule, output compatibility, model EULA, subprocessors, service agreement, zero-retention and opt-outs are verified for this account/use-case.
4. The organizer's response on fictional-only testing and judging-period availability is understood; access must support a genuine judge evaluation.
5. The owner approves a specific small provider request allowance and evaluation window. The D1 database starts **disabled with 0 allowed requests**.
6. Credentials/secrets are configured through Cloudflare's encrypted secret settings (never git or frontend), with secure access/account recovery, rate limiting at the Cloudflare edge, and a tested shutdown procedure.
7. Code undergoes independent security, dependency, abuse and accessibility review, including a real Cloudflare Turnstile + D1 integration test on a **non-billable mocked provider**.
8. The public Devpost entry and judge instructions accurately describe available functionality and avoid misleading claims about live AI.

**Do not merge or deploy this branch as a shortcut around these gates.**

## Configuration for a future *separately approved* deployment

Use a separate Worker, not the existing Pages public release. The intentionally inert \`judge-gateway/wrangler.example.jsonc\` is a template only, not a deploy command. Bind one new D1 database named \`DB\`, migrate \`judge-gateway/schema.sql\`, and create separate Turnstile keys restricted to the exact new Worker hostname. Do not use the existing public Turnstile site's secret by assumption.

Required Worker variables/secrets: \`JUDGE_ORIGIN\` (exact HTTPS origin), \`JUDGE_MODEL_ID\` (approved NVIDIA ID, never the retired Nano), \`NEBIUS_API_KEY\` (**secret**), \`TURNSTILE_SECRET\` (**secret**), \`TURNSTILE_SITE_KEY\` (public site key), and the two exact activation flags (**keep absent during development**). DB binding \`DB\` must be valid.

Before any live activation, manually configure D1 \`judge_gate\` for an **approved** interval and request allowance. The migration creates a row with \`enabled=0\`, \`max_requests=0\`, so zero inference is possible by default. If D1 fails, the gateway denies provider calls. A single stalled provider attempt may leave \`request_active=1\`; do not clear that flag without reconciling provider usage and billing.

On a trusted local machine, **only after authorization**, mint an invitation with:
\`\`\`bash
node judge-gateway/mint-invite.mjs judge_a 2026-12-15T23:59:00-08:00
\`\`\`
The command uses OS randomness and prints a 64-character invite code **once**, plus a D1 insertion statement containing **only its hash**. Deliver the secret code to an approved judge through a private channel; never include it in GitHub, logs, email links, URL query strings, Devpost public text, or a chat. Label judges pseudonymously. Revocation is via \`UPDATE judge_invites SET enabled=0 WHERE token_sha256=?\` through the controlled D1 admin channel.

Kill switch: set \`judge_gate.enabled=0\`, disable/revoke invitations, and disable \`JUDGE_GATE_ENABLED\` in Cloudflare. Check that no inference remains in flight and reconcile billing. Do not depend on stopping only the browser page.

## Testing

\`\`\`bash
npm test
\`\`\`
The judge gateway tests use an injected fake Turnstile verifier, fake Nebius HTTP transport and fake in-memory D1 with atomic-reservation and one-use-ticket semantics. They send **zero external requests**. Passing tests alone do **not** verify actual Cloudflare D1/Turnstile integration, real billable Nebius model compatibility, secure deployment, account hard spend cap, or organizer acceptance.

See also private planning issue #1 and the separate draft model-migration PR #2.

## References

- Cloudflare Turnstile server-side validation: https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- D1 Worker API: https://developers.cloudflare.com/d1/worker-api/
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Workers pricing (hosting also counts toward out-of-pocket limit): https://developers.cloudflare.com/workers/platform/pricing/
- Official rules: https://nebiusglobalaihackathon.devpost.com/rules

## October 30 public-source and budget review

- Nebius publicly lists \`nvidia/Nemotron-3_5-Lightning\` with public endpoint availability and published **$0.06 per million input tokens / $0.24 per million output tokens**: https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference . These are published per-token rates, **not** an account-side hard spending cap. Account entitlement, provider terms and actual response validation are still pending. Do not infer guaranteed billing limits from a modeled token estimate.
- Cloudflare Workers Free includes **100,000 requests/day** and D1 Free includes **5 million rows read/day and 100,000 rows written/day**, subject to the account's actual plan and usage. Cloudflare Workers Paid has a **$5/month** minimum plus overage pricing; do not silently assume the account is on Free or that hosting is guaranteed $0. Sources: https://developers.cloudflare.com/workers/platform/limits/ , https://developers.cloudflare.com/d1/platform/pricing/ , https://developers.cloudflare.com/workers/platform/pricing/ .
- Official Devpost rules require that the **public repository contain all source necessary for a functioning project**, and that private demo credentials appear in testing instructions. The complete judge gateway presently exists **only in a private draft PR**; before it can be a compliant judging deliverable, a reviewed no-secret release/public code path is necessary. Do not expose invitation codes or API keys by publishing the repo, and do not alter the locked submission in violation of Devpost submission-freeze rules: https://nebiusglobalaihackathon.devpost.com/rules .
- Organizer Janet Fang indicated in the Devpost discussion that a separate judge login with a practical reserved live-call allowance is acceptable. However, the fixed-fictional-prompt restriction and **Dec 15 vs official Dec 23** judging-end discrepancy have not been resolved in that thread: https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis .
- The first gate for any submitted judge testing is **authorization plus reliably bounded total out-of-pocket exposure**. Even low nominal model prices do not negate that requirement.

## Additional offline testing

The shared D1 statements in \`sql.mjs\` are tested against an ephemeral actual SQLite database using Node 22 \`node:sqlite\` (which remains experimental), in addition to mocked network/D1 behavior. Tests also parse generated browser JavaScript and confirm Turnstile action and hostname checks, unknown/revoked invitation prechecks, oversized-request rejection, model failures, replay prevention and the financial-authorization cutoff. None of these tests activate real inference or create Cloudflare resources.
