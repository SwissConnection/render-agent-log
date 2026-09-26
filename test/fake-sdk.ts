import { spawn } from "node:child_process";
import { renameSync, writeFileSync } from "node:fs";

// Stands in for the Agent SDK in the wrapper tests: node test/fake-sdk.ts <claude> <out>. Spawns
// <claude> the way the SDK does, reads all of its stdout, and writes that and the exit code to <out>
// as JSON. Its own stdout plays the step's log.

const [claude = "", out = ""] = process.argv.slice(2);
const child = spawn(claude, ["--output-format", "stream-json", "--verbose"], {
  stdio: ["pipe", "pipe", "inherit"],
});
child.stdin.end();
const chunks: Buffer[] = [];
child.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
child.on("close", (code) => {
  // Whole or not at all: the test polls for <out>.
  writeFileSync(
    `${out}.part`,
    JSON.stringify({ code, stream: Buffer.concat(chunks).toString("utf8") }),
  );
  renameSync(`${out}.part`, out);
});
