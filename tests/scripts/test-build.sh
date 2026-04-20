#!/usr/bin/env bash
# test-build.sh — Integration tests for src/scripts/build.sh (sourced as a library).
#
# Feeds a minimal manifest + config + a fake template into build_html, then
# asserts the three placeholders were replaced and the output is well-formed.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
BUILD_LIB="$REPO_ROOT/src/scripts/build.sh"  # src/scripts/{scan,build}.sh are the sourced libraries

PASS=0; FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"; PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected: $expected, got: $actual)"; FAIL=$((FAIL + 1))
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

[ -f "$BUILD_LIB" ] || { echo "ERROR: $BUILD_LIB not found" >&2; exit 1; }

# shellcheck disable=SC1090
. "$BUILD_LIB"

# Silence build progress logs during tests.
export CODECITY_QUIET=1

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

# ── Inputs ────────────────────────────────────────────────────────────────────
TEMPLATE="$TMPDIR/template.html"
MANIFEST_FILE="$TMPDIR/manifest.json"
CONFIG_FILE="$TMPDIR/config.json"
OUTPUT="$TMPDIR/out.html"

cat > "$TEMPLATE" <<'EOF'
<!DOCTYPE html>
<html><head><title>CodeCity — __PROJECT_NAME__</title></head>
<body>
  <canvas id="city"></canvas>
  <script type="application/json" id="codecity-manifest">__MANIFEST__</script>
  <script type="application/json" id="codecity-config">__CONFIG__</script>
</body></html>
EOF

echo '{"root":"test","tree":{"name":"test","children":[]}}' > "$MANIFEST_FILE"
echo '{"palette":{".ts":215}}' > "$CONFIG_FILE"

# ── Happy path ────────────────────────────────────────────────────────────────
echo ""
echo "build_html: happy path"

build_html "MyProject" "$MANIFEST_FILE" "$CONFIG_FILE" "$TEMPLATE" "$OUTPUT"
OUT=$(cat "$OUTPUT")

assert_contains     "project name substituted" "$OUT" "CodeCity — MyProject"
assert_contains     "canvas id preserved"      "$OUT" 'id="city"'
assert_contains     "manifest embedded"        "$OUT" '"root":"test"'
assert_contains     "config embedded"          "$OUT" '".ts":215'
assert_not_contains "no stray __PROJECT_NAME__" "$OUT" '__PROJECT_NAME__'
assert_not_contains "no stray __MANIFEST__"    "$OUT" '__MANIFEST__'
assert_not_contains "no stray __CONFIG__"      "$OUT" '__CONFIG__'

# ── Script tag wrappers preserved ─────────────────────────────────────────────
echo ""
echo "build_html: script tag wrappers"

assert_contains "codecity-manifest script tag open"  "$OUT" '<script type="application/json" id="codecity-manifest">'
assert_contains "codecity-manifest script tag close" "$OUT" '"root":"test","tree":{"name":"test","children":[]}}</script>'
assert_contains "codecity-config script tag open"    "$OUT" '<script type="application/json" id="codecity-config">'

# ── Special JSON characters survive ───────────────────────────────────────────
echo ""
echo "build_html: JSON with backslashes and ampersands"

cat > "$MANIFEST_FILE" <<'EOF'
{"root":"te\\st","tree":{"name":"a & b","children":[]}}
EOF

build_html "p&amp" "$MANIFEST_FILE" "$CONFIG_FILE" "$TEMPLATE" "$OUTPUT"
OUT=$(cat "$OUTPUT")
assert_contains "backslash preserved" "$OUT" 'te\\st'
assert_contains "ampersand preserved" "$OUT" '"a & b"'

# ── Error paths ───────────────────────────────────────────────────────────────
echo ""
echo "build_html: error paths"

if build_html "" "$MANIFEST_FILE" "$CONFIG_FILE" "$TEMPLATE" "$OUTPUT" 2>/dev/null; then
  echo "  ✗ missing project arg should fail"; FAIL=$((FAIL + 1))
else
  echo "  ✓ missing project arg fails"; PASS=$((PASS + 1))
fi

if build_html "p" "/does/not/exist.json" "$CONFIG_FILE" "$TEMPLATE" "$OUTPUT" 2>/dev/null; then
  echo "  ✗ missing manifest should fail"; FAIL=$((FAIL + 1))
else
  echo "  ✓ missing manifest fails"; PASS=$((PASS + 1))
fi

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════"
TOTAL=$((PASS + FAIL))
echo "Results: $PASS/$TOTAL passed"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: $FAIL test(s) failed"; exit 1
fi
echo "All tests passed."
exit 0
