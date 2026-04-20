#!/usr/bin/env bash
# test-scan.sh — CLI integration tests for src/scripts/scan.py
#
# Invokes the Python scanner as a subprocess and asserts on the JSON it
# emits. Python unit tests (tests/scripts/test_scan.py) cover the internal
# API; this file covers the CLI contract.
#
# Prerequisites:
#   - bash tests/fixtures/setup.sh has been run (creates sample-repo)
#   - jq available on PATH
#   - python3 on PATH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCAN_PY="$REPO_ROOT/src/scripts/scan.py"
FIXTURE="$REPO_ROOT/tests/fixtures/sample-repo"

PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected: $expected, got: $actual)"; FAIL=$((FAIL + 1))
  fi
}

assert_not_empty() {
  local desc="$1" actual="$2"
  if [ -n "$actual" ] && [ "$actual" != "null" ]; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected non-empty/non-null, got: $actual)"; FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qF "$needle"; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected to contain: $needle)"; FAIL=$((FAIL + 1))
  fi
}

assert_not_contains() {
  local desc="$1" haystack="$2" needle="$3"
  if echo "$haystack" | grep -qvF "$needle"; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected to NOT contain: $needle)"; FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "Pre-flight checks"
[ -f "$SCAN_PY" ] || { echo "  ERROR: scan.py not found at $SCAN_PY" >&2; exit 1; }
[ -d "$FIXTURE"  ] || { echo "  ERROR: fixture not found — run 'bash tests/fixtures/setup.sh'" >&2; exit 1; }
git -C "$FIXTURE" rev-parse --git-dir >/dev/null 2>&1 || { echo "  ERROR: fixture not a git repo" >&2; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "  ERROR: jq is required but not found" >&2; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "  ERROR: python3 required" >&2; exit 1; }
echo "  ✓ scan.py found; fixture exists; jq + python3 available"

# Silence progress logs during tests (they'd clutter output).
export CODECITY_QUIET=1

_run_scan() { python3 "$SCAN_PY" --root "$FIXTURE" "$@"; }

# ── Capture base scan output ──────────────────────────────────────────────────
OUT=$(_run_scan)

# ── Section 1: Root node ──────────────────────────────────────────────────────
echo ""
echo "Root node"

assert_eq "root name is sample-repo" \
  "sample-repo" \
  "$(echo "$OUT" | jq -r '.tree.name')"

assert_eq "root type is directory" \
  "directory" \
  "$(echo "$OUT" | jq -r '.tree.type')"

assert_eq "root path is ." "." \
  "$(echo "$OUT" | jq -r '.tree.path')"

assert_eq "root fullPath is fixture absolute path" \
  "$FIXTURE" \
  "$(echo "$OUT" | jq -r '.tree.fullPath')"

# ── Section 2: Manifest fields ────────────────────────────────────────────────
echo ""
echo "Manifest fields"

assert_not_empty "scanned_at is present" "$(echo "$OUT" | jq -r '.scanned_at')"
assert_eq "depth is null (unlimited)" "null" "$(echo "$OUT" | jq -r '.depth')"
assert_eq "root field matches fixture path" "$FIXTURE" "$(echo "$OUT" | jq -r '.root')"

# ── Section 3: Children counts ────────────────────────────────────────────────
echo ""
echo "Children counts"

assert_eq "root children_count = 6" "6" "$(echo "$OUT" | jq -r '.tree.children_count')"
assert_eq "root children_file_count = 3" "3" "$(echo "$OUT" | jq -r '.tree.children_file_count')"
assert_eq "root children_dir_count = 3" "3" "$(echo "$OUT" | jq -r '.tree.children_dir_count')"

# ── Section 4: Descendants ────────────────────────────────────────────────────
echo ""
echo "Descendants"

assert_eq "descendants_count = 13" "13" "$(echo "$OUT" | jq -r '.tree.descendants_count')"
assert_eq "descendants_file_count = 9" "9" "$(echo "$OUT" | jq -r '.tree.descendants_file_count')"
assert_eq "descendants_dir_count = 4" "4" "$(echo "$OUT" | jq -r '.tree.descendants_dir_count')"
assert_not_empty "descendants_size is positive" \
  "$(echo "$OUT" | jq -r 'if .tree.descendants_size > 0 then .tree.descendants_size else empty end')"

# ── Section 5: File metadata (index.ts) ───────────────────────────────────────
echo ""
echo "File metadata (src/index.ts)"

INDEX_TS=$(echo "$OUT" | jq '[.. | objects | select(.name == "index.ts")] | .[0]')
assert_eq "index.ts type is file" "file" "$(echo "$INDEX_TS" | jq -r '.type')"
assert_eq "index.ts extension is .ts" ".ts" "$(echo "$INDEX_TS" | jq -r '.extension')"
assert_eq "index.ts binary is false" "false" "$(echo "$INDEX_TS" | jq -r '.binary')"
assert_eq "index.ts lines = 50" "50" "$(echo "$INDEX_TS" | jq -r '.lines')"
assert_not_empty "index.ts size is positive" \
  "$(echo "$INDEX_TS" | jq -r 'if .size > 0 then .size else empty end')"
