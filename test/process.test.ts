import { spawn } from "node:child_process";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { expect, test } from "vitest";

const call = {
  type: "assistant",
  parent_tool_use_id: null,
  message: {
    id: "msg_1",
    role: "assistant",
    content: [{ type: "tool_use", id: "toolu_1", name: "Bash", input: { command: "big" } }],
  },
};
const stdout = Array.from({ length: 200_000 }, (_, index) => `line ${index}`).join("\n");
const result = {
  type: "user",
  parent_tool_use_id: null,
  message: {
    role: "user",
    content: [{ type: "tool_result", tool_use_id: "toolu_1", content: stdout }],
  },
  tool_use_result: { stdout, stderr: "", interrupted: false },
};

// SIGTERM while the renderer is blocked writing a group to a reader that has paused, as when a
// runner's timeout stops the step. Dying there would fold the rest of the step's log, the action's
// own ::error:: included, into the group; the group must still end.
test("a renderer stopped mid-group still ends the group", async () => {
  const child = spawn(process.execPath, ["src/index.ts"], { stdio: ["pipe", "pipe", "inherit"] });
  child.stdin.write(`${JSON.stringify(call)}\n${JSON.stringify(result)}\n`);
  let log = "";
  let opened = false;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    log += chunk;
    if (opened) return;
    opened = log.includes("::group::");
    if (opened) child.stdout.pause();
  });
  while (!opened) await sleep(10);
  await sleep(200);
  expect(log).not.toContain("::endgroup::");

  child.kill("SIGTERM");
  child.stdout.resume();
  const [code] = await once(child, "exit");

  expect(code).toBe(143);
  expect(log.slice(log.lastIndexOf("::group::"))).toMatch(/\n::endgroup::\n$/);
}, 20_000);
