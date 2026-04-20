#!/usr/bin/env bash
#
# codecity.sh — CodeCity skill entry point.
#
# Usage:
#   bash skills/codecity/codecity.sh --root <path> --output <out.html>
#                                    [--depth N] [--include PAT] [--exclude PAT]
#                                    [--no-gitignore]
#   bash src/codecity.sh --dev --root <path> [filter flags]     # dev only
#
# One-shot mode: scans the target, fills template.html with the manifest +
# defaults.json, writes a self-contained HTML to --output.
#
# Dev mode: scans once, writes manifest/config into .dev/ at the repo root,
# exports CODECITY_* env vars, and execs `npx vite` for HMR on src/. Only
# meaningful when this script is src/codecity.sh.
#
# Depends on: bash 4+, jq, git, find, stat, awk, sed. Node/vite only for
# --dev mode.

set -euo pipefail

# ── Progress logging ─────────────────────────────────────────────────────────
# Prefix every status line so the user can see the phase and elapsed time.
# Goes to stderr so scan_tree's JSON (which we redirect to a file) stays clean.
_t_start=$SECONDS
_log() { [[ "${CODECITY_QUIET:-0}" == "1" ]] || printf '[codecity %4ds] %s\n' "$((SECONDS - _t_start))" "$*" >&2; }

_usage() {
  cat <<'EOF'
Usage:
  codecity.sh --root <path> --output <out.html> [filter flags]
  codecity.sh --dev --root <path> [filter flags]

Filter flags:
  --depth N        limit traversal depth
  --include PAT    only files matching pattern (glob)
  --exclude PAT    skip files matching pattern (glob)
  --no-gitignore   include files even if .gitignored
EOF
}

# ── Args ──────────────────────────────────────────────────────────────────────
ROOT="" ; OUTPUT="" ; DEPTH="" ; INCLUDE="" ; EXCLUDE=""
GITIGNORE="1" ; DEV_MODE="0"

if [[ $# -eq 0 ]]; then _usage; exit 2; fi

while [[ $# -gt 0 ]]; do
  case "$1" in
    --root)          ROOT="$2";      shift 2 ;;
    --output)        OUTPUT="$2";    shift 2 ;;
    --depth)         DEPTH="$2";     shift 2 ;;
    --include)       INCLUDE="$2";   shift 2 ;;
    --exclude)       EXCLUDE="$2";   shift 2 ;;
    --no-gitignore)  GITIGNORE="0";  shift   ;;
    --gitignore)     GITIGNORE="1";  shift   ;;
    --dev)           DEV_MODE="1";   shift   ;;
    -h|--help)       _usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; _usage; exit 2 ;;
  esac
done

[[ -n "$ROOT" ]] || { echo "--root is required" >&2; _usage; exit 2; }
if [[ "$DEV_MODE" != "1" && -z "$OUTPUT" ]]; then
  echo "--output is required (or use --dev)" >&2; _usage; exit 2
fi

# ── Locate sibling files ──────────────────────────────────────────────────────
# This script runs from either:
#   • src/codecity.sh               (dev, invoked via `npm run dev`)
#   • skills/codecity/codecity.sh   (shipped, invoked by agents/users)
# Both layouts have defaults.json + scripts/{scan,build}.sh as siblings.
# template.html only exists in the shipped layout; --dev mode doesn't need it
# (vite dev server serves src/index.html directly).
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULTS="$HERE/defaults.json"
TEMPLATE="$HERE/template.html"

[[ -f "$DEFAULTS"              ]] || { echo "Defaults not found: $DEFAULTS" >&2; exit 3; }
[[ -f "$HERE/scripts/scan.sh"  ]] || { echo "Helper not found: $HERE/scripts/scan.sh" >&2; exit 3; }
[[ -f "$HERE/scripts/build.sh" ]] || { echo "Helper not found: $HERE/scripts/build.sh" >&2; exit 3; }