assert_eq "index.ts path is src/index.ts" "src/index.ts" "$(echo "$INDEX_TS" | jq -r '.path')"
assert_eq "index.ts fullPath ends with sample-repo/src/index.ts" \
  "$FIXTURE/src/index.ts" "$(echo "$INDEX_TS" | jq -r '.fullPath')"

# ── Section 6: Binary detection (logo.png) ────────────────────────────────────
echo ""
echo "Binary detection (logo.png)"

LOGO=$(echo "$OUT" | jq '[.. | objects | select(.name == "logo.png")] | .[0]')
assert_eq "logo.png binary is true"  "true" "$(echo "$LOGO" | jq -r '.binary')"
assert_eq "logo.png extension is .png" ".png" "$(echo "$LOGO" | jq -r '.extension')"

# ── Section 7: Git metadata ────────────────────────────────────────────────────
echo ""
echo "Git metadata"

assert_eq "index.ts git.created = 2024-03-22" \
  "2024-03-22T14:30:00Z" \
  "$(echo "$INDEX_TS" | jq -r '.git.created')"
assert_eq "index.ts git.modified = 2024-03-22" \
  "2024-03-22T14:30:00Z" \
  "$(echo "$INDEX_TS" | jq -r '.git.modified')"
GITIGNORE_NODE=$(echo "$OUT" | jq '[.. | objects | select(.name == ".gitignore")] | .[0]')
assert_eq ".gitignore git.created = 2024-01-10" \
  "2024-01-10T09:00:00Z" \
  "$(echo "$GITIGNORE_NODE" | jq -r '.git.created')"

assert_not_empty "logo.png git.created is set" "$(echo "$LOGO" | jq -r '.git.created')"
assert_not_empty "logo.png git.modified is set" "$(echo "$LOGO" | jq -r '.git.modified')"

# ── Section 8: .git directory not present ─────────────────────────────────────
echo ""
echo "Git directory exclusion"

GIT_NODES=$(echo "$OUT" | jq '[.. | objects | select(.name == ".git")] | length')
assert_eq ".git directory not in output" "0" "$GIT_NODES"

# ── Section 9: Depth limit ────────────────────────────────────────────────────
echo ""
echo "Depth limit (DEPTH=1)"

DEPTH_OUT=$(_run_scan --depth 1)
assert_eq "depth=1 root still has 6 children" "6" \
  "$(echo "$DEPTH_OUT" | jq -r '.tree.children_count')"
assert_eq "depth=1 src dir has 0 children (not recursed)" "0" \
  "$(echo "$DEPTH_OUT" | jq -r '.tree.children[] | select(.name == "src") | .children_count')"
assert_eq "depth=1 docs dir has 0 children (not recursed)" "0" \
  "$(echo "$DEPTH_OUT" | jq -r '.tree.children[] | select(.name == "docs") | .children_count')"

# ── Section 10: Include pattern ───────────────────────────────────────────────
echo ""
echo "Include pattern (INCLUDE='*.ts')"

INC_OUT=$(_run_scan --include "*.ts")
INC_FILES=$(echo "$INC_OUT" | jq -r '[.. | objects | select(.type == "file") | .name] | sort | join(",")')

assert_contains     "include *.ts contains index.ts"   "$INC_FILES" "index.ts"
assert_contains     "include *.ts contains utils.ts"   "$INC_FILES" "utils.ts"
assert_not_contains "include *.ts excludes package.json" "$INC_FILES" "package.json"
assert_not_contains "include *.ts excludes logo.png"    "$INC_FILES" "logo.png"
assert_not_contains "include *.ts excludes README.md"   "$INC_FILES" "README.md"

# ── Section 11: Exclude pattern ───────────────────────────────────────────────
echo ""
echo "Exclude pattern (EXCLUDE='*.ts')"

EXC_OUT=$(_run_scan --exclude "*.ts")
EXC_FILES=$(echo "$EXC_OUT" | jq -r '[.. | objects | select(.type == "file") | .name] | sort | join(",")')

assert_not_contains "exclude *.ts removes index.ts"   "$EXC_FILES" "index.ts"
assert_not_contains "exclude *.ts removes utils.ts"   "$EXC_FILES" "utils.ts"
assert_contains     "exclude *.ts keeps package.json" "$EXC_FILES" "package.json"
assert_contains     "exclude *.ts keeps logo.png"     "$EXC_FILES" "logo.png"
assert_contains     "exclude *.ts keeps README.md"    "$EXC_FILES" "README.md"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════"
TOTAL=$((PASS + FAIL))
echo "Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL test(s) failed"
  exit 1
fi
echo "All tests passed."
exit 0
