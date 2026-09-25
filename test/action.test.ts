import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, constants, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { describe, expect, test } from "vitest";
import { fixture, render } from "./helpers.ts";

// The Action as the runner runs it: inputs in INPUT_* variables, file commands in GITHUB_* files.

function runAction(inputs: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "action-test-"));
  const files = { GITHUB_ENV: "env", GITHUB_OUTPUT: "output", GITHUB_PATH: "path" };
  for (const name of Object.values(files)) writeFileSync(join(dir, name), "");
  const env: Record<string, string> = {};
  for (const [variable, name] of Object.entries(files)) env[variable] = join(dir, name);
  for (const [name, value] of Object.entries(inputs)) env[`INPUT_${name.toUpperCase()}`] = value;
  const result = spawnSync(process.execPath, ["src/action.ts"], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", ...env },
  });
  // Each file holds one NAME=value (or one directory) per line.
  const read = (name: string) => readFileSync(join(dir, name), "utf8").split("\n").filter(Boolean);
  const pairs = (name: string) =>
    Object.fromEntries(
      read(name).map((line) => [line.split("=")[0], line.slice(line.indexOf("=") + 1)]),
    );
  return {
    status: result.status,
    stdout: result.stdout,
    env: pairs("env"),
    outputs: pairs("output"),
    path: read("path"),
  };
}

describe("after the run", () => {
  test("renders the execution file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "action-test-"));
    const file = join(dir, "execution-file.json");
    const messages = fixture("max-turns")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    writeFileSync(file, JSON.stringify(messages));
    const action = runAction({ "execution-file": file });
    expect(action.status).toBe(0);
    expect(action.stdout).toBe(await render(fixture("max-turns")));
    expect(action.path).toEqual([]);
  });

  test("fails with an annotation when the file is missing", () => {
    const action = runAction({ "execution-file": "/nonexistent/execution-file.json" });
    expect(action.status).toBe(1);
    expect(action.stdout).toMatch(/^::error::render-agent-log: ENOENT.*\n$/);
  });
});

describe("live", () => {
  test("puts render-agent-log on PATH for the later steps", async () => {
    const action = runAction({});
    expect(action.status).toBe(0);
    const later = { PATH: [...action.path, process.env.PATH].join(delimiter), ...action.env };
    const log = execFileSync("render-agent-log", {
      input: fixture("edit-and-bash"),
      encoding: "utf8",
      env: later,
    });
    expect(log).toBe(await render(fixture("edit-and-bash")));
  });

  test.runIf(process.platform === "linux")("names the wrapper as an output", () => {
    const { outputs } = runAction({});
    expect(outputs.wrapper).toMatch(/\/wrapper\/claude-wrapper$/);
    accessSync(outputs.wrapper ?? "", constants.X_OK);
  });

  test.skipIf(process.platform === "linux")("warns that the wrapper needs Linux", () => {
    const action = runAction({});
    expect(action.outputs).toEqual({});
    expect(action.stdout).toMatch(
      /^::warning::render-agent-log: the wrapper needs a Linux runner/m,
    );
  });
});
