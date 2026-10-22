# Step 14L — Cloudflare Turnstile (OFFLINE / NOT DEPLOYED)

**NOT DEPLOYED · NOT MERGED · NO BILLABLE NVIDIA/Nebius REQUESTS**

This development-only change implements an **unbound Siteverify adapter**.
No Cloudflare Turnstile widget, sitekey, secret, public session endpoint,
Worker entrypoint, Durable Object binding or Nebius transport was added.

The user's hosting constraint remains **Cloudflare Free only**. The Turnstile
Free plan currently includes up to 20 widgets and unlimited verification
requests, subject to Cloudflare's applicable restrictions.

## Server-side verification requirements

A future secure, same-origin HTTPS Worker must:

1. Display a configured Cloudflare Turnstile widget on the restricted
   session-issuance flow with action `socialspark_judge_session`.
   Register **only the actual verified deployment hostname** on the widget.
2. Receive the challenge response as a token (maximum **2048 characters**)
   in a **bounded** request. Never treat widget completion in the browser as
   security approval.
3. Read the widget **secret key from a Worker secret binding only**.
   Never store it in GitHub, frontend code, screenshots, logs or URLs.
4. Perform a server-side `POST` to the exact
   `https://challenges.cloudflare.com/turnstile/v0/siteverify` endpoint.
   Validate `success === true`, exact `hostname`, exact `action`, and
   recent `challenge_ts`. Challenge tokens expire after 300 seconds and
   Cloudflare permits only **one successful redemption**.
5. Reject failed/unknown responses, unexpected hosts/actions, expired or
   future timestamps, malformed JSON, oversized responses, timeouts and
   transport failures. Do **not** automatically retry an uncertain challenge.
6. Require **additional global session rate limits and one-time session/CSRF
   verification**, in the correct order, before authorizing any provider
   request. Turnstile is not authentication and can be solved by some bots.

## Implemented (offline-tested only)

- `cloudflare/judge-turnstile-core.mjs`: validates a server-supplied
  hostname, fixed action, token format, bounded Siteverify response and
  five-minute age. Makes exactly one request **only when an explicit injected
  transport function is provided**. There is no default real network call,
  public route, secret retrieval, logging or provider integration.
- `test/cloudflare-judge-turnstile.test.js`: injected, fake Siteverify
  responses (no actual Cloudflare service calls). Verifies successful mock
  response, bad/replayed tokens, wrong hostnames/actions, invalid clocks,
  missing secrets, failures/oversized content, lack of automatic retries,
  and no paid-AI authorization.

## Production blockers

- Do not enable Turnstile on the static-only demo yet: the existing strict
  Content-Security-Policy has `connect-src 'none'` and `script-src 'self'`.
  The official Turnstile script/frame requires a **separately reviewed**
  narrowly scoped CSP change before rendering a widget.
- Account-level widget setup with the eventual exact hosting hostname and
  a securely configured secret; no paid plan or payment details.
- A live HTTPS Worker route with tested size bounds, exact-origin checks,
  Turnstile Siteverify, session issuance, one-time CSRF consumption,
  persistent global rate limiting, and durable budgeting.
- Real Cloudflare runtime tests rather than mock-only Node tests.
- Independently approved activation and an explicit review of possible
  charges from the existing $50 Nebius account balance. The planned $1
  application-side reservation remains **not a provider-enforced spending cap**.

Cloudflare docs:
- https://developers.cloudflare.com/turnstile/get-started/server-side-validation/
- https://developers.cloudflare.com/turnstile/plans/
- https://developers.cloudflare.com/turnstile/reference/content-security-policy/

Keep `wrangler.jsonc` **static-only** until a separate deployment approval.
