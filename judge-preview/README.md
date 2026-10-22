# SocialSpark — Turnstile browser preparation (NOT DEPLOYED)

Status: **offline-only development on safety branch**, no new public HTML route, no NVIDIA calls, no paid inference, and no Cloudflare Worker deployment.

## Supplied public widget configuration

- Cloudflare widget name: **SocialSpark Judge Demo**
- Exact hostname: `socialspark-hackathon-release.daniellewilcott.workers.dev`
- Mode: **Managed** (user selected)
- Pre-clearance / skip future security challenges: **OFF** (user selected)
- Public site key is pinned in `judge-preview/turnstile-public-config.mjs`.
- Expected Siteverify action: `socialspark_judge_session`, identical to `cloudflare/judge-turnstile-core.mjs`.
- **SECRET KEY is never to be committed, pasted into chat, written in browser code, or logged.** It is not available to this branch.

## What exists in code

The injected browser-controller is independent from the live SocialSpark site. It never dynamically loads Turnstile, makes a fetch call, stores tokens/drafts in persistent browser storage, or invokes the model. When it receives a future Turnstile API object, it can:

1. Render one Managed-mode challenge with the exact public site key and action.
2. Hold the returned browser token in temporary JavaScript memory until one explicit `takeToken()` handoff.
3. Refuse token re-use, invalid tokens, clock rollback, expiry after 300 seconds, missing widget dependencies and failed challenges; clear tokens on reset/remove.
4. Report only generic UI statuses. No raw tokens are passed to status callbacks.
5. Reject attempts to bind this UI to another origin, scheme, or custom port.

**A token is never authorization to spend money.** The server will still have to verify it using Cloudflare Siteverify with the private secret, exact hostname/action, freshness, and replay semantics; implement real server-side abuse checks and require a separately approved billing gateway.

## Future CSP change MUST NOT affect the current offline site

Current static `public/_headers` intentionally contains `connect-src 'none'`, `script-src 'self'` and `frame-ancestors 'none'`. That CSP must remain unchanged for the currently published offline-only frontend.

A separately approved judge page will require Turnstile to access the official URL:

`https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`

Cloudflare's CSP guide specifies allowing `https://challenges.cloudflare.com` under `script-src` and `frame-src`. The judge page will also require its own tightly scoped `connect-src` to the same-origin session route if server-side access is ever authorized. Do **not** loosen the global CSP until a reviewed server actually exists. See:

- https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/
- https://developers.cloudflare.com/turnstile/reference/content-security-policy/
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/

The real browser script must use the exact Cloudflare URL. Proxying/caching it is unsupported.

## Release blockers

- [x] Widget created and public site key provided by user.
- [x] Isolated client controller and fake API tests, zero real challenge/network requests.
- [ ] Production judge page, page-scoped CSP and official script load reviewed and authorized.
- [ ] Secret stored as Cloudflare server-side secret binding, via approved secure UI only.
- [ ] Server uses **actual** Cloudflare Siteverify (current server verifier requires injected mock transport).
- [ ] Provider hard spend ceiling or billing exposure explicitly approved; auto top-up status verified privately.
- [ ] Server-side tokenizer, provider-response billing reconciliation and abuse protection verified.
- [ ] Live AI deployment, owner consent and each potentially billable test separately approved.
- [ ] Judges' unrestricted access requirements clarified; shared 20-request cap can exclude judges.

**Do not merge any development PR to `main`, deploy this branch, publish an API route, or send any paid NVIDIA request without separate user approval.**
