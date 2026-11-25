# Craft: what well-made looks like here

[AGENTS.md](../AGENTS.md) states the rules in a line each. This file says why they hold and what they
look like in this repository, so that "write it well" has something to point at. When a change needs
a pattern, imitate the exemplar; when it finds a better one, add the row.

---

## 1. Exemplars

| Writing… | Reference | Principle |
|---|---|---|
| A closed set of variants | `StdoutMessage` in `src/render.ts`: an exhaustive `switch`, with `satisfies never` in the `default` | Make illegal states unrepresentable. A message type the build does not know fails `tsc`, so an SDK bump that adds one is a red PR, never a message silently dropped |
| What to show, said by the thing that knows | `Output.preview` in `src/tools.ts`: a result names the lines its preview shows (an Edit: the changed lines, not the context around them) | Tell, don't ask. The renderer never inspects a diff to find its changed lines; the tool's output already says |
| A test from a different direction | `liveCommands` in `test/helpers.ts` models the runner's command parser (line ends at `\r` too, leading whitespace trimmed, `##[` anywhere) and runs over the rendered hostile fixture | The check comes from the runner's rules, not the renderer's. A renderer change that let a command through fails this test even after every golden file was regenerated |
| A cross-file invariant | `test/action.test.ts`: the input name is read from `action.yml` once, and the env var derived from it the way the runner does | The one read of a source file that earns its place: neither file can state the invariant alone, and a mismatch is a green step that renders nothing |
| A property over many inputs | `test/highlight.test.ts`: for every language highlight.js has, highlighting changes colors and never text, and every line ends with its styles off | Two properties over 193 languages, checked by breaking the code on purpose. Golden files would have enshrined the wrong answer instead |
| A comment that has to exist | `blank` in `src/render.ts`: why an indent starts with an SGR reset | Comment the surprise, not the code. Delete test: without the line, does correct code read as wrong? If not, the line was prose |
| One home per piece of knowledge | Spec § Output holds the what; the why sits beside the code it explains (`readOutput`'s spaces, `#fold`'s missing gutter); an AGENTS.md rule is one line and a pointer | Copies drift. A pointer doesn't |
| A fixture that is the real thing | `fixtures/claude/execution-file.json`: `claude-code-action`'s output byte for byte, with Biome told to leave `fixtures/` alone | A reformatted capture no longer proves what it claims to |

---

## 2. Not precedent

Things on `main` that look like patterns and are not. Each says why it exists, which is what keeps
it from being copied.

| What | Why it exists | Instead |
|---|---|---|
| The wrapper reaches the log through `/proc/$PPID/fd/1` and relies on how `claude-code-action` starts `claude` (#2) | It is the only way to render live from inside the action | Never a second thing built on those internals. `wrapper.yml` re-checks them before every release; the CLI and execution-file modes depend on nothing of the kind |
| `demo/src/cart.js` has a bug | `demo.yml` has Claude fix it for the README's screenshots | Nothing in AGENTS.md says to leave it: the demo's agent reads AGENTS.md too and stopped to ask (#18). The note is in `demo.yml`, which it does not read |

---

## 3. Writing an issue

The issues here that produced clean PRs share a shape (#20, #21, #22, #27):

1. **Name the anti-goal first**: the plausible-but-wrong outcome ("no behavior change; the goldens
   stay byte-identical").
2. **State success as something checkable**: a golden file that does not change, a grep that finds
   each rule once, zero annotations in the visual check. Check it while implementing; a test that a
   line deleted in the same PR stays deleted is no contract.
3. **Give a decision rule, not a list**: "language by path, never by content: a wrong guess is worse
   than none" settles cases the issue did not foresee.
4. **Tier the work** (do this / judgment call / don't chase) and say why the limit exists.
5. **Name exemplars and anti-patterns by file.** "Write it well" transfers nothing.
6. **License design change, with a test for when and a limit.** The outcome sets the scope; within
   it, the simplest correct model in our idioms, even when that reshapes the code it touches. A fix
   an issue names is a starting point, not the design.
7. **Verify before asserting.** `wait $!` on a process substitution worked on macOS and in a
   container and failed on CI (#31). Run it where it will run.

---

## 4. The alignment check

Before a PR and on every push, and first thing in a review. CI checks the commands; this checks
what CI cannot. Read the diff in this order: docs, comments and tests first, since they pass CI
whatever they say, then the code. Ask:

- Did the change **lift** what it touched, or level it down to match? Were nearby patterns imitated
  because they are good, or because they were nearby?
- Are **removals** part of the deliverable, or is it all additions? Where a caller misfits an API,
  was the caller changed, or did the API gain a second entry point, a wrapper or an option for it?
- Where a dependency misbehaves (the SDK, an action, the runner), does the change make it work or
  report it, or hide it behind a workaround?
- Does each comment do a job the code cannot (§ 5), or is it prose to check against the code?
- Does each test catch a **wrong answer**, or only a changed line (§ 5)?
- Is each piece of knowledge stated in **one place**, with pointers elsewhere?
- Does every line the renderer prints still start with something it owns (spec, output rule 2)?

Name each gap once, with the rule it breaks. What the author then declines to change is a
conversation, not another round.

---

## 5. Behind the rules

**Comments** have three jobs: *what* a unit is, in one line; a *gotcha* the code cannot show; *why*
something that looks wrong is right. Delete the rest: a restated signature, a narrated change, an
argued design. Rationale belongs in the PR or the issue; an issue number is a pointer, not a
paragraph. Past three lines, a comment is usually a decision that belongs there instead. The *what*
puts a reader in the right frame before they read the code: the unit's nature or its purpose, never
the code retold, with no steps, order or formula the body already states. A removal or an absence is
explained in the PR, never in a comment.

**Tests** go where the alternative is a silent wrong answer, not a crash: a result under the wrong
call, a command made live, an error shown as success, a highlighter that changed the text. Wiring
does not qualify; whatever runs it already fails loudly. A test that reads the file under test and
asserts on a literal from it catches a *changed* line, never a wrong one, and pins that line in
place; `test/action.test.ts` used to do this with a regex on `action.yml`. The two exceptions that
look alike and are not: a cross-file invariant neither file can state alone (§ 1), and a repo-wide
lint. Tests adapt to the code: no optional field, default or seam exists only for a test.

**One home.** The spec is the contract and says what; the code says why, beside the line that
needs it; AGENTS.md points. When the same sentence appears twice, one copy is already wrong or
will be.
