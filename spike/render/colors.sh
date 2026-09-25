#!/usr/bin/env bash
# SGR matrix: which colors and attributes the log keeps, and how each reads on light and dark themes.
set -euo pipefail
e=$'\e'
names=(black red green yellow blue magenta cyan white)

echo "== 16 foreground colors: normal (30-37), bright (90-97), bold, dim, bold+bright =="
for i in 0 1 2 3 4 5 6 7; do
  printf '%-8s %s[%dm normal %s[0m  %s[%dm bright %s[0m  %s[1;%dm bold %s[0m  %s[2;%dm dim %s[0m  %s[1;%dm bold+bright %s[0m\n' \
    "${names[$i]}" "$e" $((30 + i)) "$e" "$e" $((90 + i)) "$e" "$e" $((30 + i)) "$e" "$e" $((30 + i)) "$e" "$e" $((90 + i)) "$e"
done

echo "== 16 background colors =="
for i in 0 1 2 3 4 5 6 7; do
  printf '%-8s %s[%dm normal %s[0m  %s[%dm bright %s[0m\n' "${names[$i]}" "$e" $((40 + i)) "$e" "$e" $((100 + i)) "$e"
done

echo "== Attributes =="
printf '%s[1mbold (1)%s[0m  %s[2mdim (2)%s[0m  %s[3mitalic (3)%s[0m  %s[4munderline (4)%s[0m  %s[7minverse (7)%s[0m  %s[9mstrike (9)%s[0m\n' \
  "$e" "$e" "$e" "$e" "$e" "$e" "$e" "$e" "$e" "$e" "$e" "$e"
printf '%s[2;3mdim italic (thinking)%s[0m  %s[1;3mbold italic%s[0m  %s[90;3mgray italic%s[0m\n' "$e" "$e" "$e" "$e" "$e" "$e"
printf 'reset by code: %s[1mbold%s[22m back to normal, %s[3mitalic%s[23m back, %s[31mred%s[39m default fg\n' \
  "$e" "$e" "$e" "$e" "$e" "$e"
printf 'no reset at end of line: %s[31mred without a reset\n' "$e"
echo "next line: plain (does the red leak?)"

echo "== 256 colors and truecolor (tool output such as test runners emits these) =="
printf '%s[38;5;208m256-color 208 (orange)%s[0m  %s[38;5;244m256-color 244 (gray)%s[0m\n' "$e" "$e" "$e" "$e"
printf '%s[38;2;215;119;87mtruecolor 215,119,87%s[0m  %s[48;2;30;30;30;38;2;220;220;220m truecolor bg %s[0m\n' "$e" "$e" "$e" "$e"

# Only named colors, so each theme picks its own shade. Never black (30), white (37, 97), dim (2),
# backgrounds, or 256-color and truecolor: dim renders as normal, and the others vanish on one theme.
echo "== The renderer's palette =="
printf '%s[90m✻ claude-sonnet-5 · /home/runner/work/repo/repo%s[0m\n' "$e" "$e"
printf '%s[32m●%s[0m %s[1mBash%s[0m(npm test)\n' "$e" "$e" "$e" "$e"
printf '  %s[90m└  PASS src/render.test.ts (12 tests)%s[0m\n' "$e" "$e"
printf '%s[32m●%s[0m %s[1mRead%s[0m(src/missing.ts)\n' "$e" "$e" "$e" "$e"
printf '  %s[31m└  ENOENT: no such file or directory%s[0m\n' "$e" "$e"
printf '%s[90;3mThinking about which file to open next%s[0m\n' "$e" "$e"
printf '● %s[1mA heading%s[0m\n' "$e" "$e"
printf '  Prose with %s[1mbold%s[0m and %s[36minline code%s[0m\n' "$e" "$e" "$e" "$e"
printf '  - a list item with %s[36m`code`%s[0m\n' "$e" "$e"
printf '%s[32m●%s[0m %s[1mEdit%s[0m(src/render.ts)\n' "$e" "$e" "$e" "$e"
printf '  %s[31m- removed line%s[0m\n' "$e" "$e"
printf '  %s[32m+ added line%s[0m\n' "$e" "$e"
printf '  %s[90m@@ -12,3 +12,3 @@%s[0m\n' "$e" "$e"
printf '    %s[32m●%s[0m %s[1mGrep%s[0m(pattern) %s[90m(subagent, indented)%s[0m\n' "$e" "$e" "$e" "$e" "$e" "$e"
printf '%s[90m· some_future_message_type%s[0m\n' "$e" "$e"
printf '%s[32m✻ success · 7 turns · 94s · $0.42%s[0m\n' "$e" "$e"
printf '%s[31m✻ error_max_turns · 30 turns · 610s · $3.10%s[0m\n' "$e" "$e"
