#!/usr/bin/env bash
# run-all.sh — Run all scan/build/codecity tests.
#
# Invoked by `npm run test:scripts`. Exits non-zero on any failure.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
FIXTURE="$REPO_ROOT/tests/fixtures/sample-repo"

# ── Preflight ─────────────────────────────────────────────────────────────────
command -v python3 >/dev/null 2>&1 || {
  echo "ERROR: python3 required (>= 3.9)" >&2; exit 1
}
python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)' || {
  echo "ERROR: python3 >= 3.9 required" >&2; exit 1
}

# ── 1. Ensure the sample-repo fixture exists ──────────────────────────────────
if [ ! -d "$FIXTURE" ]; then
  echo "Generating fixture (one-time) ..."
  bash "$REPO_ROOT/tests/fixtures/setup.sh"
fi

# ── 2. Python unit tests (fast, isolated) ─────────────────────────────────────
echo ""; echo "── python unit tests (unittest discover) ────────────────────"
(cd "$REPO_ROOT" && python3 -m unittest discover -s tests/scripts -p 'test_*.py' -v 2>&1 | tail -25)

# ── 3. CLI integration: scan.py ───────────────────────────────────────────────
echo ""; echo "── test-scan.sh ─────────────────────────────────────────────"
bash "$SCRIPT_DIR/test-scan.sh"

# ── 4. CLI integration: build.py ──────────────────────────────────────────────
echo ""; echo "── test-build.sh ────────────────────────────────────────────"
bash "$SCRIPT_DIR/test-build.sh"

# ── 5. Ensure skills/codecity/ is built (needed for test-codecity.sh) ─────────
if [ ! -f "$REPO_ROOT/skills/codecity/template.html" ]; then
  echo ""; echo "── npm run build (required for test-codecity.sh) ────────────"
  (cd "$REPO_ROOT" && npm run build --silent)
fi

# ── 6. End-to-end: shipped skills/codecity/codecity.py ────────────────────────
echo ""; echo "── test-codecity.sh ─────────────────────────────────────────"
bash "$SCRIPT_DIR/test-codecity.sh"

echo ""
echo "All scan/build/codecity tests passed. (Run 'npm run test:drift' to check build drift.)"
