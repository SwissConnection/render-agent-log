#!/usr/bin/env bash
# Moves the prepared PRs built on a branch onto its new head by rebase, and the ones built on those in turn.
# One that no longer applies is prepared again from the new head. Usage: restack.sh <branch>
set -euo pipefail
queue=("$1")
while ((${#queue[@]})); do
  base=${queue[0]}
  queue=("${queue[@]:1}")
  git fetch -q origin
  new=$(git rev-parse "origin/$base")
  # number, head branch, head commit, the base it was built on, its issue
  rows=$(gh pr list --base "$base" --state open --json number,headRefName,headRefOid,body --jq '.[]
    | [.number, .headRefName, .headRefOid, ([.body | capture("<!-- base: (?<s>[0-9a-f]+) -->")][0].s // ""),
       ([.body | capture("Closes #(?<n>[0-9]+)")][0].n // "")] | @tsv')
  while IFS=$'\t' read -r pr head oid old issue; do
    [[ -n $old && $old != "$new" ]] || continue
    git checkout -q --detach "$oid"
    if git -c user.name="${BOT:?}" -c user.email="$BOT@users.noreply.github.com" rebase -q --onto "$new" "$old"; then
      git push -q --force-with-lease="refs/heads/$head:$oid" \
        "https://x-access-token:${GH_TOKEN:?}@github.com/${GH_REPO:?}.git" "HEAD:refs/heads/$head"
      gh pr view "$pr" --json body --jq .body | sed "s/<!-- base: $old -->/<!-- base: $new -->/" |
        gh pr edit "$pr" --body-file - >/dev/null
      queue+=("$head")
    else
      git rebase --abort
      gh pr comment "$pr" --body "Its base moved, and the change no longer applies on it, so it is prepared again." >/dev/null
      GH_TOKEN=${DISPATCH_TOKEN:?} gh workflow run prepared-pr.yml --ref main -f issue="$issue"
    fi
  done <<<"$rows"
done
