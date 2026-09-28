import {
  gray,
  renderToStdout
} from "./chunk.js";

// src/action.ts
import { appendFileSync, createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
var input = (name) => process.env[`INPUT_${name.toUpperCase()}`]?.trim() ?? "";
function command(name, data) {
  return `::${name}::${data.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}
`;
}
function fileCommand(variable, line) {
  const file = process.env[variable];
  if (file === void 0 || file === "") throw new Error(`${variable} is not set`);
  if (/[\r\n]/.test(line)) throw new Error(`a line break in ${JSON.stringify(line)}`);
  appendFileSync(file, `${line}
`);
}
async function afterTheRun(path) {
  const file = createReadStream(path);
  file.on("error", (error) => {
    process.stdout.write(command("error", `render-agent-log: ${error.message}`));
    process.exit(1);
  });
  await renderToStdout(file);
}
function live() {
  fileCommand("GITHUB_ENV", `RENDER_AGENT_LOG_NODE=${process.execPath}`);
  const bin = join(root, "bin");
  fileCommand("GITHUB_PATH", bin);
  process.stdout.write(`${gray(`\xB7 render-agent-log on PATH from ${bin}`)}
`);
  const copy = input("stream-copy");
  if (copy !== "") fileCommand("GITHUB_ENV", `RENDER_AGENT_LOG_STREAM_COPY=${resolve(copy)}`);
  if (process.platform !== "linux") {
    process.stdout.write(
      command(
        "warning",
        `render-agent-log: the wrapper needs a Linux runner, so the wrapper output is empty on ${process.platform}. Render claude-code-action's execution_file after the run instead.`
      )
    );
    return;
  }
  const wrapper = join(root, "wrapper", "claude-wrapper");
  fileCommand("GITHUB_OUTPUT", `wrapper=${wrapper}`);
  process.stdout.write(`${gray(`\xB7 wrapper for claude-code-action at ${wrapper}`)}
`);
}
var executionFile = input("execution-file");
if (executionFile === "") live();
else await afterTheRun(executionFile);
