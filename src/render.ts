import type {
  SDKActiveGoalMessage,
  SDKAssistantMessage,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
  Transport,
} from "@anthropic-ai/claude-agent-sdk";
import { markdown } from "./markdown.ts";
import { bold, gray, grayItalic, green, red, yellow } from "./style.ts";
import { cleanLine, cleanLines, defuse, oneLine, truncate } from "./text.ts";
import { callArgument, type Output, type OutputLine, resultOutput, type Tone } from "./tools.ts";

const previewLines = 3;
const previewWidth = 200;
const argumentWidth = 140;

interface Call {
  header: string;
  // The Agent calls this call runs under, outermost first: its subagent nesting.
  chain: string[];
}

// Everything claude writes to stdout in stream-json mode: the SDKMessage union, plus the control
// protocol between the SDK and claude, which the wrapper sees too. The SDK exports this union only
// as what a Transport reads.
export type StdoutMessage =
  ReturnType<Transport["readMessages"]> extends AsyncGenerator<infer Message> ? Message : never;

type SystemMessage = Extract<SDKMessage, { type: "system" }>;
type Color = (text: string) => string;

// A message type or system subtype this build does not know.
function unknownName(message: unknown): string {
  const { type, subtype } = message as { type?: unknown; subtype?: unknown };
  return subtype === undefined ? String(type) : `${String(type)}/${String(subtype)}`;
}

const previewTone: Record<Tone, Color> = {
  plain: gray,
  error: red,
  stderr: yellow,
  added: green,
  removed: red,
  hunk: gray,
};
const foldedTone: Record<Tone, Color> = {
  plain: (text) => text,
  error: (text) => text,
  stderr: yellow,
  added: green,
  removed: red,
  hunk: gray,
};

// A /goal's state: cleared, or not met yet after some iterations.
function goalNote({ value }: SDKActiveGoalMessage): string {
  if (value === null) return "· goal cleared";
  const reason = value.last_reason === undefined ? "" : ` · ${value.last_reason}`;
  return `· goal: ${value.condition} · ${value.iterations} iterations${reason}`;
}

// Turns SDK messages into log lines, one message at a time. It keeps the calls it has seen, so a
// result can be put under its own call, and a subagent's messages under the Agent call.
export class Renderer {
  readonly #calls = new Map<string, Call>();
  // The calls the last printed line sits under. A line for another call first repeats its header.
  #context: string[] = [];
  #cwd = "";
  #out: string[] = [];

  // The log text for one message: whole lines and whole groups, or "" for one that prints nothing.
  // A message that makes the renderer throw prints one gray line in place of what it had rendered.
  render(message: StdoutMessage): string {
    this.#out = [];
    try {
      this.#message(message);
    } catch (error) {
      this.#out = [];
      this.#context = [];
      const name = error instanceof Error ? error.name : typeof error;
      this.#note(gray, `· unrenderable ${String(message.type)} message (${name})`);
    }
    return this.#out.map((line) => `${defuse(line)}\n`).join("");
  }

