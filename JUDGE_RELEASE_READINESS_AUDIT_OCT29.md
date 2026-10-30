# SocialSpark — October 29 external release audit (NO-GO)

**Evidence-only, draft branch.** No changes to the public static site, Devpost submission, owner-only Access test, Cloudflare policies, inference keys, payment setup or production deployment. This is NOT permission to execute a judge launch.

## Verified hackathon constraints

- [Official rules](https://nebiusglobalaihackathon.devpost.com/rules) as inspected October 29, 2026: **submission closes October 30, 2026 at 10:00 AM PDT**; judging is **December 9, 2026 at 9:00 AM PST to December 23, 2026 at 12:00 PM PST**. Owner conservatively chose availability through December 23 end-of-day.
- Rules require a publicly accessible open-source code repository with needed source, a working project URL, and a video. They require the project to be free and available for judging. The public repository `main` has the MIT license, a README, Node server and guarded Nemotron/Nebius adapter files as well as browser assets; the public deployed `workers.dev` is **static only** and does not make real runtime AI requests.
- [Organizer Janet Fang's response](https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis) allows a separate judge login and sensible abuse limits **provided judges can run actual Nebius/NVIDIA inference and complete a full judging pass**. It is not acceptance of the old shared 20-request quota, preapproved fictional prompts only, or a static prerecorded output. The user's follow-up questions about fictional prompts and Dec 15 vs Dec 23 are still not answered publicly at this check.
- Judges are not obliged to try the app; they may judge by screenshots, description and video. That is an evaluator option, **not a guarantee that offline-only access satisfies Stage One or the live testing requirement**.

## Verified financial restrictions / risk

- [Nebius Token Factory Supplemental Terms §6.1–6.2, published/effective October 22, 2026](https://docs.nebius.com/legal/token-factory): **Token Factory fees are post-paid unless a separate order form provides otherwise**; Nebius may modify/revoke free credits without notice. This is a significant release risk and does not describe a hard spending ceiling before any request is accepted.
- [Nebius Builder Program Terms §C.2–C.3](https://nebius.com/builders-terms-and-conditions): promotional credits expire **90 days after issuance** and usage may proceed pay-as-you-go after consumption/expiry. §H.4 describes discretionary account pauses if consumption exceeds credits, **not a guaranteed cost cap**. §H.2 disallows production workloads using Builder Program promotional credits; a future judges' test should not be represented as approved commercial production usage. Terms must be reviewed for applicable actual credit type before use.
- [Token Factory billing overview](https://docs.tokenfactory.nebius.com/other-capabilities/billing) states a negative balance yields API errors after the fact; it does not show that all outstanding incurred fees are forgiven or that negative balances cannot briefly occur due to in-flight requests.
- No source reviewed confirms an **irrevocable provider-enforced zero-overspend gate**, a prepaid-only enforceable account type, or a written exemption specific to this account/project. An application-side quota, rate limit, monthly budget alert, Cloudflare Access, disabled automatic top-ups, or a visible promo credit balance alone **cannot provide that contractual/technical guarantee**.
- The owner has a **private hard maximum acceptable out-of-pocket exposure** that must not be exceeded, increased or publicly disclosed in this repo. **Without credible financial containment compatible with that maximum, this release remains NO-GO regardless of passing local tests.**

## Verified current deployment evidence

- The public static SocialSpark application is working and independent.
- The separate owner-only `socialspark-judge-auth-test` is protected with individual Cloudflare Access (All traffic, Cloudflare account members), is running the no-provider identity probe and returns `{"ok":true,"code":"access-authenticated-test-only","inferenceEnabled":false,"providerCallsAuthorized":false}` after verified login. A fresh signed-out Incognito visitor instead gets a real Cloudflare Access sign-in screen.
- The unmerged safety branch's latest local CI demonstrated the v2 signed identity/session binding in Cloudflare `workerd`/SQLite and external-judge exact-email policy checks. It does **not** prove live paid model transport or trusted invoice-maximum containment.
- No verified external judge identity list or approved credential-delivery mechanism; a generic shared PIN or `Everyone` policy is unsafe.

## Release decision table

| Requirement | Status / required evidence |
|---|---|
| Public submission/README/license/video | Submitted previously, public source structure manually reviewed; do not make surprise changes |
| Real owner Cloudflare login | **PASS** on separate non-AI test |
| External judge Access login + invitation | **NOT configured**; require approved judge identities/secure delivery and new permission |
| Bound identity/session and anti-abuse | **Offline & local Worker tests**, not deployed production gateway |
| Real NVIDIA Nemotron inference on Nebius | Historical one-use owner demonstration; **NOT currently served to judges** |
| Judge capacity for complete pass, broad enough scope | **NOT proven** |
| Provider financial safety | **NO-GO**: no verified provider-enforced or contractual hard limit |
| Live release and potentially billable tests | **NOT authorized** |

## Next responsible milestone

1. Obtain **credible provider/account-specific written or technical proof of a hard total-charge containment** applicable to inference for the whole judging period, including prepaid/credit expiry and pending work. Do not reopen the previously resolved automatic top-up question or repeat the owner's billing screenshots.
2. Obtain a secure external judge identity/invitation mechanism, and confirm the expected full-pass prompt scope if organizers respond. Never add external reviewers as Cloudflare account administrators.
3. Build/verify and obtain independent owner authorization for the full dynamic gateway **only if (1) and (2) become possible**. Until then, leave inference **OFF**; it is more accurate to submit a static working demo with a verified historical local NVIDIA invocation than to claim or expose unsafe unrestricted live judging.
