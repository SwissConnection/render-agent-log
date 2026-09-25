import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { expect, test } from "vitest";
import { render } from "../src/index.ts";

test("a message type from a newer SDK renders as one gray line", () => {
  const message = { type: "from_a_newer_sdk" } as unknown as SDKMessage;
  expect(render(message)).toEqual(["\x1b[90m· from_a_newer_sdk\x1b[0m"]);
});
