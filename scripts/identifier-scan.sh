#!/usr/bin/env bash
# Cortex identifier scan.
#
# Scans a list of files for patterns that suggest real client / PII data
# leaked into a committed file. Used by:
#   - scripts/pre-commit-scan.sh (staged files only)
#   - .github/workflows/ci.yml  (all files on PR)
#
# Exits 0 if clean, 1 if any pattern matched. Output lists every hit so the
# user can fix or whitelist.
#
# See docs/PRIVACY.md for the rule.

set -euo pipefail

files=("$@")
if [[ ${#files[@]} -eq 0 ]]; then
  echo "identifier-scan: no files to scan (ok)"
  exit 0
fi

repo_root="$(git rev-parse --show-toplevel)"
allow_file="${repo_root}/scripts/identifier-scan-allow.txt"

# Patterns to reject. Each is an ERE (egrep) regex.
#
# Design: these are loose to catch obvious leaks; false positives should be
# added to identifier-scan-allow.txt (substrings — any matched line
# containing one is skipped).
patterns=(
  # Emails — reject real-looking domains. The allow list covers
  # example.com/org, cortex.local, placeholders, etc.
  '\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b'
  # Atlassian workspace subdomains (the bit before .atlassian.net)
  '\b[a-z][a-z0-9-]+\.atlassian\.net\b'
  # Slack workspace URLs
  '\b[a-z][a-z0-9-]+\.slack\.com\b'
  # Tailnet names (common private-infra leak)
  '\b[a-z][a-z0-9-]+\.ts\.net\b'
  # GitHub repo paths (org/repo) — reject specific-looking ones by checking
  # allow list
  'github\.com/[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*'
)

# Substrings we explicitly allow. One per line in the allow file. Comments
# start with #. Blank lines ignored.
allow_patterns=()
if [[ -f "$allow_file" ]]; then
  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^# ]] && continue
    allow_patterns+=("$line")
  done < "$allow_file"
fi

line_is_allowed() {
  local line="$1"
  for allow in "${allow_patterns[@]}"; do
    if [[ "$line" == *"$allow"* ]]; then
      return 0
    fi
  done
  return 1
}

# Skip binaries + files that live outside source. The scanner is for
# committed-source hygiene, not for walking node_modules.
should_skip() {
  local file="$1"
  case "$file" in
    node_modules/*|*/node_modules/*) return 0 ;;
    dist/*|*/dist/*) return 0 ;;
    .git/*) return 0 ;;
    pnpm-lock.yaml) return 0 ;;
    docs/PRIVACY.md) return 0 ;;          # documents the very patterns we scan
    scripts/identifier-scan*) return 0 ;; # the scanner itself references patterns
  esac
  return 1
}

violations=0

for file in "${files[@]}"; do
  [[ ! -f "$file" ]] && continue
  if should_skip "$file"; then continue; fi

  for pattern in "${patterns[@]}"; do
    while IFS= read -r hit; do
      [[ -z "$hit" ]] && continue
      # Line includes "line_no:content" from grep -n
      line_content="${hit#*:}"
      if line_is_allowed "$line_content"; then
        continue
      fi
      echo "identifier-scan: $file:$hit"
      violations=$((violations + 1))
    done < <(grep -En "$pattern" "$file" 2>/dev/null || true)
  done
done

if [[ $violations -gt 0 ]]; then
  echo ""
  echo "identifier-scan: found $violations potential identifier leak(s)."
  echo "Fix the file, or if this is a false positive, add a matching substring"
  echo "to scripts/identifier-scan-allow.txt. See docs/PRIVACY.md."
  exit 1
fi

echo "identifier-scan: clean (${#files[@]} files checked)"
exit 0
