# render-agent-log

Render agent runs as readable, colored, collapsible logs in the GitHub Actions UI, the way the agent's
own terminal shows them: one line per tool call, a short preview of its output, the full output folded
away, and a one-line summary at the end.

Claude Code comes first, live or after the run. The design is in [docs/spec.md](docs/spec.md).

## Usage

The Action runs in three modes. Pin it to a release (`@v0` moves with each `v0.x.y`) or, better, to
that release's commit SHA.

### After the run: `claude-code-action`'s `execution_file`

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

Leave `show_full_output` off, or the log holds the raw JSON as well.

### Live, from the CLI

Without inputs, the Action puts `render-agent-log` on `PATH` for the job's later steps. Pipe
`claude -p`'s `stream-json` through it:

```yaml
- uses: SwissConnection/render-agent-log@v0

- shell: bash # adds pipefail, so the step fails when claude does
  run: claude -p "…" --output-format stream-json --verbose | render-agent-log
```

`render-agent-log` runs on the node that runs the Action, so the runner needs no node of its own.

### Live, inside `claude-code-action` (Linux runners)

The same step without inputs also sets the `wrapper` output: a stand-in for `claude` that runs the
real one, passes the Agent SDK its stream untouched, and renders a copy into the step's log as it
arrives.

```yaml
- uses: SwissConnection/render-agent-log@v0
  id: render

- uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    path_to_claude_code_executable: ${{ steps.render.outputs.wrapper }}
    prompt: …
```

**Pass only the `wrapper` output, never a path in the checked-out tree.** The wrapper runs with the
OAuth token in its environment. The output points into this Action's own directory, which the `uses:`
ref pins. A path in the workspace would let whatever is checked out choose what runs with the token,
such as the head of a pull request under review.

The wrapper relies on `claude-code-action`'s internals: the `claude` that its Agent SDK bundles, and
the SDK running in the process whose stdout is the step's log
([#2](https://github.com/SwissConnection/render-agent-log/issues/2) has the details). It fails safe:

- If the renderer dies, the run completes. The wrapper closes the group the renderer left open, so
  the action's own `::error::` lines still become annotations.
- If the renderer hangs, the run completes unrendered. The renderer reads from a file, not a pipe,
  so it cannot hold up the agent.
- If a process ever sits between the SDK and the wrapper, the wrapper cannot trust where the log is.
  It renders nothing and leaves a `::warning::`. Render the `execution_file` after the run instead.
- On macOS and Windows runners the `wrapper` output is empty and the Action warns, so
  `claude-code-action` runs its own `claude`, unrendered.

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

The renderer keeps tool output from issuing workflow commands (`::error::`, `::add-mask::` and the
like). That guards against output that happens to contain them, not against the agent. An agent that
has Bash can write workflow commands into the step's log itself, with or without this Action.
