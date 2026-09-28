import hljs from "highlight.js";

// Syntax highlighting for file content in folded output: the language comes from the file's path,
// never from its content, and each token class gets one of the named colors (spec, output rule 8).
// Every language highlight.js has is registered; a file's extension finds its language among their
// names and aliases.

// Extensions that are no alias of the language they are usually in.
const byExtension: Record<string, string> = {
  cfg: "ini",
  cljc: "clojure",
  cljs: "clojure",
  csx: "csharp",
  hrl: "erlang",
  htm: "xml",
  psm1: "powershell",
  rake: "ruby",
};
// Aliases that are extensions of more than one language, where a guess would often be wrong:
// Objective-C and MATLAB (highlight.js has `m` as Mercury), Coq and Verilog, Apex, VBA and LaTeX
// classes (`cos`), ASCII-armored keys (`angelscript`), LassoScript and LiveScript.
const ambiguous = new Set(["m", "v", "cls", "asc", "ls"]);
// Files known by their whole name.
const byName: Record<string, string> = {
  ".bash_profile": "bash",
  ".bashrc": "bash",
  ".profile": "bash",
  ".zshrc": "bash",
  "CMakeLists.txt": "cmake",
  Dockerfile: "dockerfile",
  Gemfile: "ruby",
  GNUmakefile: "makefile",
  Jenkinsfile: "groovy",
  Makefile: "makefile",
  Rakefile: "ruby",
};

// The language of a file, from its name, or undefined for one this build does not highlight.
export function languageOf(path: string): string | undefined {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const known = byName[name];
  if (known !== undefined) return known;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return undefined;
  const extension = name.slice(dot + 1).toLowerCase();
  if (ambiguous.has(extension)) return undefined;
  return byExtension[extension] ?? (hljs.getLanguage(extension) ? extension : undefined);
}

interface Style {
  color?: string;
  bold?: boolean;
  italic?: boolean;
}

const gray = "38;5;244";
// Token classes (highlight.js scopes) and their styles. A scope not listed takes its parent's style;
// the most specific entry wins, so `title.function.invoke` falls back to `title`.
const styles: Record<string, Style> = {
  comment: { color: gray, italic: true },
  quote: { color: gray, italic: true },
  doctag: { color: gray, italic: true, bold: true },
  keyword: { color: "35" },
  "selector-tag": { color: "35" },
  "template-tag": { color: "35" },
  "template-variable": { color: "35" },
  name: { color: "35" },
  bullet: { color: "35" },
  literal: { color: "34" },
  number: { color: "34" },
  symbol: { color: "34" },
  "variable.constant": { color: "34" },
  "variable.language": { color: "34" },
  variable: { color: "34" },
  attr: { color: "34" },
  attribute: { color: "34" },
  property: { color: "34" },
  meta: { color: "34" },
  "selector-attr": { color: "34" },
  "selector-pseudo": { color: "34" },
  link: { color: "34" },
  string: { color: "36" },
  regexp: { color: "36" },
  code: { color: "36" },
  "meta.string": { color: "36" },
  subst: { color: "39" },
  title: { color: "33" },
  type: { color: "33" },
  built_in: { color: "33" },
  "selector-class": { color: "33" },
  "selector-id": { color: "33" },
  section: { bold: true },
  strong: { bold: true },
  emphasis: { italic: true },
  addition: { color: "32" },
  deletion: { color: "31" },
};

function styleOf(scope: string, parent: Style): Style {
  const parts = scope.split(".");
  for (let length = parts.length; length > 0; length--) {
    const style = styles[parts.slice(0, length).join(".")];
    if (style !== undefined) return { ...parent, ...style };
  }
  return parent;
}

// `hljs-title class_ inherited__` is the scope `title.class.inherited`.
function scopeOf(classes: string): string {
  return classes
    .split(" ")
    .map((part) => part.replace(/^hljs-/, "").replace(/_+$/, ""))
    .join(".");
}

// The SGR parameters that turn a style on, and the ones that turn it off again.
const on = ({ color, bold, italic }: Style) =>
  [bold ? "1" : "", italic ? "3" : "", color ?? ""].filter((code) => code !== "").join(";");
const off = ({ color, bold, italic }: Style) =>
  [bold ? "22" : "", italic ? "23" : "", color ? "39" : ""].filter((code) => code !== "").join(";");

const entities: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#x27;": "'",
};

// Cleaned lines of one file, highlighted as a whole so a token may span lines (a block comment, a
// template string), and returned as as many lines, each ending with its styles off.
export function highlight(lines: string[], language: string): string[] {
  const html = hljs.highlight(lines.join("\n"), { language, ignoreIllegals: true }).value;
  const out: string[] = [];
  const stack: Style[] = [{}];
  let line = "";
  // The style the line has on so far.
  let shown: Style = {};
  const setStyle = (style: Style) => {
    if (on(style) === on(shown)) return;
    const codes = [off(shown), on(style)].filter((code) => code !== "").join(";");
    line += `\x1b[${codes}m`;
    shown = style;
  };
  const endLine = () => {
    setStyle({});
    out.push(line);
    line = "";
  };
  for (const [, open, close, chunk] of html.matchAll(
    /<span class="([^"]*)">|(<\/span>)|([^<]+)/g,
  )) {
    if (open !== undefined) stack.push(styleOf(scopeOf(open), stack.at(-1) ?? {}));
    else if (close !== undefined) stack.pop();
    else if (chunk !== undefined) {
      const decoded = chunk.replace(
        /&(?:amp|lt|gt|quot|#x27);/g,
        (entity) => entities[entity] ?? "",
      );
      decoded.split("\n").forEach((part, index) => {
        if (index > 0) endLine();
        if (part === "") return;
        setStyle(stack.at(-1) ?? {});
        line += part;
      });
    }
  }
  endLine();
  return out;
}
