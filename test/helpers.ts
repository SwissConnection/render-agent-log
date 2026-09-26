import { readFileSync } from "node:fs";
import { Readable, Writable } from "node:stream";
import { run } from "../src/run.ts";

export const fixture = (name: string): string =>
  readFileSync(new URL(`../fixtures/claude/${name}.jsonl`, import.meta.url), "utf8");

export async function render(input: string): Promise<string> {
  let log = "";
  const output = new Writable({
    write(chunk, _encoding, done) {
      log += chunk;
      done();
    },
  });
  await run(Readable.from([input]), output);
  return log;
}

// The log's lines as a reader sees them with every group closed: colors removed, folded output
// left out.
export function visibleLines(log: string): string[] {
  const lines: string[] = [];
  let folded = false;
  for (const line of log.split("\n")) {
    if (line.startsWith("::group::")) folded = true;
    else if (line === "::endgroup::") folded = false;
    // biome-ignore lint/suspicious/noControlCharactersInRegex: removes the renderer's colors
    else if (!folded) lines.push(line.replace(/\x1b\[[0-9;:]*m/g, ""));
  }
  return lines;
}

export interface Command {
  name: string;
  data: string;
}

// The workflow commands the runner would run for `log`, by its rules (actions/runner,
// ActionCommandManager.TryProcessCommand). Any command name counts, registered or not.
export function liveCommands(log: string): Command[] {
  const commands: Command[] = [];
  let stopToken: string | undefined;
  for (const line of log.split(/\r\n|\r|\n/)) {
    const command = parseCommand(line);
    if (command === undefined) continue;
    if (stopToken !== undefined) {
      if (command.name.toLowerCase() === stopToken.toLowerCase()) stopToken = undefined;
      continue;
    }
    commands.push(command);
    if (command.name === "stop-commands") stopToken = command.data;
  }
  return commands;
}

function parseCommand(line: string): Command | undefined {
  // .NET's TrimStart, which also trims U+0085.
  const trimmed = line.replace(/^[\s\u0085]+/, "");
  if (trimmed.startsWith("::")) {
    const end = trimmed.indexOf("::", 2);
    if (end >= 0)
      return { name: trimmed.slice(2, end).split(" ")[0] ?? "", data: trimmed.slice(end + 2) };
  }
  const start = line.indexOf("##[");
  const end = start >= 0 ? line.indexOf("]", start) : -1;
  if (end >= 0)
    return { name: line.slice(start + 3, end).split(" ")[0] ?? "", data: line.slice(end + 1) };
  return undefined;
}
