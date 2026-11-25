#!/usr/bin/env bash
# Files the review's follow-ups (followups.json, .claude/skills/dependency-review/write.md), in order, each
# ending with the branch it builds on, and writes numbers.txt, "F1 52" per line, for the note. Then starts
# a prepared PR (prepared-pr.yml) for each one labeled so whose branch exists already; one on another
# follow-up's branch starts when that one's PR opens. With --dry-run it files and starts nothing.
# Usage: file-followups.sh <review dir> <pr> [--dry-run]
set -euo pipefail
review=$1 pr=$2 dry=${3:-}
: >"$review/numbers.txt"
[[ -s $review/followups.json ]] || exit 0
if [[ -z $dry ]]; then
  gh label create dependencies --description "Work a dependency update owes or enables" --color 0366d6 --force >/dev/null
  gh label create prepared-pr --description "A draft PR is prepared for this follow-up" --color 1a7f37 --force >/dev/null
fi
jq -c '.[]' "$review/followups.json" | while IFS= read -r followup; do
  id=$(jq -r .id <<<"$followup")
  existing=$(jq -r '.existing // empty' <<<"$followup")
  if [[ -n $existing ]]; then
    echo "$id $existing" >>"$review/numbers.txt"
    continue
  fi
  title=$(jq -r .title <<<"$followup")
  labels=(--label dependencies)
  [[ $(jq -r .prepared <<<"$followup") != true ]] || labels+=(--label prepared-pr)
  [[ $(jq -r .bug <<<"$followup") != true ]] || labels+=(--label bug)
  # A follow-up filed above is named by its number by now
  branch=$(jq -r .branch <<<"$followup" | perl -pe 'BEGIN { open(my $f, "<", shift); %n = map { split } <$f> }
    s/\b(F\d+)\b/exists $n{$1} ? $n{$1} : $1/ge' "$review/numbers.txt")
  body="$(jq -r .body <<<"$followup")

From the dependency review of #$pr.

Branch from \`$branch\`."
  if [[ -n $dry ]]; then
    echo "would file $id: $title (${labels[*]}), from $branch"
    continue
  fi
  url=$(gh issue create --title "$title" --body "$body" "${labels[@]}" --milestone "Dependency updates" --assignee gaborv)
  echo "$id ${url##*/}" >>"$review/numbers.txt"
  echo "filed $id: $url"
  if [[ $(jq -r .prepared <<<"$followup") == true && $branch != prepared-pr/* ]]; then
    gh workflow run prepared-pr.yml --ref main -f issue="${url##*/}"
  fi
done
