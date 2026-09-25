# render-agent-log

Render agent runs as readable, colored, collapsible logs in the GitHub Actions UI, the way the agent's
own terminal shows them: one line per tool call, a short preview of its output, the full output folded
away, and a one-line summary at the end.

Claude Code comes first, both live (`claude -p --output-format stream-json`) and after the run
(`anthropics/claude-code-action`'s `execution_file`).

**Status:** not usable yet. The design is in [docs/spec.md](docs/spec.md), and progress is tracked in
the milestones.
