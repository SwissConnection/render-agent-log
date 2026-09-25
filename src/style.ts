// The renderer's own styling: the 16 named colors, bold and italic, because the log gives each named
// color a shade per theme (spec, output rule 7). Gray is the exception.

const span = (on: string, off: string) => (text: string) =>
  text === "" ? "" : `\x1b[${on}m${text}\x1b[${off}m`;

// No named color is gray in both themes: bright black (90) is nearly the text color on the light
// theme, and white (37) is the text color on the dark one. A fixed mid-gray reads on both.
export const gray = span("38;5;244", "0");
export const red = span("31", "0");
export const green = span("32", "0");
export const yellow = span("33", "0");
export const grayItalic = span("3;38;5;244", "0");
// Bold and inline code turn off only what they turned on, so they can sit inside colored text.
export const bold = span("1", "22");
export const code = span("1;36", "22;39");
