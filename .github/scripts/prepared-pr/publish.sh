#!/usr/bin/env bash
# A prepared PR's publish steps. Runs from a copy taken before the patch is applied, which could change it.
# Usage: publish.sh check|open DIR
set -euo pipefail
cmd="$1" dir="$2"

# Outside the checkout: gh would fetch the new branch into it, whose git has no credentials
link_branch() {
  (cd "${RUNNER_TEMP:?}" && gh issue develop "${ISSUE:?}" -R "${GH_REPO:?}" --name "$1" >/dev/null) \
    || echo "::warning::${1} not linked to #${ISSUE}"
}

# --base: the checkout has no default branch for gh stack to find. A later follow-up joins by stack
# number: listing PRs would drop the earlier one.
stack_on() {
  local parent stack
  parent=$(gh pr view "$1" --json number --jq .number) \
    && stack=$(gh api "repos/${GH_REPO:?}/stacks?pull_request=${parent}" --jq '.[0].number // empty') \
    && gh stack link --base main "${stack:-${parent}}" "$2" >/dev/null \
    || echo "::warning::$2 not stacked on $1's PR"
}

commit() {
  git -c user.name="${BOT:?}" -c user.email="${BOT}@users.noreply.github.com" commit --quiet -m "$1"
}

# What the review leaves for the operator before anything else: a doubt about the approach, findings still
# open after the answer, or a review that did not finish
review_head() {
  local r1="${dir}/review-1.json" r2="${dir}/review-2.json"
  if [[ ! -s "${r1}" ]]; then
    [[ ! -s "${dir}/review-1.md" ]] || printf '> [!WARNING]\n> The review did not finish.\n\n'
    return 0
  fi
  jq -r 'select(.verdict == "rethink") | "> [!WARNING]\n> **The review questions the approach:** \(.direction)\n"' \
    "${r1}"
  # Findings and no answer: the answer was cut short, and the change opens as reviewed
  [[ -s "${dir}/before-review.patch" ]] || jq -r '(.findings // []) | select(length > 0)
    | "> [!WARNING]\n> **The review'"'"'s findings are not answered:** see the review below.\n"' "${r1}"
  [[ ! -s "${r2}" ]] || jq -r '[((.findings // [])[] | select(.state == "open") | "Finding \(.finding): \(.why)"),
      ((.new // [])[] | "\(.what) \(.consequence)")] | select(length > 0)
    | "> [!WARNING]\n> **Open after the review:**\n" + (map("> - " + .) | join("\n")) + "\n"' "${r2}"
}

# Round 1 as a review of the commit it saw, with a comment per finding on its line where GitHub takes one;
# round 2 as a comment.
post_review() {
  local n=$1 r1="${dir}/review-1.json"
  [[ -s "${dir}/review-1.md" ]] || return 0
  if [[ -s "${r1}" ]]; then
    jq -n --rawfile body "${dir}/review-1.md" --arg sha "${reviewed}" --slurpfile r "${r1}" '{
      commit_id: $sha, event: "COMMENT", body: ("**Review before this PR opened: `\($r[0].verdict)`**\n\n" + $body),
      comments: [($r[0].findings // [])[] | select((.path // "") != "" and (.line // 0) > 0)
        | {path, line, side: "RIGHT", body: "**\(.severity):** \(.what)"}]}' >"${RUNNER_TEMP}/review.json"
    # GitHub refuses the whole review for one line outside the diff: then it goes without line comments
    gh api "repos/${GH_REPO}/pulls/${n}/reviews" --input "${RUNNER_TEMP}/review.json" >/dev/null \
      || jq '.comments = []' "${RUNNER_TEMP}/review.json" \
      | gh api "repos/${GH_REPO}/pulls/${n}/reviews" --input - >/dev/null \
      || echo "::warning::The review is not on #${n}"
  else
    gh pr comment "${n}" --body-file "${dir}/review-1.md" >/dev/null || echo "::warning::No review note on #${n}"
  fi
  if [[ -s "${dir}/review-2.md" ]]; then
    {
      printf '**Review, round 2**\n\n'
      cat "${dir}/review-2.md"
    } >"${RUNNER_TEMP}/review-2.md"
    gh pr comment "${n}" --body-file "${RUNNER_TEMP}/review-2.md" >/dev/null \
      || echo "::warning::Round 2 is not on #${n}"
  fi
}

refuse() {
  echo "refused=true" >>"${GITHUB_OUTPUT}"
  exit 0
}

# Why the staged change cannot open as a draft PR, or nothing. A draft PR runs its own ci.yml, so a changed
# workflow could reach the repository's secrets before anyone reads it.
refusal() {
  local meta path old new added
  while IFS=$'\t' read -r meta path; do
    read -r old new _ <<<"${meta#:}"
    if [[ ! ${new} =~ ^(000000|100644|100755)$ || (${old} != "${new}" && ${old} != 000000 && ${new} != 000000) ]]; then
      echo "It changes the mode of \`${path}\` from ${old} to ${new}; a follow-up changes text only."
      return
    fi
  done < <(git diff --cached --no-renames --raw HEAD)
  while IFS=$'\t' read -r added _ path; do
    if [[ ${added} == - ]]; then
      echo "It changes the binary \`${path}\`, which no one can read in its diff."
      return
    fi
  done < <(git diff --cached --no-renames --numstat HEAD)
  path=$(git diff --cached --no-renames --name-only HEAD -- .github/workflows | head -n 1)
  [[ -z ${path} ]] || echo "It changes the workflow \`${path}\`, which its draft PR could run before anyone reads it."
}

case "${cmd}" in
  check)
    [[ -n "$(head -n 1 "${dir}/pr.md" 2>/dev/null)" ]] || {
      echo "It has no description: \`followup/pr.md\` is missing or its first line, the title, is empty." \
        >"${RUNNER_TEMP}/why.md"
      refuse
    }
    # An empty patch is the agent's no, and pr.md says why.
    [[ -s "${dir}/change.patch" ]] || {
      cp "${dir}/pr.md" "${RUNNER_TEMP}/why.md"
      refuse
    }
    git apply --index "${dir}/change.patch"
    why=$(refusal)
    if [[ -n ${why} ]]; then
      echo "${why} This one is hand work." >"${RUNNER_TEMP}/why.md"
      refuse
    fi
    # Once merged into the dependency PR's branch, its push runs dependencies.yml with these
    git diff --cached --quiet HEAD -- .github .claude || echo "ci=true" >>"${GITHUB_OUTPUT}"
    ;;
  open)
    branch="prepared-pr/${ISSUE:?}"
    title=$(head -n 1 "${dir}/pr.md")
    base_sha=$(git rev-parse HEAD)
    # The review's text goes up as the App's: no mention that starts an agent run
    for f in "${dir}"/review-*.md; do [[ ! -e "${f}" ]] || sed -i 's/@claude/claude/gI' "${f}"; done
    if [[ -s "${dir}/before-review.patch" ]]; then
      git reset -q --hard
      git apply --index "${dir}/before-review.patch"
      commit "${title}"
      reviewed=$(git rev-parse HEAD)
      git apply -R --index "${dir}/before-review.patch"
      git apply --index "${dir}/change.patch"
      # The author may have declined every finding
      git diff --cached --quiet || commit "Answers to the review"
    else
      commit "${title}"
      reviewed=$(git rev-parse HEAD)
    fi
    link_branch "${branch}"
    git push --force "https://x-access-token:${GH_TOKEN:?}@github.com/${GH_REPO:?}.git" "HEAD:refs/heads/${branch}"
    {
      [[ "${CI_FILES:-}" != true ]] || printf '> [!WARNING]\n> It changes CI files or the review'"'"'s skill: read them before marking it ready.\n\n'
      review_head
      printf 'Closes #%s\n' "${ISSUE}"
      tail -n +2 "${dir}/pr.md"
      # Where restack.sh moves it from when its base moves
      printf '\n<!-- base: %s -->\n' "${base_sha}"
    } >"${RUNNER_TEMP}/body.md"
    # Prepared again, as restack.sh does when its base moved under it: the same PR, with the new change
    pr=$(gh pr list --head "${branch}" --state open --json url --jq '.[0].url // empty')
    if [[ -n ${pr} ]]; then
      gh pr edit "${pr}" --title "${title}" --body-file "${RUNNER_TEMP}/body.md" >/dev/null
    else
      pr=$(gh pr create --draft --base "${BASE:?}" --head "${branch}" --title "${title}" \
        --body-file "${RUNNER_TEMP}/body.md" ${MILESTONE:+--milestone "${MILESTONE}"})
    fi
    echo "${pr}"
    echo "pr=${pr}" >>"${GITHUB_OUTPUT}"
    [[ "${BASE}" == main ]] || stack_on "${BASE}" "${pr}"
    post_review "${pr##*/}"
    ;;
  *)
    echo "usage: publish.sh check|open DIR" >&2
    exit 2
    ;;
esac
