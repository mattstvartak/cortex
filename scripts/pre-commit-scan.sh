#!/usr/bin/env bash
# Pre-commit hook: runs identifier-scan.sh on staged files only.
#
# Install with scripts/install-hooks.sh.
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"

# Only scan text-ish files that have been staged. Let the scan script itself
# decide what to skip; this just narrows to "about to be committed."
mapfile -t staged < <(git diff --cached --name-only --diff-filter=ACMR)

if [[ ${#staged[@]} -eq 0 ]]; then
  exit 0
fi

exec "${repo_root}/scripts/identifier-scan.sh" "${staged[@]}"
