#!/usr/bin/env bash
# The note's line for the wrapper's live checks. Usage: wrapper-line.sh <the wrapper job's result> <run url>
set -euo pipefail
action=$(grep -oE 'claude-code-action@[0-9a-f]+ # v[0-9.]+' .github/workflows/wrapper.yml | sed 's/.*# //')
if [[ $1 == success ]]; then
  echo "✅ **The wrapper** in claude-code-action $action: every case as expected · [run]($2)"
else
  echo "❌ **The wrapper** in claude-code-action $action: $1 · [run]($2)"
fi
