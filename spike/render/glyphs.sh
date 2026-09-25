#!/usr/bin/env bash
# The renderer's glyphs, each repeated between ASCII rulers: if a glyph is one cell wide, the bars line up.
# First run: ⎿ was clearly wider and ∴ slightly, so the box-drawing and arrow candidates below replace them.
set -euo pipefail

echo "|....|....|"
for g in '●' '⎿' '✻' '…' '⏎' '∴' '·' '└' '╰' '↳' '⌙' '›'; do
  printf '|%s%s%s%s|%s%s%s%s|  %s\n' "$g" "$g" "$g" "$g" "$g" "$g" "$g" "$g" "$g"
done
echo "|....|....|"
echo "● Bash(npm test)"
echo "  ⎿  PASS src/render.test.ts"
echo "  └  PASS src/render.test.ts"
echo "  ╰  PASS src/render.test.ts"
echo "     … +42 lines (ctrl+o to expand)"
echo "✻ success · 7 turns · 94s · \$0.42"
echo "multi-line argument: echo a⏎echo b⏎echo c"
