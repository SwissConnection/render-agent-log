import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { describe, expect, test } from "vitest";
import { Renderer } from "../src/render.ts";
import { red } from "../src/style.ts";
import { fixture, liveCommands, render, visibleLines } from "./helpers.ts";

const fixtures = [
  "edit-and-bash",
  "hostile-output",
  "max-turns",
  "subagent",
  "subagents-background",
  "thinking",
];

describe.each(fixtures)("%s", (name) => {
  test("renders as its golden file", async () => {
    await expect(await render(fixture(name))).toMatchFileSnapshot(`golden/${name}.txt`);
  });

  test("renders the same from an execution file", async () => {
    const messages = fixture(name)
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(await render(JSON.stringify(messages, null, 2))).toBe(await render(fixture(name)));
  });
});

// The escape code that opens the renderer's error color.
const errorColor = red("·").slice(0, red("·").indexOf("·"));

// The nearest line above `index` that starts at the top level with ●.
function topLevelAbove(lines: string[], index: number): string | undefined {
  return lines.slice(0, index).findLast((line) => line.startsWith("● "));
}

describe("a result sits under its own call", () => {
  test("with parallel calls whose results arrive in reverse order", async () => {
    const lines = visibleLines(await render(fixture("edit-and-bash")));
    const fast = lines.indexOf("└ fast done");
    const slow = lines.indexOf("└ slow done");
    expect(fast).toBeLessThan(slow);
    expect(lines[fast - 1]).toBe("● Bash(sleep 1 && echo fast done)");
    expect(lines[slow - 1]).toBe("● Bash(sleep 4 && echo slow done)");
  });

  test("with a subagent, whose calls nest under the Agent call", async () => {
    const lines = visibleLines(await render(fixture("subagent")));
    const grep = lines.findIndex((line) => line.startsWith("│ ● Grep("));
    expect(topLevelAbove(lines, grep)).toBe("● Agent(List exported functions in src)");
    const handBack = lines.findIndex((line) => line.startsWith("│ [Subagent hand-back]"));
    expect(topLevelAbove(lines, handBack)).toBe("● Agent(List exported functions in src)");
  });

  test("with two background subagents whose messages interleave", async () => {
    const lines = visibleLines(await render(fixture("subagents-background")));
    const expected: [string, string][] = [
      ["│ ● Grep(^\\s*export\\s)", "List exported functions in src"],
      ["│ ● Grep(module\\.exports|exports\\.)", "List exported functions in src"],
      ["│ ● - greet — src/greet.js", "List exported functions in src"],
      ["│ ● Read(package.json)", "Report npm test script"],
      ["│ ● The npm test script in", "Report npm test script"],
    ];
    for (const [nested, agent] of expected) {
      const index = lines.findIndex((line) => line.startsWith(nested));
      expect(index, nested).toBeGreaterThan(0);
      expect(topLevelAbove(lines, index), nested).toBe(`● Agent(${agent})`);
    }
  });
});

describe("errors stay red", () => {
  test("a failed call's preview", async () => {
    const lines = (await render(fixture("edit-and-bash"))).split("\n");
    const isCall = (line: string) => visibleLines(line)[0] === "● Bash(npm test)";
    const failed = lines.findIndex(isCall);
    const passed = lines.findLastIndex(isCall);
    const preview = (start: number) => lines.slice(start + 1, start + 4);
    for (const line of preview(failed)) expect(line).toContain(errorColor);
    for (const line of preview(passed)) expect(line).not.toContain(errorColor);
  });

  test("a run that ends in an error", async () => {
    const lines = (await render(fixture("max-turns"))).split("\n");
    expect(lines).toContain(red("✻ error_max_turns · 3 turns · 3s · $0.02"));
  });
});

describe("hostile output", () => {
  test("holds commands the runner would run if printed as is", () => {
    const strings = (value: unknown): string[] =>
      typeof value === "string"
        ? [value]
        : typeof value === "object" && value !== null
          ? Object.values(value).flatMap(strings)
          : [];
    const messages = fixture("hostile-output")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(liveCommands(strings(messages).join("\n")).length).toBeGreaterThan(20);
  });

  test("renders to no live command but the renderer's own", async () => {
    const commands = liveCommands(await render(fixture("hostile-output")));
    const names = commands.map(({ name }) => name);
    expect(names.filter((name) => name !== "group" && name !== "endgroup")).toEqual([]);
    expect(names.join(" ")).toMatch(/^(group endgroup ?)+$/);
  });
});

describe("a message the build does not know", () => {
  // One visible line, not in the error color: the run did not fail.
  const expectOneLine = (message: unknown, text: string) => {
    const log = new Renderer().render(message as unknown as SDKMessage);
    expect(visibleLines(log)).toEqual([text, ""]);
    expect(log).not.toContain(errorColor);
  };

  test("prints one line for an unknown type", () => {
    expectOneLine({ type: "from_a_newer_sdk" }, "· from_a_newer_sdk");
  });

  test("prints one line for an unknown system subtype", () => {
    expectOneLine({ type: "system", subtype: "from_a_newer_sdk" }, "· system/from_a_newer_sdk");
  });

  test("prints one line for a message of a known type in a shape it does not know", () => {
    expectOneLine(
      { type: "assistant", message: null },
      "· unrenderable assistant message (TypeError)",
    );
  });
});
