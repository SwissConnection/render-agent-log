#!/usr/bin/env bash
# The diff of the Agent SDK's sdk.d.ts and sdk-tools.d.ts between two versions, from their packages on
# npm. Usage: type-diff.sh <old version> <new version> > types.diff
set -euo pipefail
old=$1 new=$2
work=$(mktemp -d)
for version in "$old" "$new"; do
  mkdir -p "$work/$version"
  (cd "$work/$version" && npm pack --silent "@anthropic-ai/claude-agent-sdk@$version" >/dev/null && tar -xzf ./*.tgz)
  # The package's files end their lines in CRLF
  for file in sdk.d.ts sdk-tools.d.ts; do
    tr -d '\r' <"$work/$version/package/$file" >"$work/$version/$file"
  done
done
for file in sdk.d.ts sdk-tools.d.ts; do
  diff -u --label "$old/$file" --label "$new/$file" "$work/$old/$file" "$work/$new/$file" || true
done
