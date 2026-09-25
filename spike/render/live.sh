#!/usr/bin/env bash
# One line every two seconds, flushed as written: watch the live log while this step runs.
set -euo pipefail

for i in $(seq 1 45); do
  echo "live line ${i} written at $(date -u +%H:%M:%S)"
  sleep 2
done
echo "::group::a group opened while live"
for i in $(seq 1 5); do
  echo "grouped live line ${i} written at $(date -u +%H:%M:%S)"
  sleep 2
done
echo "::endgroup::"
