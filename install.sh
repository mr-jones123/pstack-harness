#!/bin/sh
# Install or update pstack-harness in every harness on this machine: OMP (omp) and Pi (pi). Safe to rerun.
# Usage: sh install.sh            or   curl -fsSL <raw install.sh URL> | sh
set -eu

repo="${PSTACK_HARNESS_REPO:-github.com/mr-jones123/pstack-harness}"
found=0

if command -v omp >/dev/null 2>&1; then
  found=1
  path=$(omp plugin list --json | sed -n 's/.*"path": "\([^"]*\/node_modules\/pstack-harness\)".*/\1/p' | head -n 1)
  if [ -z "$path" ]; then
    omp plugin install "https://$repo"
  elif [ -L "$path" ]; then
    echo "omp: pstack-harness is linked from a local checkout ($(readlink "$path")). Pull that checkout to update it."
  else
    omp plugin upgrade pstack-harness
  fi
  omp plugin enable pstack-harness >/dev/null
fi

if command -v pi >/dev/null 2>&1; then
  found=1
  listed=$(pi list 2>/dev/null || true)
  local_copy=""
  while IFS= read -r dir; do
    if [ -n "$dir" ] && grep -q '"name": "pstack-harness"' "$dir/package.json" 2>/dev/null; then local_copy="$dir"; fi
  done <<EOF
$(printf '%s\n' "$listed" | sed -n 's/^ *\(\/.*\)$/\1/p')
EOF
  if printf '%s\n' "$listed" | awk -v s="git:$repo" '{ $1 = $1 } $0 == s { f = 1 } END { exit !f }'; then
    pi update "git:$repo"
  elif [ -n "$local_copy" ]; then
    echo "pi: pstack-harness is installed from a local checkout ($local_copy). Pull that checkout to update it."
  else
    pi install "git:$repo"
  fi
fi

if [ "$found" -eq 0 ]; then
  echo "install.sh: neither omp nor pi is on PATH" >&2
  exit 1
fi

echo "pstack-harness is installed. Pick models once on this machine with /skill:setup-pstack."
