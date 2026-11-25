#!/usr/bin/env bash
# Files the review's follow-ups (.claude/skills/dependency-review/write.md) as sub-issues of the PR's parent
# issue, which the board takes them from, and starts the prepared PR of each one whose branch exists; one
# chained on a new follow-up starts when that one's PR opens.
# Usage: file-followups.sh <review dir> <pr> [--dry-run]
set -euo pipefail
review=$1 pr=$2 dry=${3:-}
: >"$review/numbers.txt"
if [[ -z $dry ]]; then
  gh label create dependencies --description "Work a dependency update owes or enables" --color 0366d6 --force >/dev/null
  gh label create prepared-pr --description "A draft PR is prepared for this follow-up" --color 1a7f37 --force >/dev/null
  title="Dependency update #$pr"
  parent=$(gh issue list --label dependencies --state all --limit 200 --json number,title |
    jq -r --arg title "$title" 'first(.[] | select(.title == $title)) | .number')
  if [[ -z $parent ]]; then
    url=$(gh issue create --title "$title" --label dependencies --milestone "Dependency updates" --assignee gaborv \
      --body "What #$pr owes or enables, as sub-issues. It closes when #$pr merges.")
    parent=${url##*/}
  fi
  echo "$parent" >"$review/parent.txt"
fi
[[ -s $review/followups.json ]] || exit 0
# Already one is fine: a follow-up named again by a later review
link() {
  gh api -X POST "repos/$GH_REPO/issues/$parent/sub_issues" -F sub_issue_id="$(gh api "repos/$GH_REPO/issues/$1" --jq .id)" \
    >/dev/null 2>&1 || true
}
jq -c '.[]' "$review/followups.json" | while IFS= read -r followup; do
  id=$(jq -r .id <<<"$followup")
  existing=$(jq -r '.existing // empty' <<<"$followup")
  if [[ -n $existing ]]; then
    echo "$id $existing" >>"$review/numbers.txt"
    [[ -n $dry ]] || link "$existing"
    continue
  fi
  title=$(jq -r .title <<<"$followup")
  labels=(--label dependencies)
  [[ $(jq -r .prepared <<<"$followup") != true ]] || labels+=(--label prepared-pr)
  [[ $(jq -r .bug <<<"$followup") != true ]] || labels+=(--label bug)
  branch=$(jq -r .branch <<<"$followup" | bash "$(dirname "$0")/dependency-note.sh" number "$review/numbers.txt")
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
  link "${url##*/}"
  if [[ $(jq -r .prepared <<<"$followup") == true ]] && gh api "repos/$GH_REPO/branches/$branch" >/dev/null 2>&1; then
    gh workflow run prepared-pr.yml --ref main -f issue="${url##*/}"
  fi
done
