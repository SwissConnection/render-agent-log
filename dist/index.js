// src/index.ts
import { createReadStream } from "node:fs";

// src/main.ts
import { constants } from "node:os";

// src/run.ts
import { once } from "node:events";
import { createInterface } from "node:readline";

// src/input.ts
async function* readMessages(lines) {
  let array;
  for await (const line of lines) {
    if (array !== void 0) {
      array.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("[")) array = [line];
    else yield parseLine(trimmed);
  }
  if (array === void 0) return;
  let messages;
  try {
    messages = JSON.parse(array.join("\n"));
  } catch {
  }
  if (!Array.isArray(messages)) {
    yield { unparsable: "execution file" };
    return;
  }
  for (const message of messages) {
    yield isMessage(message) ? { message } : { unparsable: "array element" };
  }
}
function parseLine(text) {
  try {
    const value = JSON.parse(text);
    return isMessage(value) ? { message: value } : { unparsable: "line" };
  } catch {
    return { unparsable: "line" };
  }
}
var isMessage = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

// src/style.ts
var span = (on, off) => (text) => text === "" ? "" : `\x1B[${on}m${text}\x1B[${off}m`;
var gray = span("38;5;244", "0");
var red = span("31", "0");
var green = span("32", "0");
var yellow = span("33", "0");
var grayItalic = span("3;38;5;244", "0");
var bold = span("1", "22");
var code = span("1;36", "22;39");

