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

// On a signal, stop reading and let the write in flight finish: it ends every group it opens. Dying
// on the signal instead could cut a write short inside a group, which would fold the rest of the
// step's log into it, the action's own ::error:: included.
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(signal, () => {
    process.exitCode = 128 + constants.signals[signal];
    stop.abort();
  });
}
// The reader went away (EPIPE): nothing more can reach the log, and no group can be closed.
process.stdout.on("error", () => process.exit(1));

await run(input, process.stdout, stop.signal);
