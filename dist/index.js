import {
  renderToStdout
} from "./chunk.js";

// src/index.ts
import { createReadStream } from "node:fs";
var [path] = process.argv.slice(2);
var input = path === void 0 ? process.stdin : createReadStream(path);
input.on("error", (error) => {
  process.stderr.write(`render-agent-log: ${error.message}
`);
  process.exit(2);
});
await renderToStdout(input);
