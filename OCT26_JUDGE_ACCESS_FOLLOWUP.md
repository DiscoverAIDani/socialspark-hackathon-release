# October 26 organizer follow-up — POSTED OCTOBER 25; AWAITING RESPONSE

**Status at October 25, 2026, 3:05 PM PDT:** The owner has **posted** the SocialSpark clarification question in the Nebius Discord `#devpost-global-ai-hackathon` channel as **DaniBall**, confirmed by a visible posted-message screenshot. The Devpost forum and recent matching email checks had no organizer answer. Another entrant agreed with the question, but their comment is not organizer approval. **Do not duplicate this message on October 26.**

**Official guidance:** The [Devpost FAQs](https://nebiusglobalaihackathon.devpost.com/details/faqs) tell entrants with unanswered questions to contact the Nebius team on Discord. The [October 21 "Will your project ship?" update](https://nebiusglobalaihackathon.devpost.com/updates/47163-recording-will-your-project-ship) explicitly directs questions for judges and Nebius staff to the **Devpost Global AI Hackathon** channel on Nebius Discord. This is the recommended next channel for the question, not an endorsement of restricted access.

**Open original question:** https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis

## Archived Discord question (already posted; do not repost)

Hi Nebius/Devpost team! I'm submitting **SocialSpark**, a social-media writing and privacy-review app using **NVIDIA Nemotron 3 Nano through Nebius Token Factory**. I successfully ran a real, owner-authorized inference locally, generating four platform-specific drafts. The current public Cloudflare demo uses offline examples so I do not expose my metered API key to uncontrolled traffic.

The rules require judges to have **free, unrestricted project access until December 15**. Could you please clarify whether a hosted, live inference demo using **preapproved fictional inputs** with abuse/rate protections and **20 total shared model requests** would satisfy that requirement? If not, what minimum metered-API access do you expect? My financial exposure limit is $25, so I need to avoid committing to unrestricted inference without a verified spending safeguard.

I asked this already in the [Devpost discussion](https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis); I'm following up here because the official update directed questions to Discord. Thanks for any guidance before the October 30 deadline.

## Checkpoint / go-no-go

- [x] **October 25:** Owner posted in Nebius Discord's **#devpost-global-ai-hackathon** channel at 3:05 PM PDT; screenshot confirmed publication. Message asks about fictional prompts, 20 shared lifetime calls, and how to meet the official rule without uncontrolled charges.
- [ ] **October 26:** Check for an **organizer response** on this existing Discord post or Devpost thread; do not repost the same question simply because there is no reply.
- [ ] If organizers **approve** a restricted demo, record their exact wording and scope first; their approval does not solve provider financial guarantees or authorize deployment.
- [ ] If organizers **reject** or require truly unrestricted live inference, keep the current owner-budget stop: no unsafe deployment.
- [ ] If no answer by **October 28–29**, preserve a truthful static demo and owner-only real inference evidence in the submission and complete the necessary submission before Friday, **October 30, 10:00 AM PDT**. Do not imply unrestricted judge access.
- [ ] Video and working URL are already entered; do not repeat them. The owner still needs to verify actual Devpost **submission status** before the official deadline if not confirmed elsewhere.

## Critical facts preserved

- A single local NVIDIA request succeeded and produced four usable, manually applied platform drafts, documented in PRs #32/#33; the local service was stopped and its attempt lock stays intact.
- The Cloudflare public site remains **static-only**. GitHub safety PRs remain unmerged.
- **No account-provider-enforced $25 ceiling has been verified.** App-level quotas and token estimates are not a hard spending cap.
- No paid request, key use, production modification, claim of access compliance, **or further external post** is authorized by this document. The October 25 Discord message was posted manually by the owner and its screenshot was verified.

**This audit log records an already-published owner action. It must not be interpreted as permission to post again on Discord, trigger an API request, deploy, or spend.**
