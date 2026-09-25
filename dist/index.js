// src/index.ts
function render(message) {
  return [`\x1B[90m\xB7 ${message.type}\x1B[0m`];
}
export {
  render
};
