#!/usr/bin/env python3
"""Throwaway renderer for the wrapper spike: stream-json SDK messages in, log lines out.

The plumbing is the question, not the looks, so this covers only what the spike checks: a call line,
its result under a repeated call header, the full output in a group inside a stopped block, and a
result line. The real renderer is #5.
"""

import json
import os
import secrets
import sys

E = "\x1b["
token = secrets.token_hex(16)
# Dies with a group and a stopped block open, to see what that does to the rest of the step.
die_inside_block = os.environ.get("SPIKE_RENDER_DIE") == "true"
calls = {}


def out(line):
    sys.stdout.write(line + "\n")


def gray(text):
    return f"{E}90m{text}{E}0m"


def call_header(block):
    args = block.get("input", {})
    arg = args.get("command") or args.get("file_path") or args.get("pattern") or json.dumps(args)
    arg = arg.replace("\n", "⏎")[:140]
    return f"{E}32m●{E}0m {E}1m{block['name']}{E}0m({arg})"


def result_text(block):
    content = block.get("content", "")
    if isinstance(content, list):
        content = "\n".join(c.get("text", f"[{c.get('type')}]") for c in content)
    return content


def render_result(block):
    lines = result_text(block).splitlines()
    color = "31" if block.get("is_error") else "90"
    # With parallel calls the result may not follow its call, so the call line is repeated above it.
    out(calls.get(block["tool_use_id"], gray(f"? unknown call {block['tool_use_id']}")))
    for line in lines[:3]:
        out(f"  {E}{color}m└  {line[:200]}{E}0m")
    out(f"::group::{gray(f'     … {len(lines)} lines')}")
    out(f"::stop-commands::{token}")
    for line in lines:
        out(line)
    if die_inside_block:
        sys.stdout.flush()
        os._exit(1)
    out(f"::{token}::")
    out("::endgroup::")


def render(msg):
    kind = msg.get("type")
    if kind == "system" and msg.get("subtype") == "init":
        out(gray(f"✻ {msg.get('model')} · {msg.get('cwd')}"))
    elif kind == "assistant":
        for block in msg["message"]["content"]:
            if block["type"] == "text":
                out(f"● {block['text']}")
            elif block["type"] == "tool_use":
                calls[block["id"]] = call_header(block)
                out(calls[block["id"]])
    elif kind == "user" and isinstance(msg["message"]["content"], list):
        for block in msg["message"]["content"]:
            if block.get("type") == "tool_result":
                render_result(block)
    elif kind == "result":
        color = "31" if msg.get("is_error") else "32"
        out(
            f"{E}{color}m✻ {msg.get('subtype')} · {msg.get('num_turns')} turns"
            f" · {msg.get('duration_ms', 0) / 1000:.0f}s · ${msg.get('total_cost_usd', 0):.2f}{E}0m"
        )
    else:
        out(gray(f"· {kind}" + (f"/{msg['subtype']}" if "subtype" in msg else "")))


def main():
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    count = 0
    for line in sys.stdin:
        if not line.strip():
            continue
        count += 1
        try:
            render(json.loads(line))
        except (ValueError, KeyError, TypeError) as error:
            out(gray(f"· unrenderable line ({type(error).__name__})"))
        sys.stdout.flush()
    # Shows whether output written after the SDK let go of claude still reaches the log.
    out(gray(f"render: end of stream after {count} messages"))


main()
