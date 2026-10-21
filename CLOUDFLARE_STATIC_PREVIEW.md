# Cloudflare Static Preview — Release Gate

**Status:** Configuration only, not deployed, and **not** a live NVIDIA judge demo.

This change intentionally hosts only the files inside `public/` using Cloudflare Workers Static Assets. It does **not** run `server.mjs`, enable Nebius requests, expose an API route, configure secrets, or configure Durable Objects. The default browser mode generates **offline sample drafts** and does not contact an AI provider.

## What this setup does

- `wrangler.jsonc` declares the Cloudflare Worker name and `./public` asset directory, with no Worker runtime `main`.
- `public/_headers` applies restrictive response headers including `connect-src 'none'` so the static preview cannot make browser-side API calls.
- `npm test` checks the static-only configuration and existing application behavior.

## Important restrictions

1. **Do not deploy automatically:** Establish explicit release approval before pushing this configuration to `main` or selecting Deploy in Cloudflare. A deployment is a publicly reachable website, even when the source repository is private.
2. **Do not add the Nebius API key** to this repository, HTML, JavaScript, build variables, or screenshots.
3. **This does not satisfy live-NVIDIA-judge-demo access.** A future live backend is a distinct, separately reviewed change with explicit authorization, approved fictional examples, authoritative server-side token counting, shared durable atomic quota and budget reservations, HTTPS security, abuse controls, and a provider billing risk review.
4. **Local tests do not verify Cloudflare behavior.** After explicit deployment approval, verify delivered CSP headers, origin route behavior, asset loading, privacy features, and no outbound network requests from a real browser.
5. **Free hosting only:** Confirm the Cloudflare account plan remains Free before deployment. Do not add paid features, paid storage, or billing settings.
6. **Cloudflare Git integration:** Worker project name must match `wrangler.jsonc`. With the repository root selected, the optional Build command can remain blank, and Deploy command uses `npx wrangler deploy`. Connecting the repository can enable automatic deployments for pushes to the selected production branch, so review those settings first.

This preview can help judges see the interface, but label the drafts explicitly as **offline samples** until separately approved real NVIDIA inference is securely operational.
