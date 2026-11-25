#!/usr/bin/env bash
# The messages a rendered log shows as unknown or unrenderable (src/render.ts), as `name` ×count, comma
# separated; nothing when there are none. Usage: unknown-messages.sh <rendered log>
set -euo pipefail
sed 's/\x1b\[[0-9;]*m//g' "$1" |
  grep -oE '· [^ ]+ \(unknown (message type|subtype)\)|· unrenderable [^ ]+ message \([^)]*\)' |
  sed -E 's/^· //; s/ \(unknown (message type|subtype)\)$//' | sort | uniq -c |
  awk '{ n = $1; $1 = ""; printf "%s`%s` ×%d", (NR > 1 ? ", " : ""), substr($0, 2), n }' || true
