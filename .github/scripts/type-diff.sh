#!/usr/bin/env bash
# What changed in the Agent SDK's types between two versions: the message types of SDKMessage, and the
# declarations of sdk.d.ts and sdk-tools.d.ts. Writes summary.md and types.diff into the out directory.
# Usage: type-diff.sh <old version> <new version> <out directory>
set -euo pipefail
old=$1 new=$2 out=$3
mkdir -p "$out"
work=$(mktemp -d)
for version in "$old" "$new"; do
  mkdir -p "$work/$version"
  (cd "$work/$version" && npm pack --silent "@anthropic-ai/claude-agent-sdk@$version" >/dev/null && tar -xzf ./*.tgz)
  # The package's files end their lines in CRLF
  for file in sdk.d.ts sdk-tools.d.ts; do
    tr -d '\r' <"$work/$version/package/$file" >"$work/$version/$file"
  done
done
before=$work/$old after=$work/$new

# A line per declaration: its name, a tab, and its code without comments, with each newline as \037
declarations() {
  awk '/^export (declare )?(type|interface|class|function|const|namespace|enum) / {
      if (name != "") print name "\t" text
      name = $0; sub(/^export (declare )?[a-z]+ /, "", name); sub(/[^A-Za-z0-9_$].*/, "", name); text = ""
    }
    name != "" && !/^[ \t]*(\/\*\*?|\*|\/\/)/ { text = text $0 "\037" }
    END { if (name != "") print name "\t" text }' "$1" | sort -t $'\t' -k1,1
}

members() {
  sed -n 's/^export declare type SDKMessage = \(.*\);$/\1/p' "$1" | tr '|' '\n' | tr -d ' ' | sort
}

names() {
  if [[ -z $1 ]]; then echo "none"; else awk '{ printf "%s`%s`", (NR > 1 ? ", " : ""), $0 }' <<<"$1"; fi
}

: >"$out/types.diff"
counts=() details=()
for file in sdk.d.ts sdk-tools.d.ts; do
  diff -u --label "$old/$file" --label "$new/$file" "$before/$file" "$after/$file" >>"$out/types.diff" || true
  declarations "$before/$file" >"$work/old" && declarations "$after/$file" >"$work/new"
  added=$(comm -13 <(cut -f1 "$work/old" | sort -u) <(cut -f1 "$work/new" | sort -u))
  removed=$(comm -23 <(cut -f1 "$work/old" | sort -u) <(cut -f1 "$work/new" | sort -u))
  changed=$(join -t $'\t' "$work/old" "$work/new" | awk -F '\t' '$2 != $3 { print $1 }' | sort -u)
  counts+=("\`$file\`: $(grep -c . <<<"$added" || true) added, $(grep -c . <<<"$removed" || true) removed, $(grep -c . <<<"$changed" || true) changed")
  details+=("\`$file\`: added $(names "$added"); removed $(names "$removed"); changed $(names "$changed").")
done

messages_added=$(comm -13 <(members "$before/sdk.d.ts") <(members "$after/sdk.d.ts"))
messages_removed=$(comm -23 <(members "$before/sdk.d.ts") <(members "$after/sdk.d.ts"))
{
  echo "**Agent SDK $old → $new.** Message types (\`SDKMessage\`): added $(names "$messages_added"); removed $(names "$messages_removed")."
  echo "Declarations: ${counts[0]}; ${counts[1]}."
  echo
  echo "<details><summary>The declarations</summary>"
  echo
  printf '%s\n\n' "${details[@]}"
  echo "</details>"
  echo
  echo "<details><summary>The diff ($(grep -c '^[+-][^+-]' "$out/types.diff" || true) lines changed)</summary>"
  echo
  echo '```diff'
  head -c 30000 "$out/types.diff"
  echo
  echo '```'
  echo
  echo "</details>"
} >"$out/summary.md"
