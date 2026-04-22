#!/usr/bin/env bash
# Install git hooks into .git/hooks.
#
# Run once per clone: bash scripts/install-hooks.sh
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
hooks_dir="${repo_root}/.git/hooks"

install_hook() {
  local name="$1"
  local source="$2"
  local target="${hooks_dir}/${name}"
  cat > "$target" <<EOF
#!/usr/bin/env bash
exec "${source}" "\$@"
EOF
  chmod +x "$target"
  echo "installed: ${target} -> ${source}"
}

install_hook "pre-commit" "${repo_root}/scripts/pre-commit-scan.sh"
echo "done."
