#!/usr/bin/env bash
# UX samples for #73 (not for merge): one tool call in each situation, under the variant named by $1.
set -euo pipefail
e=$'\e'
gray="${e}[38;5;244m" red="${e}[31m" green="${e}[32m" yellow="${e}[33m" magenta="${e}[35m" byellow="${e}[93m"
bold="${e}[1m" unbold="${e}[22m" off="${e}[0m"
case $1 in
  today) dot=$green denied=$yellow stopped=$yellow ;;
  neutral) dot="" denied=$yellow stopped=$yellow ;;
  neutral-magenta) dot="" denied=$magenta stopped=$magenta ;;
  neutral-red) dot="" denied=$red stopped=$yellow ;;
  neutral-brightyellow) dot="" denied=$byellow stopped=$byellow ;;
esac
call() { printf '%s●%s %s%s%s(%s)\n' "$dot" "$off" "$bold" "$1" "$unbold" "$2"; }
under() { printf '%s└%s %s%s%s\n' "$gray" "$off" "$1" "$2" "$off"; }
mid() { printf '%s│%s %s%s%s\n' "$gray" "$off" "$1" "$2" "$off"; }
echo "${gray}— a call still running —${off}"
call Bash "npm test"
echo "${gray}— succeeded —${off}"
call Read "src/cart.js"
mid "$gray" " 1  export function total(items) {"
under "$gray" " 2    return items.reduce((sum, item) => sum + item.price, 0);"
echo "${gray}— failed —${off}"
call Bash "npm test"
mid "$red" "✖ cart total includes tax"
under "$red" "Error: Exit code 1"
echo "${gray}— denied —${off}"
call Bash "chmod +x scripts/release.sh"
under "$denied" "denied: This command requires approval"
echo "${gray}— background: started, then ended —${off}"
call Bash "npm run build"
under "$gray" "Command running in background with ID: b1q2. Output is being written to: /tmp/…/b1q2.output"
call Bash "npm run build"
under "$red" "Background command \"Build\" failed with exit code 1"
call Bash "npm run watch"
under "$stopped" "Background command \"Watch\" was stopped"
echo "${gray}— other notes —${off}"
printf '%s· API retry 1/10 (529): overloaded%s\n' "$yellow" "$off"
mid "$yellow" "warning: stderr of a command that succeeded"
echo "${gray}— palette: the 16 named colors and gray —${off}"
for c in 31 32 33 34 35 36 91 92 93 94 95 96; do printf '%s[%sm sample text, color %s%s\n' "$e" "$c" "$c" "$off"; done
printf '%s sample text, gray 244%s\n' "$gray" "$off"
