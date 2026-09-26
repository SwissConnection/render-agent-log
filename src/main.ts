import { constants } from "node:os";
import type { Readable } from "node:stream";
import { run } from "./run.ts";

// Renders `input` to this process's stdout, for both entry points (the CLI and the Action).
export async function renderToStdout(input: Readable): Promise<void> {
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
}
