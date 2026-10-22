# SocialSpark — Offline Nemotron tokenizer calibration

**Status: PREPARATION ONLY. No trusted model count measured yet.**

This is a developer reference for examining the single fixed fictional
SocialSpark prompt with the NVIDIA model's own tokenizer. It does not enable
Nebius inference, does not download model assets, and does not incur provider
API charges. The production SocialSpark site is static-only.

## Source model and limitations

NVIDIA publishes the open-source tokenization assets for Nemotron 3 Nano:

- https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-BF16
- https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B-FP8

NVIDIA's model documentation describes `AutoTokenizer` and a chat template
with a configurable `enable_thinking=False` option.

**Caution:** Nebius Token Factory serves its own configuration. A locally
counted chat template is NOT automatically the same as Nebius' billed input.
The model may consume output tokens on reasoning. We must verify provider
usage, template alignment, and actual response shape separately.

## Repeatable calibration procedure — ONLY on a trusted local machine

1. After independent review of the model license and checkpoint revision,
   obtain tokenizer files directly from an official pinned NVIDIA Hugging Face
   checkpoint into a local folder OUTSIDE the public repository. Do not
   download model weights; do not supply API credentials.
2. Install an appropriate locally reviewed Python tokenizer/Transformers
   environment. The application itself needs no Python package.
3. Export the controlled test input:

   ```sh
   node scripts/export-judge-tokenizer-fixture.mjs > /tmp/socialspark-fixture.json
   ```

4. Supply the already present local tokenizer folder:

   ```sh
   python3 scripts/calibrate-judge-tokenizer-offline.py \
     --fixture /tmp/socialspark-fixture.json \
     --local-tokenizer-dir /path/to/verified-local-tokenizer
   ```

   The Python script sets `HF_HUB_OFFLINE=1`,
   `TRANSFORMERS_OFFLINE=1`, `local_files_only=True`, and
   `trust_remote_code=False`. It refuses missing assets and never fetches
   them automatically.

5. Record the pinned model revision, hash of the local tokenizer assets,
   Transformers version, printed fixture SHA-256, and resulting token count
   privately for security review. Do not add credentials or personal data
   to the manifest. Verify any mismatch between the BF16/FP8 tokenizer and
   the Nebius-hosted model before claiming a reliable input budget.

No model response is generated; no outbound challenge or provider call exists.

## Current code gates

- The prompt is reconstructed from one exact preapproved fictional example.
- Request body shape/model/max output are fixed and reject overrides.
- The audited JSON request body is **1,038 bytes**, below a 1,200-byte
  early-rejection threshold. **Bytes are NOT tokens**.
- A separate authenticated provider-aligned count is still required before
  a future live inference release.
- The experimental shared 20-call cap is NOT a provider billing hard stop and
  may conflict with the unrestricted judge access requirement.

## What still requires the owner's direct input

- Explicit approval for any deployment, real secret provisioning or
  potentially billable Nebius request.
- Confirmation of organizer acceptance if requesting a finite judge quota.
- A decision about how to satisfy unrestricted judging while respecting the
  owner's $25 maximum acceptable out-of-pocket exposure. Auto top-ups were
  confirmed OFF and need not be rechecked repeatedly.

The automated `tokenizer-offline-check.yml` CI runs only exporter and
Python syntax checks. It does NOT load or download a real tokenizer, so it
cannot claim that this blocker is solved.
