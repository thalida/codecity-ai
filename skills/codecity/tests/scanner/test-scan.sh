#!/usr/bin/env bash
# test-scan.sh — Integration tests for skills/codecity/scan.sh
#
# Run from any directory:
#   bash skills/codecity/tests/scanner/test-scan.sh
#
# Prerequisites:
#   - bash skills/codecity/tests/scanner/fixtures/setup.sh must have been run first
#   - jq must be available on PATH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SCAN="$SKILL_ROOT/scan.sh"
FIXTURE="$SCRIPT_DIR/fixtures/sample-repo"

PASS=0
FAIL=0

# ── Test framework ────────────────────────────────────────────────────────────
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
  if ! echo "$haystack" | grep -qF "$needle"; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected NOT to contain: $needle)"; FAIL=$((FAIL + 1))
  fi
}

# ── Pre-flight checks ─────────────────────────────────────────────────────────
echo ""
echo "Pre-flight checks"

if [ ! -f "$SCAN" ]; then
  echo "  ERROR: scan.sh not found at $SCAN" >&2
  exit 1
fi

if [ ! -d "$FIXTURE" ]; then
  echo "  ERROR: fixture not found at $FIXTURE" >&2
  echo "  Run: bash src/tests/fixtures/setup.sh" >&2
  exit 1
fi

if ! git -C "$FIXTURE" rev-parse --git-dir >/dev/null 2>&1; then
  echo "  ERROR: fixture is not a git repo. Run: bash tests/fixtures/setup.sh" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "  ERROR: jq is required but not found on PATH" >&2
  exit 1
fi

echo "  ✓ scan.sh found"
echo "  ✓ fixture exists and is a git repo"
echo "  ✓ jq available"

# ── Capture base scan output ──────────────────────────────────────────────────
OUT=$(bash "$SCAN" --root "$FIXTURE" 2>&1)

# ── Section 1: Root node ──────────────────────────────────────────────────────
echo ""
echo "Root node"

assert_eq "root name is sample-repo" \
  "sample-repo" \
  "$(echo "$OUT" | jq -r '.tree.name')"

assert_eq "root type is directory" \
  "directory" \
  "$(echo "$OUT" | jq -r '.tree.type')"

assert_eq "root path is ." \
  "." \
  "$(echo "$OUT" | jq -r '.tree.path')"

assert_eq "root fullPath is fixture absolute path" \
  "$FIXTURE" \
  "$(echo "$OUT" | jq -r '.tree.fullPath')"

# ── Section 2: Manifest fields ────────────────────────────────────────────────
echo ""
echo "Manifest fields"

assert_not_empty "scanned_at is present" \
  "$(echo "$OUT" | jq -r '.scanned_at')"

assert_eq "depth is null (unlimited)" \
  "null" \
  "$(echo "$OUT" | jq -r '.depth')"

assert_eq "root field matches fixture path" \
  "$FIXTURE" \
  "$(echo "$OUT" | jq -r '.root')"

# ── Section 3: Children counts ────────────────────────────────────────────────
echo ""
echo "Children counts"

# Root children: src/, tests/, docs/, package.json, logo.png, .gitignore
assert_eq "root children_count = 6" \
  "6" \
  "$(echo "$OUT" | jq -r '.tree.children_count')"

assert_eq "root children_file_count = 3" \
  "3" \
  "$(echo "$OUT" | jq -r '.tree.children_file_count')"

assert_eq "root children_dir_count = 3" \
  "3" \
  "$(echo "$OUT" | jq -r '.tree.children_dir_count')"

# ── Section 4: Descendants ────────────────────────────────────────────────────
echo ""
echo "Descendants"

# 9 files total, 4 dirs total (docs, src, src/components, tests)
assert_eq "descendants_count = 13" \
  "13" \
  "$(echo "$OUT" | jq -r '.tree.descendants_count')"

assert_eq "descendants_file_count = 9" \
  "9" \
  "$(echo "$OUT" | jq -r '.tree.descendants_file_count')"

assert_eq "descendants_dir_count = 4" \
  "4" \
  "$(echo "$OUT" | jq -r '.tree.descendants_dir_count')"

assert_not_empty "descendants_size is positive" \
  "$(echo "$OUT" | jq -r 'if .tree.descendants_size > 0 then .tree.descendants_size else empty end')"

# ── Section 5: File metadata (index.ts) ───────────────────────────────────────
echo ""
echo "File metadata (src/index.ts)"

INDEX_TS=$(echo "$OUT" | jq '[.. | objects | select(.name == "index.ts")] | .[0]')

assert_eq "index.ts type is file" \
  "file" \
  "$(echo "$INDEX_TS" | jq -r '.type')"

assert_eq "index.ts extension is .ts" \
  ".ts" \
  "$(echo "$INDEX_TS" | jq -r '.extension')"

assert_eq "index.ts binary is false" \
  "false" \
  "$(echo "$INDEX_TS" | jq -r '.binary')"

assert_eq "index.ts lines = 50" \
  "50" \
  "$(echo "$INDEX_TS" | jq -r '.lines')"

assert_not_empty "index.ts size is positive" \
  "$(echo "$INDEX_TS" | jq -r 'if .size > 0 then .size else empty end')"

assert_eq "index.ts path is src/index.ts" \
  "src/index.ts" \
  "$(echo "$INDEX_TS" | jq -r '.path')"

assert_eq "index.ts fullPath ends with sample-repo/src/index.ts" \
  "$FIXTURE/src/index.ts" \
  "$(echo "$INDEX_TS" | jq -r '.fullPath')"

