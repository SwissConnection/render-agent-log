import { once } from "node:events";
import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { readMessages } from "./input.ts";
import { Renderer } from "./render.ts";
import { gray } from "./style.ts";

// Renders `input` to `output` as it arrives, one write per message, so the log keeps pace with the
// agent and a write never ends inside a stopped block. Stops reading when `signal` aborts.
export async function run(
  input: Readable,
  output: Writable,
  token: string,
  signal?: AbortSignal,
): Promise<void> {
  const renderer = new Renderer(token);
  const lines = createInterface({ input, crlfDelay: Number.POSITIVE_INFINITY, signal });
  for await (const item of readMessages(lines)) {
    if (signal?.aborted) break;
    const text =
      "message" in item
        ? renderer.render(item.message as SDKMessage)
        : `${gray(`· unparsable ${item.unparsable}`)}\n`;
    if (text !== "" && !output.write(text)) await once(output, "drain");
  }
}
