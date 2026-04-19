#!/usr/bin/env bash
#
# build.sh — fill placeholder tokens in the prebuilt HTML template.
#
# The prebuilt template lives at `dist/index.html` (checked in, produced by
# `npm run build` from src/). This script substitutes the three placeholders
# (__PROJECT_NAME__, __MANIFEST__, __CONFIG__) and writes a self-contained
# HTML to --output. No bundling, no JS tooling — just text substitution, so
# the skill runs on any machine with bash.
#
# Usage:
#   build.sh \
#     --project  <name> \
#     --manifest <path-or-"-"> \
#     --config   <path-or-"-"> \
#     --output   <path>
#
# Pass "-" for --manifest or --config to read JSON from stdin.

set -euo pipefail

project=""; manifest=""; config=""; output=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project)  project="$2";  shift 2 ;;
    --manifest) manifest="$2"; shift 2 ;;
    --config)   config="$2";   shift 2 ;;
    --output)   output="$2";   shift 2 ;;
    --help|-h)  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

for v in project manifest config output; do
  if [ -z "${!v}" ]; then
    echo "Missing required --$v" >&2
    exit 2
  fi
done

here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
template="$here/dist/index.html"

if [ ! -f "$template" ]; then
  echo "Template not found: $template" >&2
  echo "Run 'npm run build' to produce it." >&2
  exit 3
fi

tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT

if [ "$manifest" = "-" ]; then
  manifest_file="$tmpdir/manifest.json"
  cat > "$manifest_file"
else
  [ -f "$manifest" ] || { echo "Manifest not found: $manifest" >&2; exit 3; }
  manifest_file="$manifest"
fi

if [ "$config" = "-" ]; then
  config_file="$tmpdir/config.json"
  cat > "$config_file"
else
  [ -f "$config" ] || { echo "Config not found: $config" >&2; exit 3; }
  config_file="$config"
fi

# awk substitution — inserts a file's contents in place of an inline marker.
# Handles the vite-built template where placeholders like __MANIFEST__ sit
# inside a <script> tag on the same line. Finds the marker with index() and
# splices the replacement between the parts before and after.
# Portable across BSD and GNU awk (avoids sub/gsub so JSON backslashes and
# ampersands pass through unchanged).
_replace_marker() {
  awk -v marker="$1" -v replacement_file="$2" '
    {
      idx = index($0, marker)
      if (idx == 0) { print; next }
      printf "%s", substr($0, 1, idx - 1)
      first = 1
      while ((getline line < replacement_file) > 0) {
        if (first) { printf "%s", line; first = 0 }
        else       { printf "\n%s", line }
      }
      close(replacement_file)
      print substr($0, idx + length(marker))
    }
  '
}

mkdir -p "$(dirname "$output")"

tmp1="$tmpdir/step1.html"
tmp2="$tmpdir/step2.html"

_replace_marker '__MANIFEST__' "$manifest_file" < "$template" > "$tmp1"
_replace_marker '__CONFIG__'   "$config_file"   < "$tmp1"     > "$tmp2"

# Project name is a plain string substitution. Escape / and & so sed doesn't
# reinterpret them; in practice the project name is a filesystem base name.
escaped_project=$(printf '%s' "$project" | sed 's/[\/&]/\\&/g')
sed "s/__PROJECT_NAME__/$escaped_project/g" "$tmp2" > "$output"

echo "Built: $output"
