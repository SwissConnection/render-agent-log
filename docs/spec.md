# render-agent-log — specification

## Problem

A Claude Code run in GitHub Actions leaves either nothing readable (`claude-code-action` default) or
one pretty-printed JSON object per SDK message (`show_full_output: true`). Dependency review run
36110129675 printed 1,492 lines of JSON for a 7-turn run. Upstream request
anthropics/claude-code-action#141 has been open since June 2025.

## Goal

Make the job log of a Claude Code run read like the Claude Code terminal: a `●` line per tool call, a
short `└` preview of its output, the full output folded into a collapsed group, the agent's text as
prose, and a one-line summary at the end.

**Scope: Claude Code, in GitHub Actions logs.** Other agents, HTML, local terminals and step summaries
are out of scope until the core has been used for real. The code keeps a seam where another input
format could plug in, but none is built.

## Input contract

Both inputs are the Agent SDK's `SDKMessage` stream. There is no published JSON Schema for it; the
contract is the TypeScript declarations in `@anthropic-ai/claude-agent-sdk` (`sdk.d.ts`: a union of 39
message types at 0.3.282). Message bodies are Messages API types from `@anthropic-ai/sdk`. Tool inputs
and outputs are in `sdk-tools.d.ts`, generated upstream from JSON Schema that is not published.

- **Live:** `claude -p … --output-format stream-json --verbose`, one JSON message per line.
- **After the run:** `claude-code-action`'s `execution_file` output, a JSON array of the same messages.

The renderer reads stdin, or the file named by its one argument. An input whose first non-blank line
starts with `[` is an execution file, parsed whole; anything else is read line by line as it arrives.

The renderer imports these types and switches exhaustively over the type of what `claude` writes to
stdout: `SDKMessage`, plus `active_goal` and the control protocol between the SDK and `claude`, which
the wrapper sees (the SDK exports this union only as what a `Transport` reads). When a bump of
the SDK adds a message type, `tsc` fails in that PR, and that failure is the work item.
At runtime, a message the build did not know about prints as one gray `· <type>` line. It is never
dropped silently and never crashes the renderer.

## Output

