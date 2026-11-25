import { execFileSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";

// A draft PR runs its own workflows, so a change the check lets through could reach the secrets unread.

const publish = new URL("../.github/scripts/prepared-pr/publish.sh", import.meta.url).pathname;

// Whether `publish.sh check` refuses the change `edit` makes to a small repository.
function refused(edit: (repo: string) => void): boolean {
  const dir = mkdtempSync(join(tmpdir(), "prepared-pr-"));
  const repo = join(dir, "repo");
  const git = (...args: string[]) =>
    execFileSync("git", ["-c", "user.name=t", "-c", "user.email=t@t", ...args], { cwd: repo });
  mkdirSync(join(repo, ".github", "workflows"), { recursive: true });
  mkdirSync(join(repo, "src"));
  writeFileSync(join(repo, "src", "a.ts"), "a\n");
  writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "on: pull_request\n");
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "base");
  edit(repo);
  git("add", "-A");
  const followup = join(dir, "followup");
  mkdirSync(followup);
  writeFileSync(join(followup, "change.patch"), git("diff", "--cached", "--binary", "HEAD"));
  writeFileSync(join(followup, "pr.md"), "Title\n\nWhat changes.\n");
  git("reset", "-q", "--hard");
  git("clean", "-fdq");
  const output = join(dir, "output");
  writeFileSync(output, "");
  execFileSync("bash", [publish, "check", followup], {
    cwd: repo,
    env: { ...process.env, RUNNER_TEMP: dir, GITHUB_OUTPUT: output },
  });
  return readFileSync(output, "utf8").includes("refused=true");
}

describe("the check before a prepared PR opens", () => {
  test("passes a change to text", () => {
    expect(refused((repo) => writeFileSync(join(repo, "src", "a.ts"), "b\n"))).toBe(false);
  });

  test("refuses a change to a workflow", () => {
    expect(
      refused((repo) => writeFileSync(join(repo, ".github", "workflows", "ci.yml"), "on: push\n")),
    ).toBe(true);
  });

  test("refuses a binary, a symlink and a mode", () => {
    expect(
      refused((repo) => writeFileSync(join(repo, "src", "b.bin"), Buffer.from([0, 1, 2]))),
    ).toBe(true);
    expect(refused((repo) => symlinkSync("a.ts", join(repo, "src", "link.ts")))).toBe(true);
    expect(refused((repo) => chmodSync(join(repo, "src", "a.ts"), 0o755))).toBe(true);
  });
});
