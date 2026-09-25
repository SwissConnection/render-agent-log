import { createReadStream } from "node:fs";
import { renderToStdout } from "./main.ts";

// render-agent-log [file]: renders stream-json from stdin, or an execution file, to stdout.

const [path] = process.argv.slice(2);
const input = path === undefined ? process.stdin : createReadStream(path);
input.on("error", (error: Error) => {
  process.stderr.write(`render-agent-log: ${error.message}\n`);
  process.exit(2);
});

await renderToStdout(input);
