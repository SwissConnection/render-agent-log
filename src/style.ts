// The renderer's own styling. Only the 16 named colors, bold and italic: the log gives each named
// color a shade per theme (spec, output rule 7).

const span = (on: string, off: string) => (text: string) =>
  text === "" ? "" : `\x1b[${on}m${text}\x1b[${off}m`;

export const gray = span("90", "0");
export const red = span("31", "0");
export const green = span("32", "0");
export const yellow = span("33", "0");
export const grayItalic = span("3;90", "0");
// Bold and inline code turn off only what they turned on, so they can sit inside colored text.
export const bold = span("1", "22");
export const code = span("1;36", "22;39");
