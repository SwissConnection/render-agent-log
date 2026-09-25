// Untrusted text (tool output, call arguments, agent text) made safe to print (spec, output rules 2
// and 3). The runner reads step output with .NET's ReadLine, which ends a line at \r, \n or \r\n, and
// runs a line as a command when it starts with `::` after leading whitespace, or holds `##[` anywhere.

// Escape sequences, per line: OSC, DCS, SOS, PM and APC strings (to their terminator or the end of
// the line), CSI sequences, two-character escapes, and the 8-bit C1 forms of each. Then the C0
// controls except the tab, DEL, and the C1 controls, which also catches what is left of a broken
// escape. One pattern, so that the ESC of an SGR sequence kept whole is not removed as a control.
const unsafe =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  /\x1b[\]PX^_].*?(?:\x07|\x1b\\|\x9c|$)|[\x90\x98\x9d\x9e\x9f].*?(?:\x07|\x1b\\|\x9c|$)|\x1b\[[0-?]*[ -/]*[@-~]|\x9b[0-?]*[ -/]*[@-~]|\x1b[ -/]*[0-~]|[\x00-\x08\x0a-\x1f\x7f-\x9f]/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
const sgr = /^\x1b\[[0-9;:]*m$/;

export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/);
}

// One line of untrusted text with every escape sequence and control character removed, except the
// tab and, when `keepSgr` is set, SGR sequences (colors).
export function cleanLine(line: string, keepSgr = false): string {
  return line.replace(unsafe, (sequence) => (keepSgr && sgr.test(sequence) ? sequence : ""));
}

// Untrusted text as lines, cleaned, without trailing blank lines.
export function cleanLines(text: string, keepSgr = false): string[] {
  const lines = splitLines(text).map((line) => cleanLine(line, keepSgr));
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  return lines;
}

// Untrusted text on one line: line breaks become ⏎.
export function oneLine(text: string): string {
  return splitLines(text.trimEnd())
    .map((line) => cleanLine(line))
    .join("⏎");
}

// Shortens to `max` code points, ending in … when cut.
export function truncate(text: string, max: number): string {
  const points = Array.from(text);
  return points.length <= max ? text : `${points.slice(0, max - 1).join("")}…`;
}

// The runner finds `##[command]` anywhere in a line, stopped blocks aside. An SGR code that changes
// nothing here (underline off) splits every `##[` so it no longer parses, and the log still shows it.
export function defuse(line: string): string {
  return line.replaceAll("##[", "#\x1b[24m#[");
}
