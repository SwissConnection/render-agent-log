#!/usr/bin/env bash
# The prepare job's agent (from swissconn-workspace's prepared PRs), then up to 3 rounds in which publish.sh's
# check, run as the publish job runs it, tells the agent what would keep its change from a draft PR; then a
# fresh agent's review (review.md), the author's answer to its findings and one re-review. Leaves
# $RUNNER_TEMP/followup/change.patch and pr.md, and from the review review-1.md and .json, and after an answer
# before-review.patch and review-2.*. Exits non-zero and saves nothing when Claude itself fails. Needs CLAUDE,
# PROMPT, BASE_SHA, ISSUE and ISSUE_FILE, and beside it publish.sh, review.md and agent-settings.json, out of
# the agent's tree.
set -uo pipefail

FIX_UP_ROUNDS=3
# The agent's time, out of the job's: running out of it tells itself apart from Claude failing
AGENT_SECONDS=3600
# A review round's: a guard against a hang, not a limit on the review
REVIEW_SECONDS=1200

main() {
  setup

  ask "${PROMPT:?}" --session-id "${session}" --max-turns 100 || exit
  if [[ -n "${stopped}" ]]; then
    : >"${followup}/change.patch"
    echo "The agent did not finish: ${stopped}." >"${followup}/pr.md"
    exit 0
  fi
  # What the check refuses or the agent declined is handed back unreviewed
  settle || exit 0

  review 1 "$(review_prompt)" --session-id "${reviewer}" || exit 0
  cp "${followup}/change.patch" "${followup}/before-review.patch"
  cp "${followup}/pr.md" "${RUNNER_TEMP}/pr-before-review.md"
  # The change as reviewed, so the re-review's `git diff` is the answer alone
  git add -A
  git -c user.name=prepare -c user.email=prepare@localhost commit --quiet --no-verify -m reviewed
  ask "$(answer_prompt)" --resume "${session}" --max-turns 50 || stopped="it failed"
  if [[ -n "${stopped}" ]] || ! settle; then
    # An answer the check refuses, or cut short: the change as reviewed opens, its findings unanswered
    mv "${followup}/before-review.patch" "${followup}/change.patch"
    cp "${RUNNER_TEMP}/pr-before-review.md" "${followup}/pr.md"
    restore
    exit 0
  fi
  review 2 "$(rereview_prompt)" --resume "${reviewer}" || true
}

setup() {
  here=$(cd "$(dirname "$0")" && pwd)
  followup="${RUNNER_TEMP:?}/followup"
  check="${RUNNER_TEMP}/check"
  mkdir -p "${followup}" "${check}"
  # Advice only: the publish job checks again on a fresh runner
  cp "${here}/publish.sh" "${check}/"
  session=$(uuid)
  reviewer=$(uuid)
  deadline=$((SECONDS + AGENT_SECONDS))
  stopped=""
}

# The runner's kernel has one; macOS, for a local trial, has uuidgen
uuid() {
  cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen | tr '[:upper:]' '[:lower:]'
}

# One message ($1) to the agent, with claude's other flags; sets `stopped` when it runs out of time or turns.
ask() {
  local left=$((deadline - SECONDS)) codes
  if ((left <= 0)); then
    stopped="out of time"
    return 0
  fi
  timeout "${left}" "${CLAUDE:?}" -p "$1" "${@:2}" --model opus --settings "${here}/agent-settings.json" \
    --output-format stream-json --verbose | tee "${RUNNER_TEMP}/agent.jsonl" | render-agent-log
  codes=("${PIPESTATUS[@]}")
  if ((codes[0] == 124)); then
    stopped="out of time"
  elif tail -n1 "${RUNNER_TEMP}/agent.jsonl" | jq -e '.subtype? == "error_max_turns"' >/dev/null 2>&1; then
    stopped="out of turns"
  else
    return "$((codes[0] || codes[1] || codes[2]))"
  fi
}

# Until the check passes, in up to FIX_UP_ROUNDS rounds; fails when it still refuses or the agent said no.
settle() {
  local round why last=""
  for ((round = 1; ; round++)); do
    save
    precheck && return 0
    if agent_said_no || ((round > FIX_UP_ROUNDS)); then
      return 1
    fi
    why=$(<"${check}/why.md")
    # The same reason again: the agent kept its change, so the fix needs what the check refuses
    [[ "${why}" != "${last}" ]] || return 1
    last="${why}"

    echo "::notice::The check before the PR, round ${round}: ${why}"
    # A round cut short keeps the change from before it, which the publish job's check refuses again
    ask "$(fix_up_prompt "${why}")" --resume "${session}" --max-turns 30 || return 1
    [[ -z "${stopped}" ]] || return 1
  done
}

