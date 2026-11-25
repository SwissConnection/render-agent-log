#!/usr/bin/env bash
# The Linux claude that the Agent SDK pinned at a commit ships, so an agent never runs the one under review.
# Prints its path. Usage: install-claude.sh <commit>
set -euo pipefail
version=$(git show "$1:package.json" | jq -r '.devDependencies["@anthropic-ai/claude-agent-sdk"]')
dir=${RUNNER_TEMP:?}/claude-$version
if [[ ! -x $dir/package/claude ]]; then
  mkdir -p "$dir"
  (cd "$dir" && npm pack --silent "@anthropic-ai/claude-agent-sdk-linux-x64@$version" >/dev/null && tar -xzf ./*.tgz)
fi
echo "$dir/package/claude"
