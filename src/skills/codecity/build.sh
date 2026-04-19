#!/usr/bin/env bash
#
# build.sh — assemble a self-contained CodeCity HTML from a manifest + config.
#
# Reads all renderer sources (engine.js, colors.js, layout.js, sidebar.js,
# tree.js, interactions.js, styles.css) from the plugin and inlines them into
# template.html along with the provided MANIFEST and CONFIG.
#
# Usage:
#   build.sh \
#     --project  <name> \
#     --manifest <path-or-"-"> \
#     --config   <path-or-"-"> \
#     --output   <path>
#
# Pass "-" for --manifest or --config to read JSON from stdin. `jq` is not
# required at build time (the JSON is embedded verbatim), but the scanner
# still needs it upstream.

set -euo pipefail

# ---- Parse args -----------------------------------------------------------
project=""; manifest=""; config=""; output=""

while [ $# -gt 0 ]; do
  case "$1" in
    --project)  project="$2";  shift 2 ;;
    --manifest) manifest="$2"; shift 2 ;;
    --config)   config="$2";   shift 2 ;;
    --output)   output="$2";   shift 2 ;;
    --help|-h)  sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)          echo "Unknown arg: $1" >&2; exit 2 ;;
  esac
done

for v in project manifest config output; do
  if [ -z "${!v}" ]; then
    echo "Missing required --$v" >&2
    exit 2
  fi
done

# ---- Locate plugin directories --------------------------------------------
here=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
root=$(cd "$here/../../.." && pwd)
template="$here/template.html"
styles="$root/src/renderer/styles.css"

[ -f "$template" ] || { echo "Template not found: $template" >&2; exit 3; }
[ -f "$styles"   ] || { echo "Styles not found: $styles"     >&2; exit 3; }

# ---- Resolve manifest/config (accept file path or "-" for stdin) ----------
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

# ---- Build the renderer bundle --------------------------------------------
# MANIFEST and CONFIG go at the top as `const` declarations so the rest of
# the bundle can reference them. Order of JS files matters — functions must
# be defined before startRenderLoop() is called from the module bootstrap.
bundle_file="$tmpdir/bundle.js"
{
  printf 'const MANIFEST = '
  cat "$manifest_file"
  printf ';\nconst CONFIG = '
  cat "$config_file"
  printf ';\n\n'
  for f in engine colors layout sidebar tree interactions; do
    src="$root/src/renderer/$f.js"
    [ -f "$src" ] || { echo "Missing renderer source: $src" >&2; exit 3; }
    cat "$src"
    printf '\n\n'
  done
} > "$bundle_file"

# ---- Assemble -------------------------------------------------------------
# awk inserts file contents at each marker line (portable across BSD/GNU).
_replace_marker() {
  awk -v marker="$1" -v replacement_file="$2" '
    $0 ~ marker {
      while ((getline line < replacement_file) > 0) print line
      close(replacement_file)
      next
    }
    { print }
  '
}

mkdir -p "$(dirname "$output")"

tmp1="$tmpdir/step1.html"
tmp2="$tmpdir/step2.html"

_replace_marker '__STYLES__' "$styles"      < "$template" > "$tmp1"
_replace_marker '__BUNDLE__' "$bundle_file" < "$tmp1"     > "$tmp2"

# Simple string substitution for project name (doesn't contain special chars
# in practice, but handle / and & safely to be defensive).
escaped_project=$(printf '%s' "$project" | sed 's/[\/&]/\\&/g')
sed "s/__PROJECT_NAME__/$escaped_project/g" "$tmp2" > "$output"

echo "Built: $output"
