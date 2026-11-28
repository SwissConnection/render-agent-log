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
  // What has reached the step's log so far.
  logged: () => string;
  // The run's scratch directory, which also holds the raw copy when asked for (copy.jsonl).
  dir: string;
}

function script(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  return path;
}

// A claude slow to stop, in node: a shell would reap tee, which claude, its parent, never does.
const lingers =
  'process.on("SIGTERM", () => setTimeout(() => process.exit(143), 2000)); setInterval(() => {}, 60000);';

// Runs the wrapper under the stand-in SDK. `renderer` replaces the node that runs the renderer,
// `shim` puts a process between the SDK and the wrapper, `copy` asks for the raw copy, and `pause`
// has claude stop after its first line.
function runWrapper(
  stream: string,
  options: {
    renderer?: string;
    shim?: boolean;
    copy?: boolean;
    pause?: boolean;
    wait?: boolean;
  } = {},
): Run {
  const dir = mkdtempSync(join(tmpdir(), "wrapper-test-"));
  const file = join(dir, "stream.jsonl");
  writeFileSync(file, stream);
  const print = options.pause
    ? `head -n 1 "${file}"; sleep 1; tail -n +2 "${file}"`
    : options.wait
      ? `echo $PPID > "${dir}/sdk.pid"; cat "${file}"; exec "${process.execPath}" -e '${lingers}'`
      : `exec cat "${file}"`;
  const claude = script(dir, "claude", print);
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
  return { sdk, log: once(child, "exit").then(() => log), logged: () => log, dir };
}

// Stops the processes under `root` as claude-code-action does on a cancel (its stopDescendants).
async function stopUnder(root: number): Promise<void> {
  const children = new Map<number, number[]>();
  for (const name of readdirSync("/proc").filter((entry) => /^\d+$/.test(entry))) {
    try {
      const stat = readFileSync(`/proc/${name}/stat`, "utf8");
      const parent = Number(stat.slice(stat.lastIndexOf(")") + 2).split(" ")[1]);
      children.set(parent, [...(children.get(parent) ?? []), Number(name)]);
    } catch {
      // It has ended
    }
  }
  const tree = [root];
  for (const pid of tree) tree.push(...(children.get(pid) ?? []));
  for (const signal of ["SIGSTOP", "SIGTERM", "SIGCONT", "SIGKILL"] as const) {
    if (signal === "SIGKILL") await sleep(1000);
    for (const pid of tree.slice(1)) {
      try {
        process.kill(pid, signal);
      } catch {
        // It has ended
      }
    }
  }
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

  // Several runs: a renderer that exits at once raced the buffer's removal (#26), and lost it about
  // one time in five.
  test("lets the run complete when the renderer dies, and nothing else reaches the log", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wrapper-dead-"));
    const stream = largeStream();
    const renderer = script(dir, "node", "exit 1");
    for (let attempt = 0; attempt < 5; attempt++) {
      const { sdk, log } = runWrapper(stream, { renderer });
      expect(await sdk).toEqual({ stream, code: 0 });
      expect(await log, `attempt ${attempt}`).toBe("::endgroup::\n");
    }
  }, 40_000);

  test("keeps the whole raw copy when the renderer dies before the stream ends", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wrapper-dead-copy-"));
    const stream = fixture("subagent");
    const renderer = script(dir, "node", "exit 1");
    const { log, dir: run } = runWrapper(stream, { renderer, copy: true, pause: true });
    await log;
    expect(readFileSync(join(run, "copy.jsonl"), "utf8")).toBe(stream);
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

  test("keeps the whole raw copy and adds nothing to the log when the action stops the run", async () => {
    const stream = fixture("subagent");
    const rendered = await render(stream);
    const { log, logged, dir } = runWrapper(stream, { copy: true, wait: true });
    while (logged() !== rendered) await sleep(20);
    await stopUnder(Number(readFileSync(join(dir, "sdk.pid"), "utf8")));
    expect(await log).toBe(rendered);
    expect(readFileSync(join(dir, "copy.jsonl"), "utf8")).toBe(stream);
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
