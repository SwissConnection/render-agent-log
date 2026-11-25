#!/usr/bin/env bash
# The dependency note's table of what moved between two commits: package.json's packages, the actions
# the workflows pin, their runners and Node, and a count of the rest of the lock.
# Usage: what-moved.sh <base> <head>
set -euo pipefail
base=$1 head=$2

packages() {
  git show "$1:package.json" | jq -r '(.dependencies // {} | to_entries[] | "\(.key)\truntime\t\(.value)"),
    (.devDependencies // {} | to_entries[] | "\(.key)\tdev\t\(.value)")' | sort
}
# Each pinned action once, by the version its comment names
actions() {
  git grep -h -oE 'uses: [A-Za-z0-9_.-]+/[A-Za-z0-9_./-]+@[0-9a-f]{40} # v[0-9.]+' "$1" -- .github/workflows |
    sed -E 's/^uses: ([^@]+)@[0-9a-f]+ # (.*)$/\1\taction\t\2/' | sort -u
}
runners() {
  git grep -h -oE 'runs-on: ubuntu-[0-9.]+' "$1" -- .github/workflows | sed -E 's/^runs-on: (.*)$/\1\trunner\t\1/' |
    sed -E 's/^ubuntu-[0-9.]+\t/ubuntu\t/' | sort -u
}
nodes() {
  git grep -h -oE 'node-version: [0-9.]+' "$1" -- .github/workflows | sed -E 's/^node-version: (.*)$/node\tnode\t\1/' | sort -u
}
lock() {
  git show "$1:package-lock.json" | jq -r '.packages | to_entries[] | select(.key != "") | "\(.key)\t\(.value.version)"' | sort
}

rows=$(join -t $'\t' -j1 <(for f in packages actions runners nodes; do "$f" "$base"; done | awk -F '\t' '{ print $1 "/" $2 "\t" $3 }' | sort) \
  <(for f in packages actions runners nodes; do "$f" "$head"; done | awk -F '\t' '{ print $1 "/" $2 "\t" $3 }' | sort) |
  awk -F '\t' '$2 != $3')
# The lock's other packages that moved: not the ones above, which are there too
listed=$(awk -F '\t' '$1 ~ /\/(runtime|dev)$/ { sub(/\/(runtime|dev)$/, "", $1); print "node_modules/" $1 }' <<<"$rows")
rest=$(comm -13 <(lock "$base") <(lock "$head") | cut -f1 | grep -vxF -f <(echo "${listed:-none}") | grep -c . || true)

if [[ -z $rows ]]; then
  echo "Nothing in \`package.json\` or the workflows moved."
else
  echo "| What | Kind | From | To |"
  echo "|---|---|---|---|"
  awk -F '\t' '{ n = split($1, part, "/"); kind = part[n]; name = substr($1, 1, length($1) - length(kind) - 1)
    printf "| `%s` | %s | %s | %s |\n", name, kind, $2, $3 }' <<<"$rows"
fi
if ((rest > 0)); then
  echo
  echo "$rest more packages in \`package-lock.json\` moved with them."
fi