| Message | Rendering |
|---|---|
| `system/init` | gray `✻ <model> · <cwd>` line, for each `init` (a resumed session sends another) |
| assistant `text` | `●` prose with a small Markdown subset turned into ANSI: bold, inline code (bold cyan), headings (bold), lists (markers kept), code fences (gray) |
| assistant `thinking` | gray `✻` and gray italic text. Thinking without text (only a signature, the default) prints nothing |
| assistant `tool_use` | green `●` **Tool**(main argument, one line, ≤140 characters; a path under `cwd` relative to it) |
| user `tool_result` | up to 3 preview lines that are not blank, the last under `└` and the ones above it under `│` (gray, red if `is_error`; not Claude Code's `⎿`, which falls back to a wider font in the log). Then, when the preview does not show all of it, the full output in `::group::… N lines` |
| Edit/Write result | colored diff from `tool_use_result.structuredPatch` (a new file: its content as added lines). The preview shows the changed lines |
| Bash result | `stdout`, then `stderr` in yellow, from `tool_use_result`. On a failed call `tool_use_result` is a plain string, so it shows `content`, in red |
| Agent result | `content`, which is an array of text blocks |
| user text | gray `›` and the text, previewed and folded like tool output: a subagent's prompt, or a message injected into the run |
| subagent messages (`parent_tool_use_id` set) | indented under the Agent call by a gray `│` per level |
| `result` | `✻ <subtype> · N turns · Ns · $X` (green, or red on error with the `errors` under it). A line per `result`: a run with background subagents sends several. Turns and duration count per result, while `total_cost_usd` is the session's total so far |
| `system/api_retry`, `compact_boundary`, `informational`, `notification`, `hook_response`, `local_command_output`, `model_refusal_*` | one line: yellow for a retry, a warning or a refusal fallback, red for a refusal or a failed hook, gray otherwise |
| `active_goal` | gray `· goal: <condition> · N iterations · <last reason>`, or `· goal cleared` |
| `control_request`, `control_response`, `control_cancel_request`, `keep_alive` | dropped: the control protocol between the SDK and `claude` |
| `task_*`, `tool_progress`, `rate_limit_event`, `thinking_tokens`, `stream_event`, and the other progress and UI-state messages listed in `src/render.ts` | dropped: they are progress, not transcript |
| anything else | gray `· <type>` (`· system/<subtype>`), also for a message the renderer fails to render |

Rules:

1. **A result always sits under its own call.** With parallel calls, the call's header is repeated
   above its result. A subagent's messages sit under the Agent call the same way: when other output
   came in between (background subagents interleave), the Agent's header is repeated. A result shown
   under the wrong command is the silent wrong answer this tool exists to prevent.
2. **Nothing the agent or its tools print can issue a workflow command.** The runner reads step output
   with .NET's `ReadLine`, which ends a line at `\r`, `\n` or `\r\n`. It runs a line as a command when
   it starts with `::` after leading whitespace (`ActionCommand.TryParseV2` trims first), or when it
   holds `##[` anywhere (`ActionCommand.TryParse`, the legacy syntax). Tool output, call arguments,
   agent text and paths are untrusted (changelogs, web pages), so:
   - Every line the renderer prints, except its own `::group::` and `::endgroup::`, starts with a
     character the renderer owns that isn't whitespace (`●`, `✻`, `└`, `│`, `›`, `·`). That includes
     the full output folded into a group, whose lines start with a gray `│`. Untrusted text is split
     into lines where the runner splits them, and `\r` and the other control characters except `\t`
     are removed.
   - Each `##[` in untrusted text gets an SGR code that changes nothing (underline off) between its
     two `#`: the log still shows `##[`, and the runner does not parse it.

   There is no `::stop-commands::` block: the runner prints its start and end lines itself, in every
   group, and a block left open would leave the rest of the step's commands inert, including the
   action's own `::error::` in wrapper mode (#6). The cost is that output copied from the log carries
   the `│` of each line.
3. Only SGR escape sequences (colors) from tool output reach the log, and only in the folded full
   output: previews, call arguments and prose are plain text. Other escape sequences, their 8-bit C1
   forms included, are stripped.
4. Output is written once per message, so the live log keeps pace with the agent.
5. **Always close what you open.** An open group folds the rest of the step's log into it, the
   workflow's own `::error::` included. Each message goes out in one write that holds whole groups.
   On SIGTERM, SIGINT or SIGHUP the renderer stops reading, lets the write in flight finish, and
   exits with 128 plus the signal number. When its reader goes away (EPIPE) it exits at once, since
   nothing more reaches the log. A renderer killed by SIGKILL cannot close its group, so the wrapper
   (#6) does.
6. Secrets and the agent itself are outside what the renderer guards: it shows what
   `show_full_output` would, and [README § Secrets](../README.md#secrets) says what that means.
7. **The renderer's own colors adapt to the theme.** The log gives each of the 16 named colors a
   shade per theme, so the renderer uses only those, plus bold and italic, and no 256-color or
   truecolor codes, whose shades are fixed. It never uses black (30), which is hard to read on the
   dark theme, or dim (2), which the log renders as normal text. Inline code is bold cyan: cyan alone
   blends into the text on the light theme (#1).
   Gray is the one exception, a fixed 256-color gray (244, `#808080`): no named color is gray in both
   themes. Bright black (90) is `#393f46` on the light theme, nearly its text color, and white (37) is
   the dark theme's text color (GitHub's Primer palette).
   Tool output keeps its own colors (rule 3).

## Packaging

One TypeScript package, bundled with esbuild to `dist/`, which is committed.

The Action, `SwissConnection/render-agent-log@v0`, runs on `node24`, so no runner needs an install
step. Its modes:

- `with: execution-file: ${{ steps.claude.outputs.execution_file }}` renders a finished run, for
  `claude-code-action` users (anthropics/claude-code-action#141's audience).
- Without inputs, it puts the CLI on `PATH` for live piping:
  `claude -p … --output-format stream-json --verbose | render-agent-log`.
- The same step also sets the `wrapper` output, passed to `claude-code-action` as
  `path_to_claude_code_executable`: a wrapper around `claude` that renders a copy of its stream into
  the step's log, Linux only. How it does that and how it fails safe is in
  [`wrapper/claude-wrapper`](../wrapper/claude-wrapper).

The CLI is the Action's live mode, not a separate deliverable.

## Engineering

- **Language:** TypeScript (strict), Node 24. It is the only language with the official types, and
  JavaScript actions run on every runner without setup.
- **Tools:** Biome (lint and format), Vitest, esbuild, and the SDK as a pinned devDependency.
- **Tests:** golden files rendered from fixtures, plus targeted cases for the silent wrong answers:
  parallel-call attribution, errors staying red, subagent nesting, the unknown-type line, injected
  `::error::` / `::add-mask::` / `::endgroup::` / `##[…]` staying inert (checked by applying the
  runner's rules to the output), and a renderer stopped mid-group still closing it. No tests that
  restate the code.
- **Fixtures:** real `stream-json` runs, sanitized, plus a hand-made stream of hostile output.
  [`fixtures/claude/README.md`](../fixtures/claude/README.md) says what each covers and how to
  capture one.
