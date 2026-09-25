#!/usr/bin/env bash
# Untrusted output wrapped in stop-commands, inside a group. Every command in the stopped block must stay
# inert: no annotation, no mask, and the group must not close early. The run should have no annotations.
# The controls use add-mask rather than notice so that proving commands are live leaves no annotation.
set -euo pipefail
token=$(openssl rand -hex 16)

echo "::add-mask::control-before"
echo "control: control-before (prints *** because commands are parsed in this step)"

echo "::group::untrusted tool output"
echo "::stop-commands::${token}"
echo "::error::injected error: must not become an annotation"
echo "  ::warning::injected warning behind leading spaces: must not become an annotation"
echo "::add-mask::spike-secret-value"
echo "::endgroup::"
echo "still inside the group: the injected endgroup above did nothing"
echo "::group::injected nested group"
echo "::set-output name=x::y"
echo "::stop-commands::another-token"
echo "::${token}"
echo "the line above is the token without its closing colons: still stopped"
echo "::${token}::"
echo "commands resume here, still inside the group"
echo "::endgroup::"

echo "after the group: spike-secret-value (masked would print ***, so add-mask stayed inert)"
echo "::add-mask::control-after"
echo "control: control-after (prints *** because commands are live again after the token)"