  #message(message: StdoutMessage): void {
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
        if (note !== undefined) this.#note(...note);
        break;
      }
      case "auth_status":
      case "conversation_reset":
        this.#note(gray, `· ${message.type}`);
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
        this.#note(gray, `· ${unknownName(message satisfies never)}`);
    }
  }

  // The one line a system message prints, or undefined for one that prints nothing.
  #systemNote(message: SystemMessage): [Color, string] | undefined {
    switch (message.subtype) {
      case "init":
        this.#cwd = message.cwd;
        return [gray, `✻ ${message.model} · ${message.cwd}`];
      case "api_retry": {
        const status = message.error_status === null ? "" : ` (${message.error_status})`;
        return [
          yellow,
          `· API retry ${message.attempt}/${message.max_retries}${status}: ${message.error}`,
        ];
      }
      case "compact_boundary": {
        const { trigger, pre_tokens } = message.compact_metadata;
        return [gray, `✻ compacted (${trigger}) · ${pre_tokens} tokens before`];
      }
      case "informational":
        return [message.level === "warning" ? yellow : gray, `· ${message.content}`];
      case "notification":
        return [gray, `· ${message.text}`];
      case "local_command_output":
        return [gray, `· ${message.content}`];
      case "model_refusal_fallback":
        return [yellow, `· ${message.content}`];
      case "model_refusal_no_fallback":
        return [red, `· ${message.content}`];
      case "hook_response":
        return [
          message.outcome === "error" ? red : gray,
          `· hook ${message.hook_name}: ${message.outcome}`,
        ];
      case "elicitation_complete":
      case "memory_recall":
      case "mirror_error":
      case "permission_denied":
      case "worker_shutting_down":
        return [gray, `· system/${message.subtype}`];
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
        return undefined;
      default:
        return [gray, `· ${unknownName(message satisfies never)}`];
    }
  }

  #assistant(message: SDKAssistantMessage): void {
    const chain = this.#chainOf(message.parent_tool_use_id);
    for (const block of message.message.content) {
      switch (block.type) {
        case "text": {
          const marker = message.error === undefined ? "●" : red("●");
          this.#prose(chain, marker, markdown(cleanLines(block.text)));
          break;
        }
        // Thinking without text (only a signature, the default) prints nothing.
        case "thinking":
          this.#prose(chain, gray("✻"), cleanLines(block.thinking).map(grayItalic));
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
          this.#line(chain.length, gray(`· ${block.type}`));
      }
    }
  }

  #user(message: SDKUserMessage | SDKUserMessageReplay): void {
    const chain = this.#chainOf(message.parent_tool_use_id);
    const content = message.message.content;
    if (typeof content === "string") {
      this.#userText(chain, content);
      return;
    }
    // tool_use_result belongs to the message, so it can only be told apart with one result in it.
    const results = content.filter((block) => block.type === "tool_result").length;
    for (const block of content) {
      switch (block.type) {
        case "tool_result":
          this.#toolResult(
            block.tool_use_id,
            resultOutput(
              block.content,
              block.is_error === true,
              results === 1 ? message.tool_use_result : undefined,
            ),
            chain,
          );
          break;
        case "text":
          this.#userText(chain, block.text);
          break;
        default:
          this.#enter(chain);
          this.#line(chain.length, gray(`› [${block.type}]`));
      }
    }
  }

  #summary(message: SDKResultMessage): void {
    const seconds = Math.round(message.duration_ms / 1000);
    const turns = `${message.num_turns} turn${message.num_turns === 1 ? "" : "s"}`;
    // total_cost_usd is the session's total so far, while turns and duration restart per result.
    const cost = `$${message.total_cost_usd.toFixed(2)}`;
    const failed = message.is_error || message.subtype !== "success";
    this.#enter([]);
    this.#line(
      0,
      (failed ? red : green)(`✻ ${message.subtype} · ${turns} · ${seconds}s · ${cost}`),
    );
    const errors =
      message.subtype === "success" ? (message.is_error ? [message.result] : []) : message.errors;
    const lines = errors.flatMap((error) =>
      cleanLines(error).map((text) => ({ text, tone: "error" as const })),
    );
    if (lines.length > 0) this.#output(0, { lines });
  }

  // The chain a message's content sits under, from its parent_tool_use_id.
  #chainOf(parent: string | null): string[] {
    if (!parent) return [];
    const call = this.#calls.get(parent) ?? this.#unknownCall(parent, []);
    return [...call.chain, parent];
  }

  #unknownCall(id: string, chain: string[]): Call {
    const call = { header: gray(`· unknown call ${truncate(oneLine(id), argumentWidth)}`), chain };
    this.#calls.set(id, call);
    return call;
  }

  #call(id: string, name: string, input: unknown, chain: string[]): void {
    const argument = truncate(callArgument(name, input, this.#cwd), argumentWidth);
    const header = `${green("●")} ${bold(oneLine(name))}${argument === "" ? "" : `(${argument})`}`;
    this.#calls.set(id, { header, chain });
    this.#enter(chain);
    this.#line(chain.length, header);
    this.#context = [...chain, id];
  }

  #toolResult(id: string, output: Output, messageChain: string[]): void {
    const call = this.#calls.get(id) ?? this.#unknownCall(id, messageChain);
    this.#enter([...call.chain, id]);
    this.#output(call.chain.length, output);
    // The call is done: anything printed for it later (a background Agent's subagent) repeats it.
    this.#context = call.chain;
  }

  // Makes `chain` the context, repeating the header of each call in it the log is not under.
  #enter(chain: string[]): void {
    let same = 0;
    while (same < chain.length && chain[same] === this.#context[same]) same++;
    for (let depth = same; depth < chain.length; depth++) {
      const id = chain[depth] as string;
      this.#line(depth, this.#calls.get(id)?.header ?? this.#unknownCall(id, []).header);
    }
    this.#context = chain;
  }

  // Tool output: its first three lines that are not blank under the call, then the whole output
  // folded into a group when the preview does not show all of it.
  #output(depth: number, output: Output): void {
    const { lines } = output;
    const nonBlank = (output.preview ?? lines).filter(({ text }) => cleanLine(text).trim() !== "");
    if (nonBlank.length === 0) {
      this.#line(depth, gray("└"), gray("(no output)"));
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
      this.#line(depth, gray(index === preview.length - 1 ? "└" : "│"), text);
    });
    const hidden =
      lines.filter(({ text }) => cleanLine(text).trim() !== "").length > preview.length;
    if (hidden || cut) this.#fold(depth, lines);
  }

  #fold(depth: number, lines: OutputLine[]): void {
    const count = `… ${lines.length} line${lines.length === 1 ? "" : "s"}`;
    this.#out.push(`::group::${this.#gutter(depth)}${gray(count)}`);
    for (const { text, tone } of lines) this.#line(depth, gray("│"), foldedTone[tone](text));
    this.#out.push("::endgroup::");
  }

  // The agent's text or thinking: `marker` on the first line, │ on the ones after.
  #prose(chain: string[], marker: string, lines: string[]): void {
    const start = lines.findIndex((line) => line.trim() !== "");
    if (start === -1) return;
    this.#enter(chain);
    lines.slice(start).forEach((line, index) => {
      this.#line(chain.length, index === 0 ? marker : gray("│"), line);
    });
  }

  // A user turn: the prompt of a subagent, or a message injected into the run.
  #userText(chain: string[], text: string): void {
    const lines = cleanLines(text);
    if (lines.length === 0) return;
    this.#enter(chain);
    const shown = lines.slice(0, previewLines);
    shown.forEach((line, index) => {
      this.#line(chain.length, gray(index === 0 ? "›" : "│"), gray(truncate(line, previewWidth)));
    });
    if (
      lines.length > shown.length ||
      shown.some((line) => Array.from(line).length > previewWidth)
    ) {
      this.#fold(
        chain.length,
        lines.map((line) => ({ text: line, tone: "plain" })),
      );
    }
  }

  // A line of the renderer's own, colored whole. Parts of `text` may be untrusted, so all of it goes
  // through oneLine.
  #note(color: Color, text: string): void {
    this.#enter([]);
    this.#line(0, color(truncate(oneLine(text), previewWidth)));
  }

  #gutter(depth: number): string {
    return depth > 0 ? gray("│ ".repeat(depth)) : "";
  }

  // `marker` is the line's first visible character: never whitespace, never untrusted.
  #line(depth: number, marker: string, content = ""): void {
    this.#out.push(`${this.#gutter(depth)}${marker}${content === "" ? "" : ` ${content}`}`);
  }
}
