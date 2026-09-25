import { randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { constants } from "node:os";
import { run } from "./run.ts";

// render-agent-log [file]: renders stream-json from stdin, or an execution file, to stdout.

const [path] = process.argv.slice(2);
const input = path === undefined ? process.stdin : createReadStream(path);
input.on("error", (error: Error) => {
  process.stderr.write(`render-agent-log: ${error.message}\n`);
  process.exit(2);
});

// On a signal, stop reading and let the write in flight finish: it ends every block it opens. Dying
// on the signal instead could cut a write short inside a stopped block, which would leave every
// later workflow command in the step inert, the action's own ::error:: included.
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    process.exitCode = 128 + constants.signals[signal];
    stop.abort();
  });
}
// The reader went away (EPIPE): nothing more can reach the log, and no block can be closed.
process.stdout.on("error", () => process.exit(1));

// A fresh token per run: output from an earlier run cannot hold it. The runner masks it as ***.
await run(input, process.stdout, randomBytes(16).toString("hex"), stop.signal);