# Review round $1, prompt $2, with claude's other flags: the review's text in review-$1.md, the JSON it ends
# with in review-$1.json, and the tree back to the change. Fails when it found nothing to answer.
review() {
  local out="${followup}/review-$1" text verdict
  # Staged, so `git diff HEAD` shows new files too
  git add -A
  timeout "${REVIEW_SECONDS}" "${CLAUDE}" -p "$2" "${@:3}" --model opus \
    --settings "${here}/agent-settings.json" --output-format stream-json --verbose \
    | tee "${RUNNER_TEMP}/review.jsonl" | render-agent-log
  restore
  text=$(jq -r 'select(.type == "result") | .result // empty' "${RUNNER_TEMP}/review.jsonl")
  verdict=$(grep -E '^[[:space:]]*\{' <<<"${text}" | tail -n 1)
  # The shape publish.sh reads, or nothing: a slip would fail it after the branch is pushed
  if ! jq -e 'type == "object" and has("verdict")
    and ([.findings, .new] | all(. == null or (type == "array" and all(type == "object"))))' \
    <<<"${verdict}" >/dev/null 2>&1; then
    echo "The review did not finish." >"${out}.md"
    return 1
  fi
  grep -vxF -- "${verdict}" <<<"${text}" >"${out}.md"
  jq . <<<"${verdict}" >"${out}.json"
  jq -e '.findings | length > 0' "${out}.json" >/dev/null
}

# The tree as the change alone: a reviewer's probes and edits go
restore() {
  git reset -q --hard "${BASE_SHA}"
  git clean -fdq
  git apply --binary "${followup}/change.patch"
}

review_prompt() {
  sed -e "s|{issue}|${ISSUE:?}|g" -e "s|{issue_file}|${ISSUE_FILE:?}|g" -e "s|{description}|${followup}/pr.md|g" \
    "${here}/review.md"
}

answer_prompt() {
  cat <<EOF
An independent review of your change follows. Answer each finding, blockers and notes alike: change the code where it holds, or decline it where it does not. Stay within what the findings ask, run what your edits could break, and keep \`${followup}/pr.md\` true to the change. Commit nothing. Then write \`${followup}/answer.md\`: a line per finding, what you did and why.

$(<"${followup}/review-1.md")
EOF
}

rereview_prompt() {
  cat <<EOF
The author has answered your review, in \`${followup}/answer.md\`. \`git diff HEAD\` shows what they changed since, \`git diff ${BASE_SHA}\` the whole change. This is the last round. For each finding, say in a line whether it is resolved, declined for a reason you accept, or still open, and why. Raise a new finding only for a blocker the answer itself introduced, and nothing on code it did not change. End with one JSON line:
{"verdict": "ok" | "open", "findings": [{"finding": 1, "state": "resolved" | "declined" | "open", "why": ""}], "new": [{"what": "", "consequence": ""}]}
EOF
}

fix_up_prompt() {
  cat <<EOF
Before its draft PR opens, the check refuses what you left: $1
If that is a slip, fix it: the change stays in the working tree, uncommitted, and its title and description in \`${followup}/pr.md\`. If the fix needs what it refuses, leave everything as it is and end.
EOF
}

save() {
  git add -A
  git diff --cached --binary "${BASE_SHA:?}" >"${followup}/change.patch"
  # Unstaged again: a staged change would undo the agent's own restore or unstage
  git reset -q
}

# The check in a clean tree of the base; its reason lands in $check/why.md
precheck() {
  local tree="${check}/tree" output="${check}/output" status
  if ! git worktree add --quiet --detach "${tree}" "${BASE_SHA}"; then
    echo "::warning::The check before the PR was skipped: no clean tree of the base"
    return 0
  fi
  : >"${output}"
  (cd "${tree}" && RUNNER_TEMP="${check}" GITHUB_OUTPUT="${output}" bash "${check}/publish.sh" check "${followup}")
  status=$?
  git worktree remove --force "${tree}"
  grep -qx "refused=true" "${output}" && status=1
  return "${status}"
}

# No change, and pr.md says why
agent_said_no() {
  [[ ! -s "${followup}/change.patch" && -n "$(head -n 1 "${followup}/pr.md" 2>/dev/null)" ]]
}

main "$@"
