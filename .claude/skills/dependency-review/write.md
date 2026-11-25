# Write: the follow-ups, then the note

[The decision rule](SKILL.md#the-decision-rule) governs everything here. You write two files into
`$REVIEW` (locally, the directory you are given); jobs without you file the follow-ups and put the note
into the description.

## Follow-ups: `followups.json`

One per piece of work the update owes or enables; related findings share one. The models:

| Finding | Branch |
|---|---|
| A rule-1 message type, or a fix that needs the new version | this PR's `headRefName`: it is stacked and merges with this PR |
| A blocker that holds without the update | `main`, merged before this PR |
| An existing bug found while reading, at most two per PR (list the rest in the note) | `main` |
| An improvement that changes our code | `main`, or this PR's branch when it needs the new version |

**Follow-ups that go together.** One that builds on another's change, or will likely edit the same code
(one module or function), is chained on it: listed after it, with `branch` `prepared-pr/F1` for F1.
Its PR is prepared once F1's is open, and both merge in one stack. Unrelated ones stay apart, so
neither waits on the other's review.

Every follow-up is **prepared**, so a draft PR is made for it, unless it needs the owner's choice, an
open question or a scope that could grow. Dedupe first, closed issues included
(`gh issue list --state all --search "<symbol or package> in:title,body"`): an open match is named in
`existing`, not filed again.

```json
[
  {
    "id": "F1",
    "title": "The consequence, not the version bump",
    "body": "The research the note leaves out: the call site (path:line), the probe, the release-note link, the package old → new. It states the outcome; a fix it sketches is a starting point.",
    "branch": "renovate/all",
    "prepared": true,
    "why_not": "",
    "bug": false,
    "existing": null
  }
]
```

`branch` is the branch it builds on, by the table: `main`, this PR's `headRefName`, or `prepared-pr/F1`;
the job ends the issue with it. `why_not` is a few words when `prepared` is false. `bug` is true for an existing bug. With `existing`
set to an issue number, nothing is filed and that issue is linked. An empty list is `[]`.

In the note, a follow-up is `#F1`; the job filing it puts its number in its place.

## The note: `note.md`

Emit this, in this order. **Omit a section whose content would be empty**; never a heading with "None"
under it. The badge, the card and the footer are never omitted. The two marker lines are where the job
puts the generated table and checks; write them exactly, on lines of their own.

````markdown
<badge>

> [!<alert>]
> <card, one line per kind>

<!-- what moved -->

### 🔴 Could break

<items>

### 🟡 Deprecated

<items>

### 🟢 Improvements

<at most three items>

**Free with this update**

- <one line per gain that needs nothing from us>

<!-- checks -->

<details>
<summary>Release notes checked, nothing for us</summary>

- **esbuild 0.28.3** fixes source maps, which we do not ship.

</details>

Reviewed by Claude at `<short headRefOid>`. Renovate moves this PR to the newest versions daily.
````

### The badge and the card

| Verdict | Badge | Alert |
|---|---|---|
| Ready to merge | `![Ready to merge](https://img.shields.io/badge/Ready_to_merge-1a7f37?style=for-the-badge)` | `TIP` |
| Ready to merge, follow-up | `![Ready to merge, follow-up #F1](https://img.shields.io/badge/Ready_to_merge-follow--up_%23F1-3fb950?style=for-the-badge&labelColor=1a7f37)` | `IMPORTANT` |
| Blocked, amber | `![Blocked, typecheck](https://img.shields.io/badge/Blocked-typecheck-d4a72c?style=for-the-badge&labelColor=9a6700)` | `WARNING` |
| Blocked, red | `![Blocked, fix #F1 first](https://img.shields.io/badge/Blocked-fix_%23F1_first-e5534b?style=for-the-badge&labelColor=a40e26)` | `CAUTION` |

In a badge URL, `-` is `--`, a space `_` and `#` `%23`; the job replaces `%23F1` too. A red verdict
whose follow-up is stacked says so: `Blocked, merge with #F1`.

**The card** is at most five lines, one per kind, each only when it has content:

| Line | Says |
|---|---|
| **bold subject** | What moved, in words: `**Agent SDK and Claude Code 2.1.282 → 2.1.329**, claude-code-action v1.0.287, and the runners to Ubuntu 26.04` |
| 🔴 | What could break, in a phrase, with its follow-up: `🔴 Claude now sends a message the log shows as unknown · #F1 prepared` |
| 🟡 | Deprecations that reach our code |
| 🟢 | The gains worth knowing, as a comma list |
| ✅ / ❌ | The checks as one verdict: `✅ Typecheck, a real run and the wrapper all pass`, or a ❌ line per failure |

The card is read by someone who has never seen this workflow: no internal vocabulary.

### Items

Every item in 🔴, 🟡 and the first three 🟢 has one shape:

```markdown
**Claude Code 2.1.329 sends a message the log shows as unknown** · Agent SDK 0.3.329 · [`src/render.ts:128`](https://github.com/SwissConnection/render-agent-log/blob/<short headRefOid>/src/render.ts#L128) · #F1 prepared
Two sentences: what a user now sees differently, and when; then what it costs or buys.

<details>
<summary>Evidence</summary>

The probe as run, with its output, in a code block.

> The release-note or type line that is the evidence.
> — [Claude Code 2.1.312](https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md)

</details>
```

- **The headline states the consequence**, not the change: a teammate's first sentence in standup.
- Then the package and version, or `existing bug`; the `path:line` link at the reviewed commit; the
  follow-up as `#F1 prepared` or `#F1 not prepared: <why>`.
- A latent break's fold says why it does not block.

### Style

Follow `docs/craft.md`: plain declaratives, no hedging, no praise, no "this PR", American spelling. The
test: **would a colleague say this sentence out loud?** "highlight.js 11.13 adds grammar scopes": no.
"Nothing in highlight.js 11.13 changes a color we print": yes.

Never write the mention that summons Claude; it starts an agent run.
