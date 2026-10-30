# October 26 organizer follow-up — POSTED OCTOBER 25; AWAITING RESPONSE

**Status at October 25, 2026, 3:05 PM PDT:** The owner has **posted** the SocialSpark clarification question in the Nebius Discord `#devpost-global-ai-hackathon` channel as **DaniBall**, confirmed by a visible posted-message screenshot. The Devpost forum and recent matching email checks had no organizer answer. Another entrant agreed with the question, but their comment is not organizer approval. **Do not duplicate this message on October 26.**

**Official guidance:** The [Devpost FAQs](https://nebiusglobalaihackathon.devpost.com/details/faqs) tell entrants with unanswered questions to contact the Nebius team on Discord. The [October 21 "Will your project ship?" update](https://nebiusglobalaihackathon.devpost.com/updates/47163-recording-will-your-project-ship) explicitly directs questions for judges and Nebius staff to the **Devpost Global AI Hackathon** channel on Nebius Discord. This is the recommended next channel for the question, not an endorsement of restricted access.

**Open original question:** https://nebiusglobalaihackathon.devpost.com/forum_topics/45534-clarifying-free-judging-access-for-apps-with-metered-apis

## Archived Discord question (actual owner-posted wording; do not repost)

Hi Nebius/Devpost team! I'm building **SocialSpark** for the Nebius x NVIDIA Global AI Hackathon.

SocialSpark uses NVIDIA Nemotron 3 Nano through Nebius Token Factory. I've successfully tested real AI generation locally, producing four platform-specific social media drafts.

I'm trying to clarify the rule requiring **free, unrestricted judge access through December 15**.

Would a publicly accessible AI demo using a fixed fictional scenario, with reasonable rate limits and a shared 20-request lifetime allowance, satisfy this requirement?

If not, what minimum access is expected for projects using metered Token Factory APIs? I'm concerned about unexpected charges from unrestricted public inference.

I've also asked on Devpost but haven't received clarification. I'd appreciate guidance before the October 30 submission deadline.

Thank you!

## Checkpoint / go-no-go

- [x] **October 25:** Owner posted in Nebius Discord's **#devpost-global-ai-hackathon** channel at 3:05 PM PDT; screenshot confirmed publication. Message asks about fictional prompts, 20 shared lifetime calls, and how to meet the official rule without uncontrolled charges.
- [ ] **October 26:** Check for an **organizer response** on this existing Discord post or Devpost thread; do not repost the same question simply because there is no reply.
- [ ] If organizers **approve** a restricted demo, record their exact wording and scope first; their approval does not solve provider financial guarantees or authorize deployment.
- [ ] If organizers **reject** or require truly unrestricted live inference, keep the current owner-budget stop: no unsafe deployment.
- [ ] If no answer by **October 28–29**, preserve the already-submitted, truthful static demo and owner-only real inference evidence. Do not imply unrestricted judge access. Optional Devpost edits end Friday, **October 30, 10:00 AM PDT**.
- [x] **Devpost SUBMITTED October 25**; the owner confirmed the submission acknowledgment and supplied a profile screenshot showing the Submitted badge. Video and working URL are already entered; do not repeat them or submit again.

## Critical facts preserved

- A single local NVIDIA request succeeded and produced four usable, manually applied platform drafts, documented in PRs #32/#33; the local service was stopped and its attempt lock stays intact.
- The Cloudflare public site remains **static-only**. GitHub safety PRs remain unmerged.
- **No account-provider-enforced spending ceiling has been verified.** The owner's private maximum exposure remains a release constraint; app-level quotas and token estimates are not a hard spending cap.
- No paid request, key use, production modification, claim of access compliance, **or further external post** is authorized by this document. The October 25 Discord message was posted manually by the owner and its screenshot was verified.

**This audit log records an already-published owner action. It must not be interpreted as permission to post again on Discord, trigger an API request, deploy, or spend.**
