import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { fixture, render } from "./helpers.ts";

// An input the code reads under another name than action.yml declares leaves the Action in its live
// mode: a green step that renders nothing.
test("renders the execution-file input that action.yml declares", async () => {
  const actionYml = readFileSync(new URL("../action.yml", import.meta.url), "utf8");
  expect(actionYml).toMatch(/^ {2}execution-file:$/m);

  const dir = mkdtempSync(join(tmpdir(), "action-test-"));
  const file = join(dir, "execution-file.json");
  const messages = fixture("max-turns")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  writeFileSync(file, JSON.stringify(messages));
  const action = spawnSync(process.execPath, ["src/action.ts"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", "INPUT_EXECUTION-FILE": file },
  });
  expect(action.stdout).toBe(await render(fixture("max-turns")));
});
