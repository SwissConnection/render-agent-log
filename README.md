# render-agent-log

A GitHub Action that turns a Claude Code run into a log you can read in the Actions UI: one line per
tool call, the first lines of its output under it, the rest folded away, and a summary line at the
end. It works live, while the agent runs, or on a finished run.

Without it, `claude-code-action` logs either the final result only, or, with `show_full_output`, one
pretty-printed JSON object per message. Headless `claude -p` gives you the final answer or raw
`stream-json`.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/images/demo-dark.png">
  <img alt="A Claude Code run in the GitHub Actions log: a failing test, the files it read, the edit as a diff, the tests passing, and a summary line" src="docs/images/demo-light.png">
</picture>

That is Claude fixing a failing test in [`demo/`](demo/), inside `claude-code-action`. The log above
is [the run itself](https://github.com/SwissConnection/render-agent-log/actions/runs/36229359850/job/108369445209#step:4:276),
starting at the first rendered line; everything before it is the action's own setup output.
[`demo.yml`](.github/workflows/demo.yml) is the whole workflow.

## Usage

There are three ways to use it, depending on how you run Claude. In each, pin the Action to a release
(`@v0` follows the latest `v0.x.y`) or to that release's commit SHA.

### Live, inside `claude-code-action` (Linux runners)

The Action without inputs sets a `wrapper` output. Pass it to `claude-code-action` as
`path_to_claude_code_executable`: the wrapper runs the real `claude`, hands the action its output
untouched, and renders a copy into the step's log as it arrives.

```yaml
- uses: SwissConnection/render-agent-log@v0
  id: render

- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    path_to_claude_code_executable: ${{ steps.render.outputs.wrapper }}
    prompt: …
```

Pass the `wrapper` output, never a path in your checked-out tree. The wrapper runs in the step that
holds the Claude token, so whatever it points at can read the token; the output points at this
Action's own copy, fixed by the `uses:` ref. (Like any action's files, that copy is only as safe as
the job's earlier steps.)

The wrapper depends on how `claude-code-action` starts `claude`
([#2](https://github.com/SwissConnection/render-agent-log/issues/2) has the details). If the renderer
dies or hangs, the run still completes; if it dies halfway through a folded group, the wrapper closes
the group, so the action's own `::error::` lines still become annotations. On macOS and Windows
runners the `wrapper` output is empty and the Action prints a warning, so `claude-code-action` runs
its own `claude`, unrendered.

### After the run, from `claude-code-action`'s `execution_file`

Works on any runner, but you only see the log once the run is over.

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

### Live, with `claude -p`

The Action without inputs also puts `render-agent-log` on `PATH` for later steps. Pipe
`stream-json` through it:

```yaml
- uses: SwissConnection/render-agent-log@v0

- shell: bash # adds pipefail, so the step fails when claude does
  run: claude -p "…" --output-format stream-json --verbose | render-agent-log
```

It runs on the Node.js that runs the Action, so the runner needs none of its own.

In all three, leave `show_full_output` off, or the log gets the raw JSON as well.

## What the log shows

Each screenshot links to the step in the run it came from.

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

The [visual check](.github/workflows/visual-check.yml) renders every case the tests cover on each
pull request, so its latest run shows the rest: parallel calls whose results come back out of order,
thinking, and an `execution_file`.

## Inputs and outputs

| Name | | |
|---|---|---|
| `execution-file` | input | A finished run to render: `claude-code-action`'s `execution_file`, or a `stream-json` file. Without it, the Action sets up the live modes. |
| `stream-copy` | input | Live modes only: a file the wrapper appends the raw `stream-json` to, for debugging. Off by default, since it copies every tool output to disk. |
| `wrapper` | output | Live modes only, Linux only: the path to pass to `claude-code-action` as `path_to_claude_code_executable`. |

## Secrets

The rendered log shows what `show_full_output: true` would show: tool calls, tool output and the
agent's text. It adds no exposure beyond that. GitHub still masks each secret it knows, but only
verbatim. A secret that a tool prints encoded, split or transformed shows in the log, with or without
this Action, so keep secrets away from the agent's tools in the first place.

Keeping workflow commands out of tool output guards against output that happens to contain them,
not against the agent. An agent that has Bash can write workflow commands into the step's log
itself, with or without this Action.

## Status

Claude Code only, for now. The message format is Claude's own (`stream-json`, typed by the Agent
SDK); other agents would each need an adapter. The design is in [docs/spec.md](docs/spec.md), and
[SECURITY.md](SECURITY.md) says how to report a vulnerability.

MIT licensed.
