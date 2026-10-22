# Step 14P — Disabled deploy-shaped Cloudflare Worker (LOCAL TEST ONLY)

**No cloud deployment, no paid inference, no provider secrets.**

This branch adds an **optional** Cloudflare Worker + Static Assets configuration, `wrangler.disabled-preview.jsonc`, separate from the root static-only `wrangler.jsonc`. This is a test-only rehearsal of how a secure backend and static assets could coexist.

- `cloudflare/offline-preview-worker.mjs` serves static assets with `env.ASSETS` when a Worker handles a request, but **never** invokes NVIDIA/Nebius.
- `/api/judge-demo/generate` returns HTTP **503 AI disabled** for every HTTP method, body and client-provided flag.
- All other `/api/*` routes return HTTP **404**, with no cookie issuance, remote activation, or admin path.
- Static assets still use `public/_headers` CSP `connect-src 'none'`; no credentials or server files are served.
- `assets.run_worker_first: ["/api/*"]` ensures API requests cannot be mistaken for static assets.
- `workers_dev:false` intentionally provides no publicly reachable workers.dev route if someone accidentally deploys this test-only config. **Do not deploy it anyway.**

`static-preview/disabled-preview-worker-smoke.mjs` runs the combined preview in local workerd and checks the real HTTP behavior. Its GitHub Actions workflow has no deployment step or Cloudflare secrets. The normal frontend static browser tests and existing unit tests remain separate.

**Unmet requirements:** A working runtime Nebius Token Factory call for Devpost eligibility, real security services, durable quota configuration and no-reset provisioning, secure Turnstile, model token accounting, owner authorization and price exposure review. Do not publish repository, merge to main, or deploy without express owner approval.
