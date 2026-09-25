#!/usr/bin/env bash
# Very long lines and a very long group: wrapping, and whether the log UI stays usable.
set -euo pipefail
e=$'\e'

echo "== 1,000 character line =="
printf 'x%.0s' {1..1000}; echo
echo "== 20,000 character line with spaces =="
for _ in {1..2000}; do printf 'word%.0s ' 1; printf '12345 '; done; echo
echo "== 20,000 character line, colored halfway through =="
printf 'a%.0s' {1..10000}; printf '%s[32m' "$e"; printf 'b%.0s' {1..10000}; printf '%s[0m\n' "$e"

echo "::group::10,000 lines"
for i in $(seq 1 10000); do printf '%s[90m%5d%s[0m line of a very long tool output\n' "$e" "$i" "$e"; done
echo "::endgroup::"

echo "::group::100,000 lines"
seq 1 100000 | sed 's/$/ line of an even longer tool output/'
echo "::endgroup::"

echo "after the long groups"
