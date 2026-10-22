# Step 14O — Local Wrangler Static Assets + Browser QA

**Safety boundary:** This is a local-only smoke suite. No Cloudflare account credentials or deploy commands, no Nebius credentials, no paid AI calls and no public network deployment.

Current static preview: `wrangler.jsonc` serves only `./public`, and `public/_headers` imposes `connect-src 'none'` and other privacy headers on static assets.

This branch adds a separate `static-preview/` development-only test harness and an opt-in GitHub Actions workflow bound to its own branch. The harness boots `wrangler dev --local` at localhost, checks actual served response headers and 404/405 behavior, and uses a real headless Chromium browser to verify:
- Four distinct, labeled OFFLINE example drafts, with zero external requests.
- Copy guard on fictional sample phone number, explicit acknowledgment and reset on edit.
- Draft content is temporary across browser refresh.
- Desktop and narrow mobile views load without JavaScript exceptions.
- No sensitive server modules, credentials, config, or active AI API endpoints are served.

The workflow runs read-only on GitHub Actions and terminates its local server, with no publish step.

**Release blockers:** These tests are necessary but insufficient proof of production behavior. The application remains offline-only until final deployment approval and any separately approved secure NVIDIA activation. Free hosting remains required. A $1 application-side reservation does not impose a provider-side billing cap. This stage does NOT deploy a site or finalize Devpost.
