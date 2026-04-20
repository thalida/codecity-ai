#!/usr/bin/env bash
# run-all.sh — Run all bash integration tests + drift-check the vite output.
#
# Invoked by `npm run test:scripts`. Exits non-zero on any failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE="$REPO_ROOT/tests/fixtures/sample-repo"

# ── 1. Ensure the sample-repo fixture exists ──────────────────────────────────
if [ ! -d "$FIXTURE" ]; then
  echo "Generating fixture (one-time) ..."
  bash "$REPO_ROOT/tests/fixtures/setup.sh"
fi

# ── 2. scan.sh (source + scan_tree) ───────────────────────────────────────────
echo ""; echo "── test-scan.sh ─────────────────────────────────────────────"
bash "$SCRIPT_DIR/test-scan.sh"

# ── 3. build.sh (source + build_html) ─────────────────────────────────────────
echo ""; echo "── test-build.sh ────────────────────────────────────────────"
bash "$SCRIPT_DIR/test-build.sh"

# ── 4. Ensure skills/codecity/ exists (needed for test-codecity.sh end-to-end) ─
if [ ! -f "$REPO_ROOT/skills/codecity/template.html" ]; then
  echo ""; echo "── npm run build (required for test-codecity.sh) ────────────"
  (cd "$REPO_ROOT" && npm run build --silent)
fi

# ── 5. codecity.sh end-to-end (shipped skills/codecity/codecity.sh) ───────────
echo ""; echo "── test-codecity.sh ─────────────────────────────────────────"
bash "$SCRIPT_DIR/test-codecity.sh"

echo ""
echo "All bash tests passed. (Run 'npm run test:drift' to check build drift.)"
