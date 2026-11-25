#!/usr/bin/env bash
# The dependency PR's note (dependencies.yml), the one thing in its description a reader sees.
#   dependency-note.sh compose <reviewing|incomplete> <checks dir>  prints the note from the checks' files
#   dependency-note.sh compose review <checks dir> <review dir>  prints the review's note.md, with the table
#                      and the checks where it marks them, and its follow-ups' numbers (numbers.txt)
#   dependency-note.sh put [<pr>]  puts the note on stdin into the PR of $GITHUB_REF_NAME, below the marker,
#                                  and into the job's summary; with no PR, only the summary
set -euo pipefail
# Renovate's fingerprint of the description stops at this line, so Renovate leaves what follows alone
marker='<!-- Reviewable:start -->'

# The table, at the review's `<!-- what moved -->`
moved() {
  echo "### What moved"
  echo
  cat "$1/moved.md"
}

# The checks, at the review's `<!-- checks -->`
checks() {
  local dir=$1 missing=$2
  check() { cat "$dir/$1" 2>/dev/null || echo "${missing%% *} **$2**: ${missing#* }"; }
  echo "### Checks"
  echo
  check typecheck.md Typecheck
  echo
  check canary.md "A real run"
  echo
  check wrapper.md "The wrapper"
  if [[ -s $dir/diff.md ]]; then
    echo
    cat "$dir/diff.md"
  fi
}

review() {
  local dir=$1 review=$2 line
  while IFS= read -r line; do
    case $line in
      "<!-- what moved -->") moved "$dir" ;;
      "<!-- checks -->") checks "$dir" "❌ no result" ;;
      *) echo "$line" ;;
    esac
  done <"$review/note.md" |
    # F1 is the review's name for a follow-up until it is filed; numbers.txt holds "F1 52" per line
    perl -pe 'BEGIN { my $file = shift; if (open(my $f, "<", $file)) { %n = map { split } <$f> } }
      s/(#|%23)(F\d+)\b/exists $n{$2} ? "$1$n{$2}" : "$1$2"/ge' "$review/numbers.txt"
}

compose() {
  local mode=$1 dir=$2 missing badge card
  if [[ $mode == review ]]; then
    review "$dir" "$3"
    return
  fi
  if [[ $mode == reviewing ]]; then
    missing="⏳ running"
    badge='![Reviewing](https://img.shields.io/badge/Reviewing-0969da?style=for-the-badge)'
    card="The review is still running. What moved is final; the checks fill in as they finish."
  else
    missing="❌ no result"
    badge='![Review incomplete](https://img.shields.io/badge/Review-incomplete-8c959f?style=for-the-badge&labelColor=57606a)'
    card="The review did not finish. What moved and the checks are final."
  fi
  echo "$badge"
  echo
  echo "> [!NOTE]"
  echo "> $card"
  echo
  moved "$dir"
  echo
  checks "$dir" "$missing"
}

put() {
  local note pr body
  note=$(cat)
  if [[ -n ${GITHUB_STEP_SUMMARY:-} ]]; then echo "$note" >"$GITHUB_STEP_SUMMARY"; fi
  pr=${1:-$(gh pr list --head "$GITHUB_REF_NAME" --state open --json number --jq '.[0].number // empty')}
  [[ -n $pr ]] || return 0
  # Re-read at the moment of writing; a description edited on github.com has CRLF line ends
  body=$(gh pr view "$pr" --json body --jq .body | awk -v marker="$marker" '{ sub(/\r$/, "") } $0 == marker { exit } { print }')
  printf '%s\n%s\n\n%s\n' "$body" "$marker" "$note" | gh pr edit "$pr" --body-file - >/dev/null
}

case $1 in
  compose) compose "$2" "$3" "${4:-}" ;;
  put) put "${2:-}" ;;
  *) echo "usage: $0 compose <reviewing|incomplete> <dir> | compose review <dir> <review dir> | put [<pr>]" >&2 && exit 2 ;;
esac
