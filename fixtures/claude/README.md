# Claude Code fixtures

Real `claude -p … --output-format stream-json --verbose` streams, one `SDKMessage` per line, plus one
hand-made stream of hostile tool output. The renderer's golden files and targeted tests read these.

| File | Covers |
|---|---|
| `edit-and-bash.jsonl` | Two parallel Reads; `npm test` failing (`is_error`, red); an Edit with `structuredPatch`; two parallel Bash calls whose results arrive in reverse order (`fast done` before `slow done`); `node --help`, 465 lines of stdout; `task_started` / `task_notification` for a Bash call |
| `subagent.jsonl` | One foreground Agent call: the subagent's prompt, its Grep and Glob calls and their results carry `parent_tool_use_id`, then the Agent's own result under the top-level call |
| `subagents-background.jsonl` | Two parallel Agent calls that the CLI ran in the background: each call's result is only "Async agent launched", the two subagents' messages interleave, and the run emits three `system/init` + `result` pairs as the session resumes after each `task_notification`. Also two `thinking` blocks with empty text and only a signature, and `background_tasks_changed` / `task_updated` |
| `thinking.jsonl` | Captured with `--thinking-display summarized`: a `thinking` block with text, a Read, the answer, and a run of `system/thinking_tokens` |
| `max-turns.jsonl` | `--max-turns 2`: the final `result` is `error_max_turns` with `is_error: true` and `errors` |
| `hostile-output.jsonl` | Hand-made (see below) |

Shapes worth knowing before writing the renderer:

- Each content block arrives as its own `assistant` message; blocks of one API response share
  `message.id`. Parallel calls show up as consecutive `tool_use` messages with one `message.id`, and a
  fast call's result can arrive before the next call is even emitted.
- `tool_use_result` is an object on success but a plain string (`"Error: Exit code 1\n…"`) on a failed
  Bash call.
- A tool result's `content` is a string for most tools and an array of text blocks for Agent.
- `thinking` text is empty (only a `signature`) unless the run asks for `--thinking-display summarized`,
  the SDK's `thinking.display` option. Every other capture here ran without it.
- In `subagents-background.jsonl`, `num_turns` and `duration_ms` restart with each `result`, while
  `total_cost_usd` does not (0.0988, 0.0988, 0.1068).

## `hostile-output.jsonl`

Built from the message envelopes of `edit-and-bash.jsonl`, so every message has the SDK's real shape;
only the ids, timestamps and tool output are made up. None of it may reach the log as a live command:

- A Bash stdout with every workflow command the runner honors (`::error::`, `::warning::` behind
  spaces, `::notice::` behind a tab, `::add-mask::`, `::endgroup::`, `::group::`, `::stop-commands::`
  with its closing token, `::set-env`, `::add-path::`, `::debug::`, `::error` with properties)
- In the same stdout, escape sequences: SGR colors (must survive), then erase-line, OSC title, OSC 8
  hyperlink, cursor movement, clear screen, private modes, DCS and 8-bit C1 CSI (must be stripped).
  Several put a command at the start of the line once the escape is removed, one sits behind an SGR
  code, and one sits behind a bare carriage return, which .NET's `ReadLine` treats as a line break
- A failed Bash call with the commands in stderr, and its string `tool_use_result`
- A multi-line Bash `command` input whose second line is `::add-mask::…`, for the one-line call header
- A Read whose numbered `content` hides the commands behind line numbers while
  `tool_use_result.file.content` does not
- A subagent's WebFetch of a page with commands in it; the subagent's text repeats them, and the Agent
  hand-back repeats them indented by two spaces, which still counts as the start of a line

## Capturing

The real runs used Claude Code 2.1.282 with `--model sonnet --safe-mode --strict-mcp-config
--no-session-persistence --permission-mode acceptEdits` and a narrow `--allowedTools`, in a scratch
git repository holding `src/sum.js` (an off-by-one loop), `src/sum.test.js`, `src/greet.js` and a
`package.json` whose test script is `node --test`. `--safe-mode` keeps personal skills, plugins, MCP
servers and `CLAUDE.md` out of the stream.

Before committing a capture, replace the scratch directory with `/home/runner/work/demo/demo` and the
CLI's task-output directory with `/tmp/claude-1001/-home-runner-work-demo-demo`, then search the file
for `/Users/`, `/private/`, the user name and the host name. This repository is public: no local paths,
host names, connection strings, tokens or private repository content.

`claude-code-action`'s `execution_file` holds the same messages as one JSON array; a real one is
added with the Action's execution-file mode (#7).
