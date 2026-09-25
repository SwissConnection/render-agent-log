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

// SIGTERM while the renderer is blocked writing a stopped block to a reader that has paused, as
// when a runner's timeout stops the step. Dying there would leave the rest of the step's commands
// inert; the block must still end.
test("a renderer stopped mid-block still ends the block", async () => {
  const child = spawn(process.execPath, ["src/index.ts"], { stdio: ["pipe", "pipe", "inherit"] });
  child.stdin.write(`${JSON.stringify(call)}\n${JSON.stringify(result)}\n`);
  let log = "";
  let stopToken: string | undefined;
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    log += chunk;
    if (stopToken !== undefined) return;
    stopToken = /^::stop-commands::(\w+)$/m.exec(log)?.[1];
    if (stopToken !== undefined) child.stdout.pause();
  });
  while (stopToken === undefined) await sleep(10);
  await sleep(200);
  expect(log).not.toContain(`::${stopToken}::`);

  child.kill("SIGTERM");
  child.stdout.resume();
  const [code] = await once(child, "exit");

  expect(code).toBe(143);
  const tail = log.slice(log.lastIndexOf(`::stop-commands::${stopToken}`));
  expect(tail).toMatch(new RegExp(`\\n::${stopToken}::\\n::endgroup::\\n$`));
}, 20_000);
