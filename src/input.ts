// Reads messages from either input: stream-json, one JSON message per line (live), or an execution
// file, one JSON array of messages (after the run). An array is parsed whole once it has been read.

export type Item = { message: object } | { unparsable: string };

export async function* readMessages(lines: AsyncIterable<string>): AsyncGenerator<Item> {
  let array: string[] | undefined;
  for await (const line of lines) {
    if (array !== undefined) {
      array.push(line);
      continue;
    }
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("[")) array = [line];
    else yield parseLine(trimmed);
  }
  if (array === undefined) return;
  let messages: unknown;
  try {
    messages = JSON.parse(array.join("\n"));
  } catch {}
  if (!Array.isArray(messages)) {
    yield { unparsable: "execution file" };
    return;
  }
  for (const message of messages) {
    yield isMessage(message) ? { message } : { unparsable: "array element" };
  }
}

function parseLine(text: string): Item {
  try {
    const value: unknown = JSON.parse(text);
    return isMessage(value) ? { message: value } : { unparsable: "line" };
  } catch {
    return { unparsable: "line" };
  }
}

const isMessage = (value: unknown): value is object =>
  typeof value === "object" && value !== null && !Array.isArray(value);
