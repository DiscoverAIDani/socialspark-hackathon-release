# Locked judge Worker — initial Cloudflare Git build marker

The account owner connected the separate `socialspark-private-judge-gateway` Worker to
the production branch `deploy/judge-only-locked` on October 30, 2026.

This documentation-only commit triggers the first Cloudflare Git build.
The deployment configuration resides at `judge-gateway/wrangler.jsonc`.

IMPORTANT:
- The deployed worker is **disabled by default**.
- This branch has no provider API key or Turnstile secret.
- D1 database `socialspark-judges` is bound, but the gate remains disabled (enabled=0, max_requests=0).
- No invitation codes, model secrets, or activation flags are configured.
- The Worker must respond with HTTP 503 (unavailable) until all explicit separate
  inference authorizations and actual cost protections are established.
- This does NOT change the default branch or the public SocialSpark deployment.
- Do not enable NVIDIA/Nebius inference or spend money through this commit.
