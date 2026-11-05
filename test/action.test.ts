import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, render } from "./helpers.ts";

// The input names action.yml declares, which the runner hands to the Action as INPUT_<NAME>.
function declaredInputs(): string[] {
  const actionYml = readFileSync(new URL("../action.yml", import.meta.url), "utf8");
  const block = actionYml.slice(
    actionYml.indexOf("\ninputs:\n"),
    actionYml.indexOf("\noutputs:\n"),
  );
  return [...block.matchAll(/^ {2}([a-z-]+):$/gm)].map((match) => match[1] ?? "");
}

// The code reads the input under the name action.yml declares, or the Action falls back to its live
// mode on a finished run: a green step that renders nothing. The name comes from action.yml alone.
test("renders the file named by the execution-file input that action.yml declares", async () => {
  const name = declaredInputs().find((input) => input === "execution-file");
  expect(name, "action.yml declares execution-file").toBeDefined();

  const dir = mkdtempSync(join(tmpdir(), "action-test-"));
  const file = join(dir, "execution-file.json");
  const messages = fixture("max-turns")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  writeFileSync(file, JSON.stringify(messages));
  const action = spawnSync(process.execPath, ["src/action.ts"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", [`INPUT_${String(name).toUpperCase()}`]: file },
  });
  expect(action.stdout).toBe(await render(fixture("max-turns")));
});

// The claude input reaches the wrapper through the job's environment, under a name neither file states
// alone. A mismatch runs claude-code-action's claude, where there is one, instead of the host's.
test("the wrapper runs the claude the claude input names, from any directory", () => {
  const name = declaredInputs().find((input) => input === "claude");
  expect(name, "action.yml declares claude").toBeDefined();

  const workspace = mkdtempSync(join(tmpdir(), "action-test-"));
  mkdirSync(join(workspace, "scripts"));
  writeFileSync(join(workspace, "scripts", "claude"), '#!/bin/sh\necho "host\'s claude $*"\n', {
    mode: 0o755,
  });
  const files = {
    GITHUB_ENV: join(workspace, "env"),
    GITHUB_OUTPUT: join(workspace, "output"),
    GITHUB_PATH: join(workspace, "path"),
  };
  const action = spawnSync(
    process.execPath,
    [new URL("../src/action.ts", import.meta.url).pathname],
    {
      cwd: workspace,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        ...files,
        [`INPUT_${String(name).toUpperCase()}`]: "scripts/claude",
      },
    },
  );
  expect(action.status).toBe(0);

  const jobEnv = Object.fromEntries(
    readFileSync(files.GITHUB_ENV, "utf8")
      .trim()
      .split("\n")
      .map((line) => line.split(/=(.*)/)),
  );
  const wrapper = spawnSync(
    new URL("../wrapper/claude-wrapper", import.meta.url).pathname,
    ["-v"],
    {
      cwd: tmpdir(),
      encoding: "utf8",
      env: { PATH: process.env.PATH ?? "", ...jobEnv },
    },
  );
  expect(wrapper.stdout).toBe("host's claude -v\n");
});
