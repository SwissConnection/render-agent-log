#!/usr/bin/env bash
# UX samples (not for merge): a denied call under each marker option, beside a failed and a passing call.
set -euo pipefail
e=$'\e'
gray="${e}[38;5;244m" red="${e}[31m" green="${e}[32m" by="${e}[93m" bold="${e}[1m" unbold="${e}[22m" off="${e}[0m"
call() { printf '%s●%s %s%s%s(%s)\n' "$green" "$off" "$bold" "$1" "$unbold" "$2"; }
under() { printf '%s└%s %s\n' "$gray" "$off" "$1"; }
context() {
  call Read "src/cart.js"
  under "${gray}1  export function total(items) {${off}"
  call Bash "npm test"
  under "${red}Error: Exit code 1${off}"
}
for option in text-sign emoji-sign no-entry stop bold-label badge; do
  echo "${gray}— $option —${off}"
  context
  call Bash "chmod +x scripts/release.sh"
  case $option in
    text-sign) under "${by}⚠ denied: This command requires approval${off}" ;;
    emoji-sign) under "${by}⚠️ denied: This command requires approval${off}" ;;
    no-entry) under "${by}🚫 denied: This command requires approval${off}" ;;
    stop) under "${by}⛔ denied: This command requires approval${off}" ;;
    bold-label) under "${by}${bold}DENIED${unbold}: This command requires approval${off}" ;;
    badge) under "${e}[103;30m denied ${off} ${by}This command requires approval${off}" ;;
  esac
  echo
done
