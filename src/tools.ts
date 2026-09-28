import type {
  BashOutput,
  FileEditOutput,
  FileWriteOutput,
} from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import { highlight, languageOf } from "./highlight.ts";
import { gray, green, red } from "./style.ts";
import { cleanLine, cleanLines, oneLine } from "./text.ts";

// What a tool call and its result show. Tool inputs and `tool_use_result` are untyped at runtime
// (`unknown` in the SDK), so every shape is checked before use.

// A line of tool output and how it is colored. `plain` keeps the tool's own colors.
export type Tone = "plain" | "error" | "stderr" | "added" | "removed" | "hunk";
export interface OutputLine {
  text: string;
  tone: Tone;
  // The line as the fold shows it, when it is highlighted: `text` with the styles already in it.
  styled?: string;
}
export interface Output {
  lines: OutputLine[];
  // The lines shown under the call before the fold. Defaults to the first lines of `lines`.
  preview?: OutputLine[];
}

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const mainArgument: Record<string, string> = {
  Bash: "command",
  Read: "file_path",
  Edit: "file_path",
  MultiEdit: "file_path",
  Write: "file_path",
  NotebookEdit: "notebook_path",
  Glob: "pattern",
  Grep: "pattern",
  WebFetch: "url",
  WebSearch: "query",
  Agent: "description",
  Task: "description",
  Skill: "skill",
};

// The call's main argument on one line: a known tool's key argument, else its first string input.
// Paths under the run's working directory are shown relative to it.
export function callArgument(name: string, input: unknown, cwd: string): string {
  if (!isObject(input)) return "";
  const key = mainArgument[name];
  const value =
    key !== undefined && typeof input[key] === "string"
      ? input[key]
      : Object.values(input).find((v): v is string => typeof v === "string");
  if (value === undefined) return "";
  const relative = cwd !== "" && value.startsWith(`${cwd}/`) ? value.slice(cwd.length + 1) : value;
  return oneLine(relative);
}

// The text of a tool_result's `content`: a string for most tools, an array of blocks for Agent.
export function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) =>
      isObject(block) && block.type === "text" && typeof block.text === "string"
        ? block.text
        : `[${isObject(block) ? String(block.type) : typeof block}]`,
    )
    .join("\n");
}

const toLines = (text: string, tone: Tone): OutputLine[] =>
  cleanLines(text, true).map((line) => ({ text: line, tone }));

// A tool result as lines. `toolUseResult` is an object on success and a plain string on a failed
// Bash call; the `content` the model saw is the fallback for every shape not handled here.
export function resultOutput(content: unknown, isError: boolean, toolUseResult: unknown): Output {
  if (isError || !isObject(toolUseResult))
    return { lines: toLines(contentText(content), isError ? "error" : "plain") };
  const diff = diffOutput(toolUseResult);
  if (diff) return diff;
  const read = readOutput(toolUseResult);
  if (read) return read;
  if (isBashOutput(toolUseResult) && (toolUseResult.stdout !== "" || toolUseResult.stderr !== "")) {
    return {
      lines: [
        ...toLines(toolUseResult.stdout, "plain"),
        ...toLines(toolUseResult.stderr, "stderr"),
      ],
    };
  }
  return { lines: toLines(contentText(content), "plain") };
}

function isBashOutput(value: Json): value is Json & Pick<BashOutput, "stdout" | "stderr"> {
  return typeof value.stdout === "string" && typeof value.stderr === "string";
}

type Patch = FileEditOutput["structuredPatch"][number];

function isPatch(value: unknown): value is Patch {
  return (
    isObject(value) &&
    typeof value.oldStart === "number" &&
    typeof value.oldLines === "number" &&
    typeof value.newStart === "number" &&
    typeof value.newLines === "number" &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string")
  );
}

// A Read of a text file in a language this build highlights: its content, numbered from where the
// read started, as the tool numbers it for the model.
function readOutput(result: Json): Output | undefined {
  const { file } = result;
  if (result.type !== "text" || !isObject(file)) return undefined;
  const { filePath, content, startLine } = file;
  if (typeof filePath !== "string" || typeof content !== "string" || typeof startLine !== "number")
    return undefined;
  const language = languageOf(filePath);
  if (language === undefined) return undefined;
  const code = cleanLines(content);
  const styled = highlight(code, language);
  return {
    lines: code.map((text, index) => {
      const number = String(startLine + index);
      return {
        text: `${number}\t${text}`,
        tone: "plain",
        styled: `${gray(number)}\t${styled[index]}`,
      };
    }),
  };
}

// Edit and Write results: the hunks of `structuredPatch`, or a new file's content as added lines.
// The preview shows the changed lines rather than the context around them. In a language this build
// highlights, the code is highlighted and only the `+` and `-` markers take the diff's colors; the
// old and new side of each hunk are highlighted apart, since each is code on its own.
function diffOutput(result: Json): Output | undefined {
  const patches = result.structuredPatch;
  if (!Array.isArray(patches) || !patches.every(isPatch)) return undefined;
  // SPIKE (#21): whole-line red and green, unhighlighted, to compare with in the visual check.
  const language =
    typeof result.filePath === "string" && process.env.RENDER_AGENT_LOG_SPIKE_DIFF !== "lines"
      ? languageOf(result.filePath)
      : undefined;
  const lines: OutputLine[] = [];
  if (patches.length === 0) {
    const write = result as Partial<FileWriteOutput>;
    if (write.type !== "create" || typeof write.content !== "string") return undefined;
    const code = cleanLines(write.content, language === undefined);
    const styled = language === undefined ? undefined : highlight(code, language);
    code.forEach((line, index) => {
      lines.push({
        text: `+${line}`,
        tone: "added",
        ...(styled && { styled: `${green("+")}${styled[index]}` }),
      });
    });
  }
  for (const patch of patches) {
    lines.push({
      text: `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`,
      tone: "hunk",
    });
    lines.push(...hunkLines(patch.lines, language));
  }
  const changed = lines.filter((line) => line.tone === "added" || line.tone === "removed");
  return changed.length === 0 ? undefined : { lines, preview: changed };
}

const markerTone: Record<string, Tone> = { "+": "added", "-": "removed" };
const markerStyle: Record<string, (text: string) => string> = { "+": green, "-": red };

function hunkLines(patchLines: string[], language: ReturnType<typeof languageOf>): OutputLine[] {
  const lines = patchLines.map((line) => cleanLine(line, language === undefined));
  const tones = lines.map((text) => markerTone[text.charAt(0)] ?? "plain");
  if (language === undefined)
    return lines.map((text, index) => ({ text, tone: tones[index] ?? "plain" }));
  // Each side: the indexes of its lines, and those lines highlighted, without their marker.
  const side = (drop: string) => {
    const indexes = lines.flatMap((line, index) =>
      line.startsWith(drop) || line.startsWith("\\") ? [] : [index],
    );
    const styled = highlight(
      indexes.map((index) => (lines[index] ?? "").slice(1)),
      language,
    );
    return new Map(indexes.map((index, at) => [index, styled[at] ?? ""]));
  };
  const before = side("+");
  const after = side("-");
  return lines.map((text, index) => {
    const marker = text.charAt(0);
    const code = (marker === "-" ? before : after).get(index);
    const tone = tones[index] ?? "plain";
    if (code === undefined) return { text, tone };
    return { text, tone, styled: `${(markerStyle[marker] ?? ((m: string) => m))(marker)}${code}` };
  });
}
