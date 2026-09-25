# render-agent-log — specification

Status: agreed 2026-09-25. Work is tracked in this repository's milestones (Spike, v0.1, Dogfood, v1)
and on the [render-agent-log board](https://github.com/orgs/SwissConnection/projects/6).

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

The renderer imports these types and switches exhaustively over `SDKMessage.type`. When Renovate bumps
the SDK and a new message type appears, `tsc` fails in that PR, and that failure is the work item.
At runtime, a message the build did not know about prints as one gray `· <type>` line. It is never
dropped silently and never crashes the renderer.

## Output

| Message | Rendering |
|---|---|
| `system/init` | gray `✻ <model> · <cwd>` line |
| assistant `text` | `●` prose with a small Markdown subset turned into ANSI: bold, inline code, headings, lists |
| assistant `thinking` | gray italic, when present |
| assistant `tool_use` | green `●` **Tool**(main argument, one line, ≤140 characters) |
| user `tool_result` | up to 3 preview lines under `└` (gray, red if `is_error`; not Claude Code's `⎿`, which falls back to a wider font in the log), then the full output in `::group::… N lines` |
| Edit/Write result | colored diff from `tool_use_result.structuredPatch` |
| Bash result | `stdout` and `stderr` from `tool_use_result`, with stderr marked |
| subagent messages (`parent_tool_use_id` set) | indented under the Agent call |
| `task_*`, `tool_progress`, `rate_limit_event`, `thinking_tokens` | dropped: they are progress, not transcript |
| `result` | `✻ success · N turns · Ns · $X` (green, or red on error) |
| anything else | gray `· <type>` |

Rules:

1. **A result always sits under its own call.** With parallel calls, the call's header is repeated
   above its result. A result shown under the wrong command is the silent wrong answer this tool
   exists to prevent.
2. **Tool output cannot issue workflow commands.** The runner runs any line whose first
   non-whitespace characters are `::` (`ActionCommand.TryParseV2` trims leading whitespace first).
   Tool output is untrusted (changelogs, web pages), so every block of it is wrapped in
   `::stop-commands::<random token>` … `::<token>::`, inside its group. This guards against output
   that contains commands, not against the agent: an agent with Bash can write workflow commands into
   the step's log itself through `/proc`, with or without this tool (#2).
3. Only SGR escape sequences (colors) from tool output reach the log. Other escape sequences are
   stripped.
4. Output is flushed per message, so the live log keeps pace with the agent.
5. Secrets: this adds no exposure beyond `show_full_output`, and GitHub still masks them verbatim.
   The README says so plainly.
6. **The renderer's own colors adapt to the theme.** The log gives each of the 16 named colors a
   shade per theme, so the renderer uses only those, plus bold and italic, and no 256-color or
   truecolor codes, whose shades are fixed. It never uses black (30), which is hard to read on the
   dark theme, or dim (2), which the log renders as normal text.
   Tool output keeps its own colors (rule 3).

## Packaging

One TypeScript package, bundled with esbuild to `dist/`, which is committed. CI checks that `dist/`
matches the source.

- **Action** `SwissConnection/render-agent-log@v1`, `runs.using: node24`, so no install step on any runner:
  - `with: execution-file: ${{ steps.claude.outputs.execution_file }}` renders a finished run. This is
    for `claude-code-action` users, meaning #141's audience and our `claude.yml` / `claude-pr-summary.yml`.
  - Without inputs, it puts the CLI on `PATH` for live piping:
    `claude -p … --output-format stream-json --verbose | render-agent-log`.
  - Live inside `claude-code-action`, it ships the wrapper from the spike (#2), passed as
    `path_to_claude_code_executable`. The wrapper runs the `claude` that the action installs with the
    Agent SDK, passes the SDK its stream untouched, and tees a copy through the renderer into the
    step's log (`/proc/$PPID/fd/1`, so Linux only). If the renderer exits non-zero, the wrapper closes
    the stopped block and the group for it.
- **npm** `@swissconnection/render-agent-log`: later, when someone wants it in a local terminal.

The Action comes first because it is the product. The CLI is its live mode, not a separate
deliverable.

## Engineering

- **Language:** TypeScript (strict), Node 24. It is the only language with the official types, and
  JavaScript actions run on every runner without setup.
- **Tools:** Biome (lint and format), Vitest, esbuild, and Renovate with the SDK as a pinned
  devDependency.
- **Tests:** golden files rendered from fixtures, plus targeted cases for the silent wrong answers:
  parallel-call attribution, errors staying red, subagent nesting, the unknown-type line, and injected
  `::error::` / `::add-mask::` / `::endgroup::` staying inert. No tests that restate the code.
- **Fixtures:** real runs, sanitized. Capture one `stream-json` stream locally and download the
  execution files of the dependency review, the mention agent and the PR summary.
- **Agent guide:** an `AGENTS.md` in the repo, written the same way as the workspace's (pointers and
  non-obvious rules). The key rule: a new SDK message type gets a rendering or an explicit drop,
  decided in its own PR.

## Milestones

0. **Spike (hours), as this repo's first workflow.** Confirm on a real runner that ANSI renders
   inside `::group::` titles, that `stop-commands` nests inside a group, that `●`, `⎿` and `✻`
   render, and that colors read well in light and dark themes. Also try live output inside
   `claude-code-action`: point `path_to_claude_code_executable` at a wrapper that tees the stream
   into the renderer and writes to the action process's stdout (`/proc/$PPID/fd/1`, Linux only). If
   it holds, every workflow gets live output without leaving the action. If not, the direct CLI
   stays the live path. **Result (#2): it holds**, and `spike-wrapper.yml` re-checks it on dispatch
   when the action is bumped. The render spike's `visual-check.yml` stays afterwards as a visual
   check: it renders the fixtures into a real log on every PR.
1. **Core and Action, v0.1.** Build the renderer, the fixtures, both Action modes and a CI release.
2. **Dogfood in swissconn-workspace.** Add a render step to `claude.yml` and `claude-pr-summary.yml`.
   Live is preferred wherever its costs don't outweigh it. The dependency review uses nothing
   `claude-code-action` adds, so it leaves the action for a direct `claude -p | render-agent-log`
   call, which runs on any OS and does not depend on the action's internals. `claude.yml` (tag mode)
   and `claude-pr-summary.yml` stay on the action and go live through the wrapper (#2).
3. **v1 and discoverability.** Marketplace listing (branding, topics), a comment on
   claude-code-action#141, a link request to claude-code-log (its TODO lists GitHub Actions), and
   awesome-claude-code.

## Decisions

- **Name:** `render-agent-log`, verb-first like GitHub's own actions (`upload-artifact`,
  `setup-node`). Marketplace display name "Render Agent Log", CLI `render-agent-log`. "Agent" leaves
  room for tools other than Claude; only Claude is built.
- **Live over after-the-run** wherever its costs don't outweigh it.
- **Public from the start.** Workflows that run Claude trigger only on `push` and `workflow_dispatch`,
  never on `pull_request` or `pull_request_target`, so a fork cannot reach the token. Fork PRs need
  approval before any workflow runs.