// src/markdown.ts
function markdown(lines) {
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
function inline(line) {
  return line.replace(
    /(`+)(.+?)\1|\*\*(?=\S)(.+?)\*\*/g,
    (_match, _ticks, codeText, boldText) => codeText !== void 0 ? code(codeText) : bold(boldText)
  );
}

// src/text.ts
var unsafe = (
  // biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point
  /\x1b[\]PX^_].*?(?:\x07|\x1b\\|\x9c|$)|[\x90\x98\x9d\x9e\x9f].*?(?:\x07|\x1b\\|\x9c|$)|\x1b\[[0-?]*[ -/]*[@-~]|\x9b[0-?]*[ -/]*[@-~]|\x1b[ -/]*[0-~]|[\x00-\x08\x0a-\x1f\x7f-\x9f]/g
);
var sgr = /^\x1b\[[0-9;:]*m$/;
function splitLines(text) {
  return text.split(/\r\n|\r|\n/);
}
function cleanLine(line, keepSgr = false) {
  return line.replace(unsafe, (sequence) => keepSgr && sgr.test(sequence) ? sequence : "");
}
function cleanLines(text, keepSgr = false) {
  const lines = splitLines(text).map((line) => cleanLine(line, keepSgr));
  while (lines.length > 0 && lines.at(-1)?.trim() === "") lines.pop();
  return lines;
}
function oneLine(text) {
  return splitLines(text.trimEnd()).map((line) => cleanLine(line)).join("\u23CE");
}
function truncate(text, max) {
  const points = Array.from(text);
  return points.length <= max ? text : `${points.slice(0, max - 1).join("")}\u2026`;
}
function defuse(line) {
  return line.replaceAll("##[", "#\x1B[24m#[");
}

// src/tools.ts
var isObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var mainArgument = {
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
  Skill: "skill"
};
function callArgument(name, input2, cwd) {
  if (!isObject(input2)) return "";
  const key = mainArgument[name];
  const value = key !== void 0 && typeof input2[key] === "string" ? input2[key] : Object.values(input2).find((v) => typeof v === "string");
  if (value === void 0) return "";
  const relative = cwd !== "" && value.startsWith(`${cwd}/`) ? value.slice(cwd.length + 1) : value;
  return oneLine(relative);
}
function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(
    (block) => isObject(block) && block.type === "text" && typeof block.text === "string" ? block.text : `[${isObject(block) ? String(block.type) : typeof block}]`
  ).join("\n");
}
var toLines = (text, tone) => cleanLines(text, true).map((line) => ({ text: line, tone }));
function resultOutput(content, isError, toolUseResult) {
  if (isError || !isObject(toolUseResult))
    return { lines: toLines(contentText(content), isError ? "error" : "plain") };
  const diff = diffOutput(toolUseResult);
  if (diff) return diff;
  if (isBashOutput(toolUseResult) && (toolUseResult.stdout !== "" || toolUseResult.stderr !== "")) {
    return {
      lines: [
        ...toLines(toolUseResult.stdout, "plain"),
        ...toLines(toolUseResult.stderr, "stderr")
      ]
    };
  }
  return { lines: toLines(contentText(content), "plain") };
}
function isBashOutput(value) {
  return typeof value.stdout === "string" && typeof value.stderr === "string";
}
function isPatch(value) {
  return isObject(value) && typeof value.oldStart === "number" && typeof value.oldLines === "number" && typeof value.newStart === "number" && typeof value.newLines === "number" && Array.isArray(value.lines) && value.lines.every((line) => typeof line === "string");
}
function diffOutput(result) {
  const patches = result.structuredPatch;
  if (!Array.isArray(patches) || !patches.every(isPatch)) return void 0;
  const lines = [];
  if (patches.length === 0) {
    const write = result;
    if (write.type !== "create" || typeof write.content !== "string") return void 0;
    for (const line of cleanLines(write.content, true))
      lines.push({ text: `+${line}`, tone: "added" });
  }
  for (const patch of patches) {
    lines.push({
      text: `@@ -${patch.oldStart},${patch.oldLines} +${patch.newStart},${patch.newLines} @@`,
      tone: "hunk"
    });
    for (const line of patch.lines) {
      const text = cleanLine(line, true);
      const tone = text.startsWith("+") ? "added" : text.startsWith("-") ? "removed" : "plain";
      lines.push({ text, tone });
    }
  }
  const changed = lines.filter((line) => line.tone === "added" || line.tone === "removed");
  return changed.length === 0 ? void 0 : { lines, preview: changed };
}

// src/render.ts
var previewLines = 3;
var previewWidth = 200;
var argumentWidth = 140;
function unknownName(message) {
  const { type, subtype } = message;
  return subtype === void 0 ? String(type) : `${String(type)}/${String(subtype)}`;
}
var previewTone = {
  plain: gray,
  error: red,
  stderr: yellow,
  added: green,
  removed: red,
  hunk: gray
};
var foldedTone = {
  plain: (text) => text,
  error: (text) => text,
  stderr: yellow,
  added: green,
  removed: red,
  hunk: gray
};
function goalNote({ value }) {
  if (value === null) return "\xB7 goal cleared";
  const reason = value.last_reason === void 0 ? "" : ` \xB7 ${value.last_reason}`;
  return `\xB7 goal: ${value.condition} \xB7 ${value.iterations} iterations${reason}`;
}
var Renderer = class {
  #calls = /* @__PURE__ */ new Map();
  // The calls the last printed line sits under. A line for another call first repeats its header.
  #context = [];
  #cwd = "";
  #out = [];
  // The log text for one message: whole lines and whole groups, or "" for one that prints nothing.
  // A message that makes the renderer throw prints one gray line in place of what it had rendered.
  render(message) {
    this.#out = [];
    try {
      this.#message(message);
    } catch (error) {
      this.#out = [];
      this.#context = [];
      const name = error instanceof Error ? error.name : typeof error;
      this.#note(gray, `\xB7 unrenderable ${String(message.type)} message (${name})`);
    }
    return this.#out.map((line) => `${defuse(line)}
`).join("");
  }
  #message(message) {
    switch (message.type) {
      case "assistant":
        this.#assistant(message);
        break;
      case "user":
        this.#user(message);
        break;
      case "result":
        this.#summary(message);
        break;
      case "system": {
        const note = this.#systemNote(message);
        if (note !== void 0) this.#note(...note);
        break;
      }
      case "auth_status":
      case "conversation_reset":
        this.#note(gray, `\xB7 ${message.type}`);
        break;
      case "active_goal":
        this.#note(gray, goalNote(message));
        break;
      // The control protocol: requests, answers and heartbeats between the SDK and claude.
      case "control_request":
      case "control_response":
      case "control_cancel_request":
      case "keep_alive":
        break;
      // Progress and UI state, not transcript.
      case "stream_event":
      case "tool_progress":
      case "rate_limit_event":
      case "tool_use_summary":
      case "prompt_suggestion":
        break;
      default:
        this.#note(gray, `\xB7 ${unknownName(message)}`);
    }
  }
  // The one line a system message prints, or undefined for one that prints nothing.
  #systemNote(message) {
    switch (message.subtype) {
      case "init":
        this.#cwd = message.cwd;
        return [gray, `\u273B ${message.model} \xB7 ${message.cwd}`];
      case "api_retry": {
        const status = message.error_status === null ? "" : ` (${message.error_status})`;
        return [
          yellow,
          `\xB7 API retry ${message.attempt}/${message.max_retries}${status}: ${message.error}`
        ];
      }
      case "compact_boundary": {
        const { trigger, pre_tokens } = message.compact_metadata;
        return [gray, `\u273B compacted (${trigger}) \xB7 ${pre_tokens} tokens before`];
      }
      case "informational":
        return [message.level === "warning" ? yellow : gray, `\xB7 ${message.content}`];
      case "notification":
        return [gray, `\xB7 ${message.text}`];
      case "local_command_output":
        return [gray, `\xB7 ${message.content}`];
      case "model_refusal_fallback":
        return [yellow, `\xB7 ${message.content}`];
      case "model_refusal_no_fallback":
        return [red, `\xB7 ${message.content}`];
      case "hook_response":
        return [
          message.outcome === "error" ? red : gray,
          `\xB7 hook ${message.hook_name}: ${message.outcome}`
        ];
      case "elicitation_complete":
      case "memory_recall":
      case "mirror_error":
      case "permission_denied":
      case "worker_shutting_down":
        return [gray, `\xB7 system/${message.subtype}`];
      // Progress and UI state, not transcript.
      case "status":
      case "control_request_progress":
      case "hook_started":
      case "hook_progress":
      case "plugin_install":
      case "task_started":
      case "task_progress":
      case "task_updated":
      case "task_notification":
      case "background_tasks_changed":
      case "thinking_tokens":
      case "session_state_changed":
      case "commands_changed":
      case "files_persisted":
        return void 0;
      default:
        return [gray, `\xB7 ${unknownName(message)}`];
    }
  }
  #assistant(message) {
    const chain = this.#chainOf(message.parent_tool_use_id);
    for (const block of message.message.content) {
      switch (block.type) {
        case "text": {
          const marker = message.error === void 0 ? "\u25CF" : red("\u25CF");
          this.#prose(chain, marker, markdown(cleanLines(block.text)));
          break;
        }
        // Thinking without text (only a signature, the default) prints nothing.
        case "thinking":
          this.#prose(chain, gray("\u273B"), cleanLines(block.thinking).map(grayItalic));
          break;
        case "redacted_thinking":
          break;
        case "tool_use":
        case "server_tool_use":
        case "mcp_tool_use":
          this.#call(block.id, block.name, block.input, chain);
          break;
        default:
          this.#enter(chain);
          this.#line(chain.length, gray(`\xB7 ${block.type}`));
      }
    }
  }
  #user(message) {
    const chain = this.#chainOf(message.parent_tool_use_id);
    const content = message.message.content;
    if (typeof content === "string") {
      this.#userText(chain, content);
      return;
    }
    const results = content.filter((block) => block.type === "tool_result").length;
    for (const block of content) {
      switch (block.type) {
        case "tool_result":
          this.#toolResult(
            block.tool_use_id,
            resultOutput(
              block.content,
              block.is_error === true,
              results === 1 ? message.tool_use_result : void 0
            ),
            chain
          );
          break;
        case "text":
          this.#userText(chain, block.text);
          break;
        default:
          this.#enter(chain);
          this.#line(chain.length, gray(`\u203A [${block.type}]`));
      }
    }
  }
  #summary(message) {
    const seconds = Math.round(message.duration_ms / 1e3);
    const turns = `${message.num_turns} turn${message.num_turns === 1 ? "" : "s"}`;
    const cost = `$${message.total_cost_usd.toFixed(2)}`;
    const failed = message.is_error || message.subtype !== "success";
    this.#enter([]);
    this.#line(
      0,
      (failed ? red : green)(`\u273B ${message.subtype} \xB7 ${turns} \xB7 ${seconds}s \xB7 ${cost}`)
    );
    const errors = message.subtype === "success" ? message.is_error ? [message.result] : [] : message.errors;
    const lines = errors.flatMap(
      (error) => cleanLines(error).map((text) => ({ text, tone: "error" }))
    );
    if (lines.length > 0) this.#output(0, { lines });
  }
  // The chain a message's content sits under, from its parent_tool_use_id.
  #chainOf(parent) {
    if (!parent) return [];
    const call = this.#calls.get(parent) ?? this.#unknownCall(parent, []);
    return [...call.chain, parent];
  }
  #unknownCall(id, chain) {
    const call = { header: gray(`\xB7 unknown call ${truncate(oneLine(id), argumentWidth)}`), chain };
    this.#calls.set(id, call);
    return call;
  }
  #call(id, name, input2, chain) {
    const argument = truncate(callArgument(name, input2, this.#cwd), argumentWidth);
    const header = `${green("\u25CF")} ${bold(oneLine(name))}${argument === "" ? "" : `(${argument})`}`;
    this.#calls.set(id, { header, chain });
    this.#enter(chain);
    this.#line(chain.length, header);
    this.#context = [...chain, id];
  }
  #toolResult(id, output, messageChain) {
    const call = this.#calls.get(id) ?? this.#unknownCall(id, messageChain);
    this.#enter([...call.chain, id]);
    this.#output(call.chain.length, output);
    this.#context = call.chain;
  }
  // Makes `chain` the context, repeating the header of each call in it the log is not under.
  #enter(chain) {
    let same = 0;
    while (same < chain.length && chain[same] === this.#context[same]) same++;
    for (let depth = same; depth < chain.length; depth++) {
      const id = chain[depth];
      this.#line(depth, this.#calls.get(id)?.header ?? this.#unknownCall(id, []).header);
    }
    this.#context = chain;
  }
  // Tool output: its first three lines that are not blank under the call, then the whole output
  // folded into a group when the preview does not show all of it.
  #output(depth, output) {
    const { lines } = output;
    const nonBlank = (output.preview ?? lines).filter(({ text }) => cleanLine(text).trim() !== "");
    if (nonBlank.length === 0) {
      this.#line(depth, gray("\u2514"), gray("(no output)"));
      return;
    }
    let cut = false;
    const preview = nonBlank.slice(0, previewLines).map(({ text, tone }) => {
      const plain = cleanLine(text);
      const shown = truncate(plain, previewWidth);
      cut ||= shown !== plain;
      return previewTone[tone](shown);
    });
    preview.forEach((text, index) => {
      this.#line(depth, gray(index === preview.length - 1 ? "\u2514" : "\u2502"), text);
    });
    const hidden = lines.filter(({ text }) => cleanLine(text).trim() !== "").length > preview.length;
    if (hidden || cut) this.#fold(depth, lines);
  }
  #fold(depth, lines) {
    const count = `\u2026 ${lines.length} line${lines.length === 1 ? "" : "s"}`;
    this.#out.push(`::group::${this.#gutter(depth)}${gray(count)}`);
    for (const { text, tone } of lines) this.#line(depth, gray("\u2502"), foldedTone[tone](text));
    this.#out.push("::endgroup::");
  }
  // The agent's text or thinking: `marker` on the first line, │ on the ones after.
  #prose(chain, marker, lines) {
    const start = lines.findIndex((line) => line.trim() !== "");
    if (start === -1) return;
    this.#enter(chain);
    lines.slice(start).forEach((line, index) => {
      this.#line(chain.length, index === 0 ? marker : gray("\u2502"), line);
    });
  }
  // A user turn: the prompt of a subagent, or a message injected into the run.
  #userText(chain, text) {
    const lines = cleanLines(text);
    if (lines.length === 0) return;
    this.#enter(chain);
    const shown = lines.slice(0, previewLines);
    shown.forEach((line, index) => {
      this.#line(chain.length, gray(index === 0 ? "\u203A" : "\u2502"), gray(truncate(line, previewWidth)));
    });
    if (lines.length > shown.length || shown.some((line) => Array.from(line).length > previewWidth)) {
      this.#fold(
        chain.length,
        lines.map((line) => ({ text: line, tone: "plain" }))
      );
    }
  }
  // A line of the renderer's own, colored whole. Parts of `text` may be untrusted, so all of it goes
  // through oneLine.
  #note(color, text) {
    this.#enter([]);
    this.#line(0, color(truncate(oneLine(text), previewWidth)));
  }
  #gutter(depth) {
    return depth > 0 ? gray("\u2502 ".repeat(depth)) : "";
  }
  // `marker` is the line's first visible character: never whitespace, never untrusted.
  #line(depth, marker, content = "") {
    this.#out.push(`${this.#gutter(depth)}${marker}${content === "" ? "" : ` ${content}`}`);
  }
};

// src/run.ts
async function run(input2, output, signal) {
  const renderer = new Renderer();
  const lines = createInterface({ input: input2, crlfDelay: Number.POSITIVE_INFINITY, signal });
  for await (const item of readMessages(lines)) {
    if (signal?.aborted) break;
    const text = "message" in item ? renderer.render(item.message) : `${gray(`\xB7 unparsable ${item.unparsable}`)}
`;
    if (text !== "" && !output.write(text)) await once(output, "drain");
  }
}

// src/main.ts
async function renderToStdout(input2) {
  const stop = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      process.exitCode = 128 + constants.signals[signal];
      stop.abort();
    });
  }
  process.stdout.on("error", () => process.exit(1));
  await run(input2, process.stdout, stop.signal);
}

// src/index.ts
var [path] = process.argv.slice(2);
var input = path === void 0 ? process.stdin : createReadStream(path);
input.on("error", (error) => {
  process.stderr.write(`render-agent-log: ${error.message}
`);
  process.exit(2);
});
await renderToStdout(input);
