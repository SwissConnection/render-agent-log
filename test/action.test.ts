import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
