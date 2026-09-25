import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";

// Renders one SDK message as log lines. Until each message type gets its rendering, every message
// takes the fallback for a type the build does not know: one gray line.
export function render(message: SDKMessage): string[] {
  return [`\x1b[90m· ${message.type}\x1b[0m`];
}
