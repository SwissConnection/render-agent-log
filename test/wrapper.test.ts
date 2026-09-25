import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { describe, expect, test } from "vitest";
import { fixture, render } from "./helpers.ts";

// The wrapper between a stand-in SDK and a stand-in claude that prints a stream. The SDK's stdout is
// a pipe, as the step's log is on a runner. The wrapper reaches it through /proc, so Linux only.

const wrapper = new URL("../wrapper/claude-wrapper", import.meta.url).pathname;
const fakeSdk = new URL("./fake-sdk.ts", import.meta.url).pathname;

interface Run {
  // What the SDK read from claude's stdout, and claude's exit code.
  sdk: Promise<{ stream: string; code: number }>;
  // Everything written to the step's log, once every writer has let go of it.
  log: Promise<string>;
  // The run's scratch directory, which also holds the raw copy when asked for (copy.jsonl).
  dir: string;
}

function script(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
}

// Runs the wrapper under the stand-in SDK. `renderer` replaces the node that runs the renderer,
// `shim` puts a process between the SDK and the wrapper, and `copy` asks for the raw copy.
function runWrapper(
  stream: string,
  options: { renderer?: string; shim?: boolean; copy?: boolean } = {},
): Run {
  const dir = mkdtempSync(join(tmpdir(), "wrapper-test-"));
  writeFileSync(join(dir, "stream.jsonl"), stream);
  const claude = script(dir, "claude", `exec cat "${join(dir, "stream.jsonl")}"`);
  const target = options.shim ? script(dir, "shim", `"${wrapper}" "$@"`) : wrapper;
  const out = join(dir, "sdk.json");
  const child = spawn("bash", ["-c", 'node "$0" "$1" "$2" | cat', fakeSdk, target, out], {
    stdio: ["ignore", "pipe", "inherit"],
    env: {
      ...process.env,
      RENDER_AGENT_LOG_CLAUDE: claude,
      RENDER_AGENT_LOG_NODE: options.renderer ?? process.execPath,
      ...(options.copy ? { RENDER_AGENT_LOG_STREAM_COPY: join(dir, "copy.jsonl") } : {}),
      RUNNER_TEMP: dir,
    },
  });
  let log = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    log += chunk;
  });
  const sdk = (async () => {
    while (!existsSync(out)) await sleep(20);
    return JSON.parse(readFileSync(out, "utf8"));
  })();
  return { sdk, log: once(child, "exit").then(() => log), dir };
}

// A stream far larger than a pipe holds: one tool result of 200,000 lines.
function largeStream(): string {
  const stdout = Array.from({ length: 200_000 }, (_, index) => `line ${index}`).join("\n");
  const call = {
    type: "assistant",
    parent_tool_use_id: null,
    message: {
      id: "msg_1",
      role: "assistant",
      content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "big" } }],
    },
  };
  const result = {
    type: "user",
    parent_tool_use_id: null,
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: "toolu_1", content: stdout }],
    },
    tool_use_result: { stdout, stderr: "", interrupted: false },
  };
  return `${JSON.stringify(call)}\n${JSON.stringify(result)}\n`;
}

describe.skipIf(process.platform !== "linux")("the wrapper", () => {
  test("passes the stream to the SDK untouched and renders all of it into the log", async () => {
    const stream = fixture("edit-and-bash");
    const { sdk, log } = runWrapper(stream);
    expect(await sdk).toEqual({ stream, code: 0 });
    expect(await log).toBe(await render(stream));
  }, 20_000);

  test("keeps a raw copy of the whole stream when asked, and no other file", async () => {
    const stream = fixture("subagent");
    const { log, dir } = runWrapper(stream, { copy: true });
    await log;
    expect(readFileSync(join(dir, "copy.jsonl"), "utf8")).toBe(stream);
    expect(readdirSync(dir).sort()).toEqual(["claude", "copy.jsonl", "sdk.json", "stream.jsonl"]);
  }, 20_000);

  test("lets the run complete when the renderer dies", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wrapper-dead-"));
    const stream = largeStream();
    const { sdk, log } = runWrapper(stream, { renderer: script(dir, "node", "exit 1") });
    expect(await sdk).toEqual({ stream, code: 0 });
    expect(await log).toBe("::endgroup::\n");
  }, 20_000);

  test("lets the run complete when the renderer hangs", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wrapper-hung-"));
    const pid = join(dir, "pid");
    const stream = largeStream();
    const renderer = script(dir, "node", `echo $$ > "${pid}"; exec sleep 60`);
    const { sdk, log } = runWrapper(stream, { renderer });
    expect(await sdk).toEqual({ stream, code: 0 });
    process.kill(Number(readFileSync(pid, "utf8")), "SIGKILL");
    await log;
  }, 20_000);

  test("closes the group a renderer leaves open when it dies inside one", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wrapper-mid-group-"));
    const renderer = script(
      dir,
      "node",
      `"${process.execPath}" "$@" | awk '{ print } /^::group::/ { exit 1 }'`,
    );
    const { log } = runWrapper(largeStream(), { renderer });
    const text = await log;
    expect(text).toContain("::group::");
    expect(text.slice(text.lastIndexOf("::group::"))).toMatch(/\n::endgroup::\n$/);
  }, 20_000);

  test("warns and renders nothing when its parent's stdout is not the log", async () => {
    const stream = fixture("edit-and-bash");
    const { sdk, log } = runWrapper(stream, { shim: true });
    expect(await sdk).toEqual({ stream, code: 0 });
    expect((await log).split("\n")).toEqual([
      expect.stringMatching(
        /^::warning::render-agent-log: the wrapper's parent \(pid \d+\) writes to socket:/,
      ),
      "",
    ]);
  }, 20_000);
});
