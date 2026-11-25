---
name: dependency-review
description: >
  Review Renovate's dependency PR and write its verdict: whether it merges, what would render or behave
  differently for the Action's users, what is deprecated, what improves, and the follow-ups, each
  prepared as a draft PR unless it needs the owner. Used by dependencies.yml on renovate/*, in two
  calls (research, then write), and locally as /dependency-review.
allowed-tools: Bash, Read, Grep, Glob, WebFetch, WebSearch
---

# Dependency review

You judge Renovate's PR, which moves every dependency at once, daily. Your verdict and findings become
the top of its description, the note; the table of what moved and the checks around them are
generated. The note answers the merge question as a **decision, not a report**: can this merge, what
would a user of this Action see differently, what is on its way out, and what the update gives us.

**Argument:** `research` or `write` in the workflow, which runs both in one session. Locally, with no
argument, do both.

## What this is not

- **Not a changelog paraphrase.** The table already lists every bump. Retelling a release, or reading
  notes for a package that reaches nothing of ours, is the failure this skill exists to avoid.
- **Not a rerun of the checks.** The workflow ran them before you started; you read their results.
- **Not the implementer.** You change nothing in the tree. What needs doing becomes a follow-up, which
  another agent prepares as a draft PR.

## What our users see

This repository is a GitHub Action. A dependency reaches its users through one of these, and nothing
else counts as reach:

| Surface | Where | Moved by |
|---|---|---|
| **The rendered log** | `src/`, bundled into `dist/` | the Agent SDK's types (the input contract, AGENTS.md rule 1); what Claude Code actually sends; highlight.js, the one runtime dependency |
| **The wrapper inside claude-code-action** | `wrapper/claude-wrapper` | claude-code-action: where it puts the claude it ships, how it starts it, the events it accepts |
| **The Action's runtime** | `action.yml`, `dist/` | esbuild's output, Node 24 |
| **Our checks** | CI, the workflows | TypeScript, Biome, Vitest, `@types/node`, the pinned actions, the runners |

The spec (`docs/spec.md`) says what the log must look like; every output rule there is a place where a
dependency can make it wrong.

## The decision rule

Depth follows **reach × change**.

1. Spend release-note and reading budget on what reaches the first three surfaces, and on major and
   minor bumps. A patch of a dev tool with green checks is a table row. Stop there.
2. **Sort by consequence, not by package.** A finding goes in the section its consequence earns
   (🔴 could break, 🟡 deprecated, 🟢 improvement), never under a package heading.
3. **Length follows consequence, not changelog size.** The package with no consequence is never the
   longest thing in the note.

### Verdicts

The test between red and amber: **would a log someone reads come out wrong because this merged as
it is?** A result under the wrong call, a command made live, an error shown as success, the wrapper
failing inside claude-code-action, a highlight.js change that alters text: red. It cannot pass CI yet,
but nothing a user sees changes (a message type the new SDK adds fails the typecheck, a stricter rule,
a failed build, a check that could not run): amber. A break nothing reaches today is neither: it merges with a follow-up. What `main` already
does wrong is an existing bug, whatever new release exposes it: it goes in 🔴 after the breaks, its
follow-up branches from `main`, and it never sets the verdict, since merging this changes nothing
about it.

| Verdict | When |
|---|---|
| Ready to merge | Nothing follows from this update |
| Ready to merge, follow-up | It merges; an issue picks up work the update enables or owes |
| Blocked, amber | Cannot merge yet; the fix is mechanical |
| Blocked, red | A user would see something wrong; the fix, with a test, lands first |

A follow-up that needs the update itself, like a rendering for a message type the new SDK adds, is
stacked on this PR's branch and merges with it as one stack. A blocker that holds without the update
branches from `main` and merges first.

## Procedure

1. **The PR.** `gh pr view <n> --json title,body,headRefName,headRefOid` (`<n>`: `$PR`, else the PR of
   the current branch). The body may hold the last note: reuse its wording where it is still right.
2. **The checks**, all in `$CHECKS` (locally, the directory you are given):
   - `moved.md`, the table; it is final.
   - `typecheck.md` and `tsc.txt`. Each error names something the renderer does not handle. A
     message type in `SDKMessage` the switch in `src/render.ts` lacks is a rule-1 follow-up: a rendering
     or an explicit drop, decided per type.
   - `types.diff`, the SDK's `.d.ts` files against the merge base's. Read it for what `tsc` cannot see:
     a new field on a message the renderer shows, a tool's input or output that changed shape
     (`src/tools.ts` reads them), a subtype documented but not yet in the union.
   - `canary.md`, `stream.jsonl` and `rendered.log`: a real run of the new Claude Code, rendered by this
     branch. Read the rendering against the spec's output table, line by line; a placeholder, a raw
     value, a result under the wrong call, or a wrong indent is a finding even when the check passed.
     Find the message behind it in `stream.jsonl`. Whether `main`'s renderer does the same tells an
     existing bug from a new one: render the line through `node src/index.ts` on a one-line file.
   - `wrapper.md`: the wrapper's live checks in the new claude-code-action. A failure's log is in the
     run (`gh run view "$RUN_ID" --log-failed`).
3. **Release notes**, for the attention set the decision rule picks. The Agent SDK and Claude Code: the
   `CHANGELOG.md` of `anthropics/claude-code` between the two versions (the SDK's 0.3.N goes with Claude
   Code 2.1.N), read for stream-json, SDK messages, tools, and the flags our workflows pass.
   claude-code-action: its GitHub releases and, when the wrapper is involved, the source of how it
   finds and starts claude. Any other package: its own releases. Quote the line that is evidence; never
   paste notes. A dismissed entry that names something we use (a message we render, a flag we pass, an
   input we read) gets its own line and reason in the note.
4. **Probe** what reading cannot settle: render a crafted message through `node src/index.ts`, run one
   test (`npx vitest run <file> -t <name>`), or read the package in `node_modules`. One representative
   case, within two minutes; a command that timed out is shrunk or dropped, never rerun as it was. Add
   nothing to the tree.
5. **In the workflow, `research` ends here:** end your turn with your findings, each with its section
   and evidence. Then `write` resumes this session. Locally, go on.
6. **Read [write.md](write.md)** and follow it.
