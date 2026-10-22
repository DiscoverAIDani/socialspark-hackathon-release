#!/usr/bin/env python3
"""Read a locally installed NVIDIA tokenizer: never download, infer or bill.

Dependencies (not installed or downloaded by this script):
  Python >=3.10; transformers with tokenizers backend, compatible with
  NVIDIA-Nemotron-3-Nano-30B-A3B-BF16.

For an owner-approved future calibration, supply an already audited local
tokenizer directory containing tokenizer.json/tokenizer_config.json and
chat_template.jinja from a pinned NVIDIA checkpoint. Never pass an API key.

This measures a *local model tokenizer* only. It does not prove the exact
Nebius Token Factory served chat template, billable input or output count.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys

# Set BEFORE importing Hugging Face libraries. No online fallback.
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["TRANSFORMERS_OFFLINE"] = "1"

ALLOWED_MODEL = "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B"
REQUIRED_BODY = {"model", "messages", "temperature", "max_tokens",
                 "stream", "exampleId", "jsonWireBytes", "disclaimer"}


def die(message):
    raise SystemExit("Calibration stopped: " + message)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", type=Path, required=True)
    parser.add_argument("--local-tokenizer-dir", type=Path, required=True)
    args = parser.parse_args()

    tokenizer_dir = args.local_tokenizer_dir.resolve()
    if not tokenizer_dir.is_dir():
        die("local tokenizer directory is missing")
    # The tokenizer must already be present; no hf:// or internet fetching.
    necessary = ["tokenizer_config.json", "tokenizer.json"]
    if not all((tokenizer_dir / name).is_file() for name in necessary):
        die("local tokenizer files missing")

    try:
        if args.fixture.stat().st_size > 16384:
            die("fixture too large")
        payload = json.loads(args.fixture.read_text(encoding="utf-8"))
    except (ValueError, OSError, UnicodeError):
        die("invalid fixture")
    if not isinstance(payload, dict) or set(payload) != REQUIRED_BODY:
        die("unexpected fixture shape")
    if payload["model"] != ALLOWED_MODEL or payload["stream"] is not False or \
       payload["max_tokens"] != 1250 or payload["temperature"] != 0.45 or \
       payload["exampleId"] != "fictional-beginner-workshop":
        die("unapproved model or request settings")
    messages = payload["messages"]
    if not isinstance(messages, list) or len(messages) != 2:
        die("unsupported message count")
    for idx, role in enumerate(["system", "user"]):
        if not isinstance(messages[idx], dict) or \
           set(messages[idx]) != {"role", "content"} or \
           messages[idx]["role"] != role or \
           not isinstance(messages[idx]["content"], str) or \
           not messages[idx]["content"].isascii():
            die("unapproved message encoding or role")

    wire = json.dumps({key: payload[key] for key in [
        "model", "messages", "temperature", "max_tokens", "stream"
    ]}, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if len(wire) != payload["jsonWireBytes"] or len(wire) > 1200:
        die("fixture size mismatch")

    # No model weights are ever loaded and no remote code may execute.
    try:
        from transformers import AutoTokenizer
        tokenizer = AutoTokenizer.from_pretrained(
            str(tokenizer_dir), use_fast=True,
            local_files_only=True, trust_remote_code=False,
        )
        tokens = tokenizer.apply_chat_template(
            messages, tokenize=True,
            add_generation_prompt=True,
            enable_thinking=False,
        )
    except Exception:
        die("local tokenizer or chat template unavailable")

    if not isinstance(tokens, list) or \
       any(type(item) is not int or item < 0 for item in tokens):
        die("unexpected tokenizer result")
    count = len(tokens)
    if count <= 0 or count > 2000:
        die("token count outside planned request limit")
    sha = hashlib.sha256(wire).hexdigest()
    print(json.dumps({
        "source": "local-NVIDIA-tokenizer-calibration-only",
        "modelRequested": ALLOWED_MODEL,
        "inputTokensLocal": count,
        "jsonWireBytes": len(wire),
        "fixtureSha256": sha,
        "providerTokenCountVerified": False,
        "providerCallsAuthorized": False,
        "reasoningDisabledLocallyOnly": True,
        "servingChatTemplateMatch": "UNVERIFIED"
    }, sort_keys=True))


if __name__ == "__main__":
    main()
