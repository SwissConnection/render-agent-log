#!/usr/bin/env bash
# The renderer's glyphs, each repeated between ASCII rulers: if a glyph is one cell wide, the bars line up.
# Claude Code's ⎿ is left out: the log falls back to a wider font for it, so the renderer uses └.
set -euo pipefail

echo "|....|....|"
for g in '●' '└' '✻' '…' '⏎' '·'; do
  printf '|%s%s%s%s|%s%s%s%s|  %s\n' "$g" "$g" "$g" "$g" "$g" "$g" "$g" "$g" "$g"
done
echo "|....|....|"
echo "● Bash(npm test)"
echo "  └  PASS src/render.test.ts"
echo "     … +42 lines"
echo "✻ success · 7 turns · 94s · \$0.42"
echo "multi-line argument: echo a⏎echo b⏎echo c"