if [[ "$DEV_MODE" != "1" && ! -f "$TEMPLATE" ]]; then
  echo "Template not found: $TEMPLATE" >&2
  echo "One-shot mode requires the shipped template. Run 'npm run build' or use --dev." >&2
  exit 3
fi

# Project name = basename of the scanned root.
PROJECT="$(basename "$(cd "$ROOT" && pwd)")"
export CODECITY_PROJECT="$PROJECT"

# ── Source helper libraries ───────────────────────────────────────────────────
# shellcheck source=./scripts/scan.sh
. "$HERE/scripts/scan.sh"
# shellcheck source=./scripts/build.sh
. "$HERE/scripts/build.sh"

# ── Scan ──────────────────────────────────────────────────────────────────────
if [[ "$DEV_MODE" == "1" ]]; then
  # In dev mode HERE is src/, so repo root is one level up. Write manifest/config
  # to .dev/ (gitignored) so vite's dev-inject plugin can read them.
  REPO_ROOT="$(cd "$HERE/.." && pwd)"
  DEV_DIR="$REPO_ROOT/.dev"
  mkdir -p "$DEV_DIR"
  MANIFEST_FILE="$DEV_DIR/manifest.json"
  CONFIG_FILE="$DEV_DIR/config.json"
else
  TMPDIR=$(mktemp -d)
  trap 'rm -rf "$TMPDIR"' EXIT
  MANIFEST_FILE="$TMPDIR/manifest.json"
  CONFIG_FILE="$TMPDIR/config.json"
fi

_log "project: $PROJECT"
_log "root:    $(cd "$ROOT" && pwd)"
if [[ -n "$DEPTH"   ]]; then _log "depth:   $DEPTH"; fi
if [[ -n "$INCLUDE" ]]; then _log "include: $INCLUDE"; fi
if [[ -n "$EXCLUDE" ]]; then _log "exclude: $EXCLUDE"; fi
if [[ "$GITIGNORE" == "0" ]]; then _log "gitignore: off"; fi
_log "mode:    $([[ "$DEV_MODE" == "1" ]] && echo "dev (vite HMR)" || echo "one-shot → $OUTPUT")"

# ── Scan ──────────────────────────────────────────────────────────────────────
_log "scanning…"
scan_start=$SECONDS
export ROOT DEPTH INCLUDE EXCLUDE GITIGNORE
scan_tree > "$MANIFEST_FILE"

# Extract a few counts for feedback.
manifest_size=$(wc -c < "$MANIFEST_FILE" | tr -d ' ')
files_count=$(jq '.tree.descendants_file_count' "$MANIFEST_FILE" 2>/dev/null || echo "?")
dirs_count=$(jq  '.tree.descendants_dir_count'  "$MANIFEST_FILE" 2>/dev/null || echo "?")
_log "scanned  $files_count files, $dirs_count dirs → $(( manifest_size / 1024 )) KB manifest ($((SECONDS - scan_start))s)"

# Config is just defaults.json — no CLI palette override. Users customize by
# editing defaults.json directly.
cp "$DEFAULTS" "$CONFIG_FILE"

# ── Branch: dev vs one-shot ───────────────────────────────────────────────────
if [[ "$DEV_MODE" == "1" ]]; then
  export CODECITY_MANIFEST="$MANIFEST_FILE"
  export CODECITY_CONFIG="$CONFIG_FILE"
  cd "$REPO_ROOT"
  _log "starting vite dev server (Ctrl-C to stop)…"
  exec npx vite
fi

_log "writing HTML…"
build_start=$SECONDS
build_html "$PROJECT" "$MANIFEST_FILE" "$CONFIG_FILE" "$TEMPLATE" "$OUTPUT"
out_size=$(wc -c < "$OUTPUT" | tr -d ' ')
_log "built    $OUTPUT ($(( out_size / 1024 )) KB, $((SECONDS - build_start))s)"
_log "done     total ${SECONDS}s"
