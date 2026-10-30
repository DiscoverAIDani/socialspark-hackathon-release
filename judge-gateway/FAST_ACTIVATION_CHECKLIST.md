# Fast activation checklist — **NOT AUTHORIZED; NO LIVE DEPLOYMENT**

This checklist is for SocialSpark's owner. **Do not execute account-changing commands until the owner separately approves Cloudflare resource creation/deployment**. **Do not activate inference or make paid requests until a separate explicit model-use approval and acceptable financial safeguards are confirmed.** The public site currently stays offline/static.

### Current verified build

- Source branch: \`review/judge-gateway-source-only\`. Draft PR #34, not merged.
- The public GitHub Actions "Judge Gateway — offline Worker build only" bundles the exact Worker with \`wrangler deploy --dry-run\`, without any account credentials, Cloudflare writes or paid inference.
- Candidate pinned model is \`nvidia/Nemotron-3_5-Lightning\`; official Nebius model page describes public OpenAI-compatible API access and input/output prices, but this account's model access and exact JSON shape are untested.
- The standalone Worker imports the existing Nebius adapter and local privacy checks. It does not attach to the existing public Cloudflare Pages website.

### Gate A — separate Cloudflare-only deployment authorization (still locked)

Only with explicit owner approval for any Cloudflare hosting/storage exposure:

1. In a trusted Windows terminal, clone the public source branch or download it as ZIP from GitHub. Use the *judge-gateway source-only review branch*, not the default branch, until release-approved.
2. Install Node.js 22 if needed; authenticate to Cloudflare with \`npx wrangler@4 login\`. Do not paste API tokens into chat or GitHub.
3. Create **a separate D1 database** (do not reuse existing app data):
   \`\`\`powershell
   npx wrangler@4 d1 create socialspark-judges
   \`\`\`
   Copy the returned D1 database UUID privately.
4. Copy \`judge-gateway/wrangler.example.jsonc\` to a *local-only* \`judge-gateway/wrangler.jsonc\` and replace \`REPLACE_WITH_APPROVED_D1_DATABASE_ID\` with the UUID. Do not commit it or publish account identifiers. The Worker main entrypoint is \`./worker.mjs\` relative to this config file.
5. Initialize the **remote** deny-by-default schema (no active judge invitations and \`max_requests=0\`):
   \`\`\`powershell
   npx wrangler@4 d1 execute socialspark-judges --remote --file judge-gateway/schema.sql --config judge-gateway/wrangler.jsonc
   \`\`\`
6. After reviewing the account billing tier, deploy **the locked Worker only**:
   \`\`\`powershell
   npx wrangler@4 deploy --config judge-gateway/wrangler.jsonc
   \`\`\`
   It should return HTTP 503 (locked) because explicit activation flags, provider secrets and database permissions are absent.
7. Record the **exact HTTPS origin** Cloudflare assigned (for example, the Worker-specific \`workers.dev\` URL). Do not guess the URL.
8. On Cloudflare Turnstile, create a **new dedicated judge widget** with hostname exactly matching that Worker URL, without \`https://\` or a path. Keep the site key and secret separate; the secret must never enter GitHub.
9. The Worker has no login, preview, or AI capability until the full activation checks below are approved and completed.

**Stop here.** Deploying a locked Worker is a Cloudflare account change and may have hosting costs or usage consequences; it is NOT the same as approving paid inference.

### Gate B — real Nebius judge inference requires second authorization

Prior to any live provider call:

- Independently confirm this Nebius account can access \`nvidia/Nemotron-3_5-Lightning\`, including proper structured JSON responses. The fact that the model exists in the public catalog does not prove account-specific access.
- Identify total financial exposure from Cloudflare + Nebius; determine whether a provider-side enforced spending cap or a formally accepted alternative exists. **The owner specified $25 maximum out-of-pocket exposure for Oct 30–Dec 15. This is a cap, not automatic permission to spend.** No hard provider cap has been verified.
- Resolve the Dec 15 cutoff vs the official judging end **Dec 23, 2026**. Do not remove the cutoff or automatically extend the owner's financial exposure.
- Have the owner approve the exact number of permitted provider requests, cost/exposure and dates. Never switch to another model behind their back.
- Bind the authorized Worker origin as \`JUDGE_ORIGIN\`, the exact pinned model as \`JUDGE_MODEL_ID\`, site key as \`TURNSTILE_SITE_KEY\`, and add \`NEBIUS_API_KEY\` and \`TURNSTILE_SECRET\` as **Cloudflare Worker encrypted secrets**. It is safest to configure Worker secrets in the dashboard for this app. \`wrangler secret put\` creates a version and **deploys immediately**.
- Only once cost and consent requirements are met, explicitly set \`JUDGE_GATE_ENABLED=EXPLICITLY_APPROVED\` and \`JUDGE_BILLING_HARD_CAP_CONFIRMED=YES_PROVIDER_ENFORCED\`. These are attestations **by the operator**, not the financial limit itself.
- Apply a specific approved short D1 \`judge_gate\` window and total max request count. It starts disabled; do not raise it speculatively. Generate a fresh 256-bit invitation code on the **owner's local machine**, send the code only through the approved private judge testing channel and add its hash to D1. Never commit the code.
- Run a **single** explicit fictional model test with owner approval, check four returned drafts, billing, provider output validation and immediate lock/kill switch. Do not retry automatically.
- Verify the link in an unauthenticated browser and ensure judge instructions are truthful and privately delivered. Keep all privacy checks and review-only behavior.

**No Devpost submission change after 10:00 AM PDT October 30 without an organizer exception.** The official rules say submitted materials may not change after the deadline. No future link should be represented as already live.

### Emergency stop

- In Cloudflare D1, set \`judge_gate.enabled=0\` immediately.
- Revoke invite hashes or disable the Worker altogether.
- Confirm no provider requests remain in flight and reconcile actual Nebius usage.
- Do not reopen a gate after an ambiguous crash until the billing and current in-flight state have been inspected.

### Official docs

- Nebius model: https://nebius.com/services/token-factory/models/nvidia-nemotron-models-inference
- Cloudflare D1 CLI: https://developers.cloudflare.com/workers/wrangler/commands/d1/
- Cloudflare Workers secret behavior: https://developers.cloudflare.com/workers/configuration/secrets/
- Cloudflare Turnstile hostname restrictions: https://developers.cloudflare.com/turnstile/additional-configuration/hostname-management/
- Hackathon rules: https://nebiusglobalaihackathon.devpost.com/rules

**All staging and tests completed to date are offline, and no live Worker has been created.**
