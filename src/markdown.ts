import { bold, code, gray } from "./style.ts";

// The Markdown subset the agent's prose gets as ANSI: bold, inline code, headings and lists. Lists
// keep their markers as written. Code blocks keep their fences, in gray, and their lines unstyled.
// Takes cleaned lines and returns styled ones.
export function markdown(lines: string[]): string[] {
  let inFence = false;
  return lines.map((line) => {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      return gray(line);
    }
    if (inFence) return line;
    const heading = /^#{1,6}\s+(.*)$/.exec(line);
    if (heading) return bold(heading[1]?.replace(/\*\*|`/g, "") ?? "");
    return inline(line);
  });
}

function inline(line: string): string {
  return line.replace(/(`+)(.+?)\1|\*\*(?=\S)(.+?)\*\*/g, (_match, _ticks, codeText, boldText) =>
    codeText !== undefined ? code(codeText) : bold(boldText),
  );
}
