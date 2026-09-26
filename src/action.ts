import { appendFileSync, createReadStream } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { renderToStdout } from "./main.ts";
import { gray } from "./style.ts";

// The Action (action.yml). With `execution-file`, it renders a finished run. Without it, it sets up
// the live modes for the job's later steps: `render-agent-log` on PATH, and the wrapper for
// claude-code-action as the `wrapper` output.

// The Action's own directory, pinned by the `uses:` ref: dist/action.js, or src/action.ts in tests.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const input = (name: string): string => process.env[`INPUT_${name.toUpperCase()}`]?.trim() ?? "";

// A workflow command, with its data escaped the way the runner unescapes it.
function command(name: string, data: string): string {
  return `::${name}::${data.replaceAll("%", "%25").replaceAll("\r", "%0D").replaceAll("\n", "%0A")}\n`;
}

// Appends `line` to the file a runner file command names (GITHUB_ENV, GITHUB_OUTPUT, GITHUB_PATH).
function fileCommand(variable: string, line: string): void {
  const file = process.env[variable];
  if (file === undefined || file === "") throw new Error(`${variable} is not set`);
  if (/[\r\n]/.test(line)) throw new Error(`a line break in ${JSON.stringify(line)}`);
  appendFileSync(file, `${line}\n`);
}

async function afterTheRun(path: string): Promise<void> {
  const file = createReadStream(path);
  file.on("error", (error: Error) => {
    process.stdout.write(command("error", `render-agent-log: ${error.message}`));
    process.exit(1);
  });
  await renderToStdout(file);
}

function live(): void {
  // The renderer runs on the node that runs this Action, since a runner need not have one of its own.
  fileCommand("GITHUB_ENV", `RENDER_AGENT_LOG_NODE=${process.execPath}`);
  const bin = join(root, "bin");
  fileCommand("GITHUB_PATH", bin);
  process.stdout.write(`${gray(`· render-agent-log on PATH from ${bin}`)}\n`);

  const copy = input("stream-copy");
  if (copy !== "") fileCommand("GITHUB_ENV", `RENDER_AGENT_LOG_STREAM_COPY=${resolve(copy)}`);

  // The wrapper reaches the step's log through /proc. Elsewhere the output stays empty, so
  // claude-code-action runs its own claude, unrendered.
  if (process.platform !== "linux") {
    process.stdout.write(
      command(
        "warning",
        `render-agent-log: the wrapper needs a Linux runner, so the wrapper output is empty on ${process.platform}. Render claude-code-action's execution_file after the run instead.`,
      ),
    );
    return;
  }
  const wrapper = join(root, "wrapper", "claude-wrapper");
  fileCommand("GITHUB_OUTPUT", `wrapper=${wrapper}`);
  process.stdout.write(`${gray(`· wrapper for claude-code-action at ${wrapper}`)}\n`);
}

const executionFile = input("execution-file");
if (executionFile === "") live();
else await afterTheRun(executionFile);
