#!/usr/bin/env bash
# UX samples (not for merge): the denial line under each wording, and warnings with the same sign.
set -euo pipefail
e=$'\e'
gray="${e}[38;5;244m" green="${e}[32m" by="${e}[93m" bold="${e}[1m" unbold="${e}[22m" off="${e}[0m"
call() { printf '%s●%s %sBash%s(chmod +x scripts/release.sh)\n' "$green" "$off" "$bold" "$unbold"; }
for text in "⚠️ Denied:" "⚠️ DENIED:" "⚠️ ${bold}DENIED${unbold}:"; do
  call
  printf '%s└%s %s%s This command requires approval%s\n\n' "$gray" "$off" "$by" "$text" "$off"
done
echo "${gray}— warnings with the same sign —${off}"
for line in "API retry 1/10 (529): overloaded" "Context is 90% full" "session writes lost (ENOSPC): transcript"; do
  printf '%s· ⚠️ %s%s\n' "$by" "$line" "$off"
done
