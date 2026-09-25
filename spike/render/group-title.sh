#!/usr/bin/env bash
# ANSI inside ::group:: titles, in the layout the renderer plans: call, preview, then the full output folded.
set -euo pipefail
e=$'\e'

printf '%s[32m●%s[0m %s[1mBash%s[0m(ls -la)\n' "$e" "$e" "$e" "$e"
printf '  %s[90m⎿  total 40%s[0m\n' "$e" "$e"
printf '::group::%s[90m     … 12 lines%s[0m\n' "$e" "$e"
ls -la /usr
echo "::endgroup::"

echo "::group::${e}[32m●${e}[0m ${e}[1mRead${e}[0m(src/index.ts) ${e}[90m… 3 lines${e}[0m"
printf 'line 1\nline 2\nline 3\n'
echo "::endgroup::"

echo "::group::${e}[31m⎿  error title in red${e}[0m"
echo "body"
echo "::endgroup::"

echo "::group::${e}[1mbold${e}[0m ${e}[3mitalic${e}[0m ${e}[2mdim${e}[0m ${e}[38;5;208m256${e}[0m ${e}[38;2;215;119;87mtruecolor${e}[0m"
echo "body"
echo "::endgroup::"

echo "::group::title without a reset ${e}[35mmagenta to the end"
echo "body: does the magenta leak in here?"
echo "::endgroup::"
echo "after the group: does the magenta leak out here?"
