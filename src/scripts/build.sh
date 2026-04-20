# build.sh — fill placeholder tokens in the prebuilt HTML template (bash library).
#
# Usage (sourced, not executed):
#   source build.sh
#   build_html <project> <manifest_file> <config_file> <template_file> <output_file>
#
# Substitutes __PROJECT_NAME__, __MANIFEST__, __CONFIG__ in <template_file>
# with the given project name + inlined JSON and writes the result to
# <output_file>. Pure text substitution; no Node, no bundling.
#
# Depends on: awk, sed, mktemp. (No jq here.)

# Progress logger (stderr). Silenced by CODECITY_QUIET=1.
_build_log() { [[ "${CODECITY_QUIET:-0}" == "1" ]] || printf '[build] %s\n' "$*" >&2; }

# awk substitution — inserts a file's contents in place of an inline marker.
# Handles the vite-built template where placeholders like __MANIFEST__ sit
# inside a <script> tag on the same line. Finds the marker with index() and
# splices the replacement between the parts before and after. Portable across
# BSD and GNU awk (avoids sub/gsub so JSON backslashes and ampersands pass
# through unchanged).
_build_replace_marker() {
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

build_html() {
  local project="$1" manifest_file="$2" config_file="$3" template="$4" output="$5"

  for arg in "$project" "$manifest_file" "$config_file" "$template" "$output"; do
    [[ -n "$arg" ]] || { echo "build_html: all 5 args required" >&2; return 2; }
  done
  [[ -f "$template"      ]] || { echo "build_html: template not found: $template" >&2; return 3; }
  [[ -f "$manifest_file" ]] || { echo "build_html: manifest not found: $manifest_file" >&2; return 3; }
  [[ -f "$config_file"   ]] || { echo "build_html: config not found: $config_file" >&2; return 3; }

  local tmpdir
  tmpdir=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf '$tmpdir'" RETURN

  mkdir -p "$(dirname "$output")"
  local tmp1="$tmpdir/step1.html" tmp2="$tmpdir/step2.html"

  _build_log "inlining manifest ($(wc -c < "$manifest_file" | tr -d ' ') bytes)…"
  _build_replace_marker '__MANIFEST__' "$manifest_file" < "$template" > "$tmp1"

  _build_log "inlining config ($(wc -c < "$config_file" | tr -d ' ') bytes)…"
  _build_replace_marker '__CONFIG__'   "$config_file"   < "$tmp1"     > "$tmp2"

  _build_log "substituting project name ($project)…"
  # Project name is a plain string substitution. Escape / and & so sed doesn't
  # reinterpret them (project name is usually a filesystem base name).
  local escaped_project
  escaped_project=$(printf '%s' "$project" | sed 's/[\/&]/\\&/g')
  sed "s/__PROJECT_NAME__/$escaped_project/g" "$tmp2" > "$output"
}
