⚡ SocialSpark

One idea. Four platform-ready drafts. Privacy review before you post.

SocialSpark is an AI-assisted social media content studio designed to help users turn a single idea into editable content for **Facebook, Instagram, LinkedIn, and TikTok**.

The project brings together platform-specific writing, privacy awareness, and manual scheduling in an approachable workspace.

Built for the **Nebius x NVIDIA Global AI Hackathon**.

✨ Features

Four Platform-Specific Drafts

Create and customize content for:

- Facebook: Conversational posts that encourage discussion.
- Instagram: Engaging captions with optional hashtags.
- LinkedIn: Professional, informative posts.
- TikTok: Short, attention-grabbing caption hooks.

Each draft can be reviewed and edited independently.

Privacy-First Review

SocialSpark checks for several potentially sensitive details before users copy their posts, including:

- Phone numbers, email addresses, and physical addresses.
- Financial or account information.
- Information involving children.
- Travel plans and statements suggesting a home will be unoccupied.
- Combinations of details that could reveal someone's identity.

Privacy warnings remain visible until reviewed. When a warning is present, users must explicitly acknowledge it before copying.

Automated privacy detection is incomplete and does not guarantee that a post is safe, anonymous, or accurate.

Human-Controlled Publishing

SocialSpark does not automatically post to social networks.

Users review, edit, and copy their preferred drafts before manually publishing them.

No social-media account connection is required.

Schedule for Later

Users can:

- Select one or multiple platform drafts.
- Choose a future date and time.
- Save drafts locally with explicit permission.
- Review saved drafts in a calendar.
- Export calendar reminders as `.ics` files.
- Return later to copy or delete saved drafts.

Calendar exports include platform and scheduling information, not the actual post text.

Scheduling does not automatically publish content or create background notifications.

Accessible Workspace

The SocialSpark interface includes four editable platform cards, an interactive visual layout, responsive design, and support for reduced-motion preferences.

🧠 NVIDIA and Nebius Integration

SocialSpark integrates **NVIDIA Nemotron 3 Nano through Nebius Token Factory**.

The integration is designed to generate four platform-specific drafts from a single approved idea.

An owner-authorized local browser test successfully generated and validated four actual AI drafts using the NVIDIA model through Nebius.

The current prototype maintains important safeguards:

- Provider credentials remain on the server.
- Live AI requests require explicit authorization.
- The authorized browser demonstration uses a fixed fictional scenario.
- Model responses are validated before application.
- Generated drafts are reviewed before being applied to the editing workspace.
- Live requests are not automatically retried.

Important: General-purpose public AI generation is not currently enabled. The normal application runs with offline sample drafts. The historical successful live test does not authorize another potentially billable provider request.

🚀 Run SocialSpark Locally

Requirements

- Node.js 20 or newer.
- A modern web browser.
- A terminal or command prompt.

Installation and Startup

Download or clone the repository and open a terminal in the project directory containing `package.json`.

Run the automated tests:

```bash
npm test
```

Start the application:

```bash
npm start
```

Open:

```text
http://127.0.0.1:4173
```

Enter a fictional idea, choose a tone, and select **Spark sample drafts**.

The application creates four editable local sample drafts without making a provider AI request.

On Windows PowerShell, use `npm.cmd test` and `npm.cmd start` if PowerShell restricts execution of the `npm` command.

Offline AI Workflow Rehearsal

To explore the consent and review workflow without making a paid provider request, stop the normal server and run:

```bash
npm run studio:rehearsal
```

This launches a local rehearsal using a fixed fictional workshop idea and simulated AI responses.

The rehearsal demonstrates:

1. Reviewing the exact proposed text.
2. Explicitly approving a simulated request.
3. Reviewing four generated-style draft responses.
4. Separately approving the application of drafts.

No NVIDIA/Nebius API request is made during this rehearsal.

The rehearsal is not evidence of a live model invocation.

🔒 Privacy and Data Handling

SocialSpark is designed around user review and consent.

In the normal local preview:

- Sample draft generation takes place locally.
- The application does not automatically submit drafts to an AI provider.
- Saved drafts remain in the current browser profile's local storage.
- Local storage is not encrypted.
- Other users of the same browser profile may be able to access saved drafts.
- Clearing browser data may remove saved drafts.
- The application does not automatically publish content.

When using the separately authorized NVIDIA integration, approved fictional text is sent to Nebius Token Factory for processing.

Users should not enter real sensitive personal information into this development prototype.

🧪 Testing and Validation

SocialSpark v0.24 completed:

- 276 passing automated tests in the development environment.
- A successful GitHub Actions automated test run.
- Manual browser checks of the four-platform interface.
- Privacy warning and acknowledgment checks.
- Local draft saving and reloading checks.
- Calendar export and import testing.
- An independently authorized live NVIDIA/Nebius integration demonstration.

The live integration test is separate from automated testing and is not rerun by the standard test suite.

These results describe the tested development version and do not establish production readiness.

🗂️ Project Structure

```text
public/
  Browser interface, platform drafts,
  privacy checks, editing and scheduling

security/
  AI consent, request validation,
  response validation and provider safeguards

scripts/
  Local demonstrations and guarded
  development startup scripts

test/
  Automated tests

server.mjs
  Local development web server

package.json
  Project configuration and commands

LICENSE
  MIT open-source license
```

⚠️ Current Limitations

SocialSpark is a development prototype rather than a production social-media management service.

Current limitations include:

- Public multiuser AI generation is not enabled.
- The regular demonstration uses offline sample drafts.
- No direct publishing to Facebook, Instagram, LinkedIn, or TikTok.
- No automatic scheduled publishing.
- No social-account authentication.
- No background reminder service.
- No media or video upload workflow.
- Privacy checks cannot detect every disclosure.
- Browser-stored drafts are not encrypted.
- The local development server is not a public HTTPS deployment.

Public AI deployment would require additional authentication, secure HTTPS hosting, abuse prevention, provider cost controls, privacy review, and production testing.

🎯 Project Purpose

Writing content separately for multiple social platforms takes time. Posting quickly can also lead to unintentional disclosures of personal information.

SocialSpark explores how AI-assisted content creation can reduce repetitive writing while keeping privacy review and final publishing decisions in the user's hands.

The project's guiding principle is:

AI helps create. People stay in control.

🏆 Hackathon Project

SocialSpark was developed as an independent project for the Nebius x NVIDIA Global AI Hackathon.

AI technology: NVIDIA Nemotron 3 Nano via Nebius Token Factory.

Project version: v0.24 development prototype.

License: MIT.

SocialSpark is an independent prototype and is not affiliated with, sponsored by, or endorsed by the social-media platforms it supports.