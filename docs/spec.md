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

The renderer reads stdin, or the file named by its one argument. An input whose first non-blank line
starts with `[` is an execution file, parsed whole; anything else is read line by line as it arrives.

The renderer imports these types and switches exhaustively over `SDKMessage.type`. When a bump of
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

   This guards against output that contains commands, not against the agent: an agent with Bash can
   write workflow commands into the step's log itself through `/proc`, with or without this tool (#2).
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
6. Secrets: this adds no exposure beyond `show_full_output`, and GitHub still masks them verbatim.
   The README says so plainly.
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

One TypeScript package, bundled with esbuild to `dist/`, which is committed. CI checks that `dist/`
matches the source.

- **Action** `SwissConnection/render-agent-log@v1`, `runs.using: node24`, so no install step on any runner:
  - `with: execution-file: ${{ steps.claude.outputs.execution_file }}` renders a finished run. This is
    for `claude-code-action` users, meaning #141's audience and our `claude.yml` / `claude-pr-summary.yml`.
  - Without inputs, it puts the CLI on `PATH` for live piping:
    `claude -p … --output-format stream-json --verbose | render-agent-log`.
  - Live inside `claude-code-action`, it ships the wrapper from the spike (#2). The same step
    without inputs sets the `wrapper` output, a path inside the Action's own directory, passed as
    `path_to_claude_code_executable`. Never a path in the checked-out tree: the wrapper runs with the
    OAuth token in its environment, and a checked-out pull request would choose what runs. The wrapper
    runs the `claude` that the action installs with the Agent SDK and passes the SDK its stream
    untouched. `tee` copies the stream into a file, and the renderer follows the file into the step's
    log (`/proc/$PPID/fd/1`, so Linux only). A file never fills, so a renderer that hangs or falls
    behind cannot stall the agent. If the renderer exits non-zero, the wrapper closes the group for
    it. If the parent's stdout is not a pipe, or is the wrapper's own stdout, a process sits between
    the SDK and the wrapper, and the log is not where the wrapper expects it. The wrapper then renders
    nothing and prints one `::warning::`. On other runner OSs the output is empty, with a
    `::warning::`. The `stream-copy` input keeps the raw stream, off by default.
- **npm** `@swissconnection/render-agent-log`: later, when someone wants it in a local terminal.

The Action comes first because it is the product. The CLI is its live mode, not a separate
deliverable.

## Engineering

- **Language:** TypeScript (strict), Node 24. It is the only language with the official types, and
  JavaScript actions run on every runner without setup.
- **Tools:** Biome (lint and format), Vitest, esbuild, and the SDK as a pinned devDependency.
- **Tests:** golden files rendered from fixtures, plus targeted cases for the silent wrong answers:
  parallel-call attribution, errors staying red, subagent nesting, the unknown-type line, injected
  `::error::` / `::add-mask::` / `::endgroup::` / `##[…]` staying inert (checked by applying the
  runner's rules to the output), and a renderer stopped mid-group still closing it. No tests that
  restate the code.
- **Fixtures:** real `stream-json` runs captured locally and sanitized, plus a hand-made stream of
  hostile output (`fixtures/claude/README.md`). The execution-file format is tested by wrapping a
  fixture into an array; one real execution file from swissconn-workspace is added during
  dogfooding (#7).
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
1. **Core and Action, v0.1.** Build the renderer, the fixtures, the three Action modes and a CI release.
2. **Dogfood in swissconn-workspace.** Its three Claude workflows log through render-agent-log.
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
