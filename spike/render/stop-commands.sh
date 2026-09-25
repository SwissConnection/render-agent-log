#!/usr/bin/env bash
# Untrusted output wrapped in stop-commands, inside a group. Every command in the stopped block must stay
# inert: no annotation, no mask, and the group must not close early.
set -euo pipefail
token=$(openssl rand -hex 16)

echo "::notice::control: this notice is live, so commands are being parsed in this step"

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
echo "::notice::control: this notice is live again after the token"
