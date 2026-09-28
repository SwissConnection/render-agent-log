import hljs from "highlight.js";
import { describe, expect, test } from "vitest";
import { highlight } from "../src/highlight.ts";
import { fixture } from "./helpers.ts";

// Every file a fixture's Read or Write saw, plus text that trips a highlighter: HTML entities (the
// highlighter's output is HTML), tokens that span lines, and blank and whitespace-only lines.
const files: string[] = ["highlighting", "edit-and-bash", "hostile-output"].flatMap((name) =>
  fixture(name)
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line).tool_use_result)
    .flatMap((result) => [result?.file?.content, result?.content])
    .filter((content): content is string => typeof content === "string"),
);
files.push(
  [
    "/* a <b> & 'c' \"d\" &amp; &lt;",
    "   still a comment */ x = `one ${two",
    "}` + '&#x27;' // <!-- -->",
    "",
    "   ",
    '"""open',
    'close""" <tag attr="v">&nbsp;</tag>',
  ].join("\n"),
);

const languages = hljs.listLanguages();

// biome-ignore lint/suspicious/noControlCharactersInRegex: the escape codes are what is checked
const sgrCodes = /\x1b\[([0-9;]*)m/g;
// The named colors but black, default foreground, bold and italic on and off, and the gray (spec,
// output rule 7).
const allowed = new Set(["1", "3", "22", "23", "31", "32", "33", "34", "35", "36", "39"]);

describe.each(languages)("%s", (language) => {
  test("changes the colors of a file, never its text", () => {
    for (const file of files) {
      const lines = file.split("\n");
      const styled = highlight(lines, language);
      expect(styled.map((line) => line.replace(sgrCodes, ""))).toEqual(lines);
    }
  });

  test("uses only the named colors, and ends every line with its styles off", () => {
    for (const file of files) {
      for (const line of highlight(file.split("\n"), language)) {
        const on = new Set<string>();
        for (const [, parameters = ""] of line.matchAll(sgrCodes)) {
          const codes = parameters.replace("38;5;244", "gray").split(";");
          for (const code of codes) {
            expect(code === "gray" || allowed.has(code), `code ${code}`).toBe(true);
            if (code === "22") on.delete("1");
            else if (code === "23") on.delete("3");
            else if (code === "39") on.delete("color");
            else on.add(/^3[1-6]$|^gray$/.test(code) ? "color" : code);
          }
        }
        expect([...on], line).toEqual([]);
      }
    }
  });
});