# ── Section 6: Binary detection (logo.png) ────────────────────────────────────
echo ""
echo "Binary detection (logo.png)"

LOGO=$(echo "$OUT" | jq '[.. | objects | select(.name == "logo.png")] | .[0]')

assert_eq "logo.png binary is true" \
  "true" \
  "$(echo "$LOGO" | jq -r '.binary')"

assert_eq "logo.png extension is .png" \
  ".png" \
  "$(echo "$LOGO" | jq -r '.extension')"

# ── Section 7: Git metadata ────────────────────────────────────────────────────
echo ""
echo "Git metadata"

# index.ts was added in commit 2 (2024-03-22)
assert_eq "index.ts git.created = 2024-03-22" \
  "2024-03-22T14:30:00Z" \
  "$(echo "$INDEX_TS" | jq -r '.git.created')"

assert_eq "index.ts git.modified = 2024-03-22" \
  "2024-03-22T14:30:00Z" \
  "$(echo "$INDEX_TS" | jq -r '.git.modified')"

assert_eq "index.ts git.commits = 1" \
  "1" \
  "$(echo "$INDEX_TS" | jq -r '.git.commits')"

assert_contains "index.ts git.contributors includes Test Fixture Bot" \
  "$(echo "$INDEX_TS" | jq -r '.git.contributors | join(",")')" \
  "Test Fixture Bot"

# .gitignore was added in commit 1 (2024-01-10)
GITIGNORE=$(echo "$OUT" | jq '[.. | objects | select(.name == ".gitignore")] | .[0]')
assert_eq ".gitignore git.created = 2024-01-10" \
  "2024-01-10T09:00:00Z" \
  "$(echo "$GITIGNORE" | jq -r '.git.created')"

# git fields present on logo.png too
assert_not_empty "logo.png git.created is set" \
  "$(echo "$LOGO" | jq -r '.git.created')"

assert_not_empty "logo.png git.contributors is non-empty array" \
  "$(echo "$LOGO" | jq -r 'if (.git.contributors | length) > 0 then "ok" else empty end')"

# ── Section 8: .git directory not present ─────────────────────────────────────
echo ""
echo "Git directory exclusion"

GIT_NODES=$(echo "$OUT" | jq '[.. | objects | select(.name == ".git")] | length')
assert_eq ".git directory not in output" \
  "0" \
  "$GIT_NODES"

# ── Section 9: Depth limit ────────────────────────────────────────────────────
echo ""
echo "Depth limit (--depth 1)"

DEPTH_OUT=$(bash "$SCAN" --root "$FIXTURE" --depth 1 2>&1)

assert_eq "depth=1 root still has 6 children" \
  "6" \
  "$(echo "$DEPTH_OUT" | jq -r '.tree.children_count')"

assert_eq "depth=1 src dir has 0 children (not recursed)" \
  "0" \
  "$(echo "$DEPTH_OUT" | jq -r '.tree.children[] | select(.name == "src") | .children_count')"

assert_eq "depth=1 docs dir has 0 children (not recursed)" \
  "0" \
  "$(echo "$DEPTH_OUT" | jq -r '.tree.children[] | select(.name == "docs") | .children_count')"

# ── Section 10: Include pattern ───────────────────────────────────────────────
echo ""
echo "Include pattern (--include '*.ts')"

INC_OUT=$(bash "$SCAN" --root "$FIXTURE" --include "*.ts" 2>&1)
INC_FILES=$(echo "$INC_OUT" | jq -r '[.. | objects | select(.type == "file") | .name] | sort | join(",")')

assert_contains "include *.ts contains index.ts" "$INC_FILES" "index.ts"
assert_contains "include *.ts contains utils.ts" "$INC_FILES" "utils.ts"
assert_not_contains "include *.ts excludes package.json" "$INC_FILES" "package.json"
assert_not_contains "include *.ts excludes logo.png" "$INC_FILES" "logo.png"
assert_not_contains "include *.ts excludes README.md" "$INC_FILES" "README.md"

# ── Section 11: Exclude pattern ───────────────────────────────────────────────
echo ""
echo "Exclude pattern (--exclude '*.ts')"

EXC_OUT=$(bash "$SCAN" --root "$FIXTURE" --exclude "*.ts" 2>&1)
EXC_FILES=$(echo "$EXC_OUT" | jq -r '[.. | objects | select(.type == "file") | .name] | sort | join(",")')

assert_not_contains "exclude *.ts removes index.ts" "$EXC_FILES" "index.ts"
assert_not_contains "exclude *.ts removes utils.ts" "$EXC_FILES" "utils.ts"
assert_contains "exclude *.ts keeps package.json" "$EXC_FILES" "package.json"
assert_contains "exclude *.ts keeps logo.png" "$EXC_FILES" "logo.png"
assert_contains "exclude *.ts keeps README.md" "$EXC_FILES" "README.md"

# ── Section 12: Output to file ────────────────────────────────────────────────
echo ""
echo "Output to file (--output)"

TMPFILE=$(mktemp /tmp/scan-test-XXXXXX.json)
trap 'rm -f "$TMPFILE"' EXIT

bash "$SCAN" --root "$FIXTURE" --output "$TMPFILE" 2>&1
assert_eq "--output writes valid JSON to file" \
  "$FIXTURE" \
  "$(jq -r '.root' "$TMPFILE")"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════"
TOTAL=$((PASS + FAIL))
echo "Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL test(s) failed"
  exit 1
else
  echo "All tests passed."
  exit 0
fi
