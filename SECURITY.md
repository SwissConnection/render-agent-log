# Security

Report a vulnerability privately through the repository's
[Security tab](https://github.com/SwissConnection/render-agent-log/security/advisories/new), not in
a public issue.

What we most want to hear about:

- Anything an agent's tool output, the agent's text or a tool argument can do to the workflow through
  the log: run a workflow command (`::error::`, `::add-mask::`, `::stop-commands::`, `##[…]`), close
  or open a group, or hide text.
- A way for the wrapper to run code that isn't this Action's own copy, or to leak the Claude token.

Out of scope: an agent with a shell writing workflow commands into the log directly. It can do that
with or without this Action (see [README § Secrets](README.md#secrets)).

Fixes go into the latest `v0.x` release.
