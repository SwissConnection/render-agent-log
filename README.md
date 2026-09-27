# render-agent-log

A GitHub Action that turns a Claude Code run into a log you can read in the GitHub Actions UI.

It gives you one line per tool call, with basic highlighting and fold-away blocks for the details.
It works live, while the agent runs, or on a finished run.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/demo-dark.png">
  <img alt="A Claude Code run in the GitHub Actions log: a failing test, the files it read, the edit as a diff, the tests passing, and a summary line" src="docs/images/demo-light.png">
</picture>

That is Claude fixing a failing test in [`demo/`](demo/), inside `claude-code-action`. You can check
out the log above [in this run](https://github.com/SwissConnection/render-agent-log/actions/runs/36229359850/job/108369445209#step:4:276).
[`demo.yml`](.github/workflows/demo.yml) is the whole workflow.

---
<br/>

## Why

Out of the box, a Claude Code run in CI logs either its final answer or, with `claude-code-action`'s
`show_full_output`, every message the agent exchanged, pretty-printed as JSON. The first tool call of
the run above looks like this:

```jsonc
{
  "type": "assistant",
  "message": {
    "model": "claude-sonnet-5",
    "id": "msg_011CfRipsU9MarjeE4ScQqz6",
    "type": "message",
    "role": "assistant",
    "content": [
      {
        "type": "tool_use",
        "id": "toolu_01UkUTsHSEaidHTufKEuYXbG",
        "name": "Bash",
        "input": {
          "command": "cd demo && npm test --silent 2>&1 | tail -80"
        },
        // … 36 more lines of ids, token usage and metadata
```

That is 51 lines, and the whole run is about 1,000. render-agent-log prints the same call as

```text
● Bash(cd demo && npm test --silent 2>&1 | tail -80)
```

and the whole run in 32 lines, with each tool's full output one click away.

---
<br/>

## Quick start

On a Linux runner, add one step before `claude-code-action` and pass its `wrapper` output on:

```yaml
- uses: SwissConnection/render-agent-log@v0
  id: render

- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    path_to_claude_code_executable: ${{ steps.render.outputs.wrapper }}
    prompt: …
```

The run now renders in the log of the `claude-code-action` step as it happens. Leave
`show_full_output` off, or you get the JSON as well.

Pin the Action to a release: `@v0` follows the latest `v0.x.y`, and a release's commit SHA fixes it.

---
<br/>

## How it works

Claude Code reports a run as a stream of JSON messages (`stream-json`, typed by the Agent SDK): what
the agent says, each tool call, each result, and a summary at the end. render-agent-log reads that
stream and writes log lines: a `●` line per call, the first three lines of its output under it, the
full output in a collapsible group, and a `✻` line with turns, time and cost. It gets the stream in
one of three ways:

| Mode | Where the stream comes from | Live | Runners |
|---|---|---|---|
| **Wrapper** | `claude-code-action`, through `path_to_claude_code_executable` | yes | Linux |
| **CLI** | `claude -p … --output-format stream-json`, piped into `render-agent-log` | yes | any |
| **Execution file** | `claude-code-action`'s `execution_file` output | after the run | any |

**Wrapper.** `claude-code-action` runs `claude` and reads its output itself, so nothing reaches the
log while it runs. The wrapper stands in for `claude`: it runs the real one, passes its output to the
action unchanged, and writes a rendered copy into the step's log. To reach that log from inside the
action it writes to the action process's standard output through `/proc`, which only Linux has. On
macOS and Windows runners the `wrapper` output is empty, the Action prints a warning, and
`claude-code-action` runs unrendered; use the CLI or the execution file there.

**CLI.** If you run `claude -p` yourself, the stream is already on standard output. Pipe it through:

```yaml
- uses: SwissConnection/render-agent-log@v0

- shell: bash # adds pipefail, so the step fails when claude does
  run: claude -p "…" --output-format stream-json --verbose | render-agent-log
```

The Action puts `render-agent-log` on `PATH` for the job's later steps. It runs on the Node.js that
runs the Action, so the runner needs none of its own.

**Execution file.** `claude-code-action` also saves the run to a file when it finishes. Render that
file in a later step. You see the log only after the run, but it needs nothing from the runner:

```yaml
- uses: anthropics/claude-code-action@v1
  id: claude
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    prompt: …

- uses: SwissConnection/render-agent-log@v0
  if: always() && steps.claude.outputs.execution_file != ''
  with:
    execution-file: ${{ steps.claude.outputs.execution_file }}
```

---
<br/>

## What the log shows

Each screenshot links to the line in the run it came from.

**Full output, folded.** Each call shows its first three lines; the rest is one click away. An edit
shows the changed lines, and the fold holds the whole diff.
([run](https://github.com/SwissConnection/render-agent-log/actions/runs/36229359850/job/108369445209#step:4:370))

<img alt="An Edit call with its changed lines, and the expanded fold holding the full diff" src="docs/images/fold-diff.png" width="640">

**Subagents.** A subagent's calls sit under the Agent call that started it, one `│` per level. When
subagents run in the background and their messages interleave, each line still lands under its own
Agent call, and a tool result always sits under its own call.
([run](https://github.com/SwissConnection/render-agent-log/actions/runs/36205877687/job/108302188131#step:5:7))

<img alt="An Agent call with the subagent's Grep and Glob calls nested under it" src="docs/images/subagent.png" width="760">

**Failures.** Failed tool calls and a run that ends in an error are red, with the reason under the
summary line.
([run](https://github.com/SwissConnection/render-agent-log/actions/runs/36205877687/job/108302188131#step:8:7))

<img alt="A run that hit its turn limit: the summary line in red with the error under it" src="docs/images/max-turns.png" width="640">

**Tool output can't issue workflow commands.** GitHub runs any log line that starts with `::`, so a
changelog, a web page or a test that prints `::error::` or `::add-mask::` would otherwise add
annotations or hide text in your log. Here they print as text.
([run](https://github.com/SwissConnection/render-agent-log/actions/runs/36205877687/job/108302188131#step:11:10))

<img alt="Tool output containing ::error:: and ::add-mask:: lines, shown as plain text" src="docs/images/hostile-output.png" width="640">

The [visual check](https://github.com/SwissConnection/render-agent-log/actions/workflows/visual-check.yml?query=branch%3Amain)
renders every fixture the tests use, on every change to `main`. Its latest run shows the rest: parallel
calls whose results come back out of order, thinking, and an execution file.

---
<br/>

## Safety

**Workflow commands.** Every line render-agent-log prints starts with a character of its own (`●`,
`│`, `└`, `✻`, `›`, `·`), and line breaks inside tool output, including a bare `\r`, become new
lines that start the same way. So nothing a tool prints can reach the start of a log line, which is
where GitHub looks for `::` commands. The older `##[…]` syntax, which GitHub also finds mid-line, is
broken up with an invisible color code. That guards against output that happens to contain commands,
not against the agent itself: an agent with a shell can write workflow commands into the log
directly, with or without this Action.

**The wrapper and your token.** The wrapper runs in the step that holds the Claude token, so
whatever `path_to_claude_code_executable` points at can read that token. Pass the `wrapper` output,
which points at this Action's own copy, fixed by the `uses:` ref. Never pass a path in your
checked-out tree: in a workflow that checks out a pull request, that is code the pull request's
author wrote. (Like any action's files, the Action's copy is only as safe as the job's earlier steps.)

**Secrets.** The rendered log shows what `show_full_output: true` would show: tool calls, tool output
and the agent's text. GitHub still masks each secret it knows, but only verbatim. A secret that a
tool prints encoded, split or transformed shows in the log, with or without this Action, so keep
secrets away from the agent's tools in the first place.

**If the renderer fails.** The run doesn't depend on it. If the renderer dies or hangs, the run
completes and only the rendering stops. If it dies halfway through a folded group, the wrapper
closes the group, so the action's own `::error::` lines still become annotations.

---
<br/>

## Reference

| Name | | |
|---|---|---|
| `execution-file` | input | A finished run to render: `claude-code-action`'s `execution_file`, or a `stream-json` file. Without it, the Action sets up the live modes. |
| `stream-copy` | input | Live modes only: a file the wrapper appends the raw `stream-json` to, for debugging. Off by default, since it copies every tool output to disk. |
| `wrapper` | output | Live modes only, Linux only: the path to pass to `claude-code-action` as `path_to_claude_code_executable`. |

---
<br/>

## Status

- **Claude Code only.** The stream format is Claude's own; another agent would need an adapter.
- **Tested on Ubuntu runners.** The CLI and the execution file use nothing Linux-specific and should
  work on macOS and Windows (the CLI from a `bash` step), but only Linux is exercised in CI.
- **The wrapper follows `claude-code-action`.** It relies on how the action starts `claude`
  ([#2](https://github.com/SwissConnection/render-agent-log/issues/2) has the details), so an action
  update can break the live rendering. If the action starts `claude` some other way, the wrapper
  warns and runs it unrendered; if the action stops shipping `claude` where the wrapper looks for it,
  the step fails with an error naming the path.
- **`v0.x`.** Inputs and output may still change before `v1`.

The design is in [docs/spec.md](docs/spec.md). To report a vulnerability, see [SECURITY.md](SECURITY.md).

Licensed under Apache-2.0 (see [LICENSE](LICENSE) and [NOTICE](NOTICE)).
