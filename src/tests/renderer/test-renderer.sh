#!/usr/bin/env bash
# test-renderer.sh — Automated unit tests for src/renderer/*.js
#
# Run from any directory:
#   bash src/tests/renderer/test-renderer.sh
#
# Strategy:
#   1. Concatenate all renderer JS files into a temp file.
#   2. Append JS test assertions that call the pure logic functions.
#   3. Run the combined file with Node.js.
#   4. Report pass/fail and exit non-zero on any failure.
#
# Prerequisites:
#   - node must be available on PATH

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
RENDERER_DIR="$REPO_ROOT/src/renderer"

# ── Pre-flight checks ──────────────────────────────────────────────────────────
echo ""
echo "Pre-flight checks"

if ! command -v node >/dev/null 2>&1; then
  echo "  ERROR: node is required but not found on PATH" >&2
  exit 1
fi

for f in engine.js colors.js layout.js sidebar.js interactions.js; do
  if [ ! -f "$RENDERER_DIR/$f" ]; then
    echo "  ERROR: $f not found at $RENDERER_DIR/$f" >&2
    exit 1
  fi
done

echo "  ✓ node available"
echo "  ✓ all renderer JS files found"

# ── Build temp test file ───────────────────────────────────────────────────────
TMPFILE=$(mktemp /tmp/renderer-test-XXXXXX.js)
trap 'rm -f "$TMPFILE"' EXIT

# Concatenate renderer source files in the correct load order.
# Wrap in a function scope to avoid Node.js strict mode issues with 'var' redeclaration,
# but keep function declarations hoisted by using an IIFE wrapper only around the source.
cat \
  "$RENDERER_DIR/engine.js" \
  "$RENDERER_DIR/colors.js" \
  "$RENDERER_DIR/layout.js" \
  "$RENDERER_DIR/sidebar.js" \
  "$RENDERER_DIR/interactions.js" \
  > "$TMPFILE"

# ── Append test harness ────────────────────────────────────────────────────────
cat >> "$TMPFILE" <<'EOF'

// =============================================================================
// Test harness — appended by test-renderer.sh
// =============================================================================

var PASS = 0, FAIL = 0;

function assert_eq(desc, expected, actual) {
  if (JSON.stringify(expected) === JSON.stringify(actual)) {
    console.log('  \u2713 ' + desc); PASS++;
  } else {
    console.log('  \u2717 ' + desc + ' (expected: ' + JSON.stringify(expected) + ', got: ' + JSON.stringify(actual) + ')'); FAIL++;
  }
}

function assert_true(desc, value) {
  if (value) {
    console.log('  \u2713 ' + desc); PASS++;
  } else {
    console.log('  \u2717 ' + desc + ' (expected truthy, got: ' + JSON.stringify(value) + ')'); FAIL++;
  }
}

function assert_near(desc, expected, actual, tolerance) {
  var tol = tolerance || 0.001;
  if (Math.abs(expected - actual) <= tol) {
    console.log('  \u2713 ' + desc); PASS++;
  } else {
    console.log('  \u2717 ' + desc + ' (expected ~' + expected + ', got: ' + actual + ')'); FAIL++;
  }
}

// ── Shared test data ──────────────────────────────────────────────────────────

var CONFIG = {
  street_tiers: [3, 8, 15, 30],
  building: { min_height: 4, max_height: 120, min_width: 6, max_width: 40 },
  saturation: { min: 20, max: 100 },
  lightness:  { min: 25, max: 70  },
  palette: { ".ts": 215, ".js": 220, ".md": 275, ".json": 50, ".png": 30 }
};

var TEST_TREE = {
  name: "project", type: "directory", path: ".", fullPath: "/tmp/project",
  children_count: 3, children_file_count: 2, children_dir_count: 1,
  descendants_count: 4, descendants_file_count: 3, descendants_dir_count: 1,
  descendants_size: 5000,
  children: [
    { name: "index.ts", type: "file", path: "index.ts", fullPath: "/tmp/project/index.ts",
      extension: ".ts", size: 2000, lines: 80, binary: false,
      created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z",
      git: { created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z", commits: 5, contributors: ["alice"] } },
    { name: "README.md", type: "file", path: "README.md", fullPath: "/tmp/project/README.md",
      extension: ".md", size: 500, lines: 20, binary: false,
      created: "2024-01-10T09:00:00Z", modified: "2024-01-10T09:00:00Z",
      git: { created: "2024-01-10T09:00:00Z", modified: "2024-01-10T09:00:00Z", commits: 1, contributors: ["alice"] } },
    { name: "src", type: "directory", path: "src", fullPath: "/tmp/project/src",
      children_count: 1, children_file_count: 1, children_dir_count: 0,
      descendants_count: 1, descendants_file_count: 1, descendants_dir_count: 0,
      descendants_size: 800,
      children: [
        { name: "utils.ts", type: "file", path: "src/utils.ts", fullPath: "/tmp/project/src/utils.ts",
          extension: ".ts", size: 800, lines: 30, binary: false,
          created: "2024-02-15T10:00:00Z", modified: "2024-03-20T12:00:00Z",
          git: { created: "2024-02-15T10:00:00Z", modified: "2024-03-20T12:00:00Z", commits: 3, contributors: ["bob"] } }
      ] }
  ]
};

// =============================================================================
// Section 1: isoProject — coordinate transforms
// =============================================================================
console.log("\nisoProject");

var p0 = isoProject(0, 0, 0);
assert_eq("origin maps to (0, 0)", {sx: 0, sy: 0}, p0);

var px = isoProject(10, 0, 0);
assert_near("x=10 → sx ≈ 8.660", 8.660, px.sx);
assert_near("x=10 → sy ≈ 5.000", 5.000, px.sy);

var py = isoProject(0, 10, 0);
assert_near("y=10 → sx ≈ -8.660", -8.660, py.sx);
assert_near("y=10 → sy ≈ 5.000",  5.000,  py.sy);

var pz = isoProject(0, 0, 10);
assert_near("z=10 → sx = 0",   0,   pz.sx);
assert_near("z=10 → sy = -10", -10, pz.sy);

// Combined: diagonal x=y cancels sx, doubles sy contribution
var pxy = isoProject(5, 5, 0);
assert_near("x=5,y=5 → sx ≈ 0", 0, pxy.sx, 0.001);
assert_near("x=5,y=5 → sy ≈ 5", 5, pxy.sy, 0.001);

// =============================================================================
// Section 2: hslToComponents — HSL string parsing
// =============================================================================
console.log("\nhslToComponents");

var c1 = hslToComponents("hsl(210, 80%, 50%)");
assert_eq("parses hue correctly",        210, c1.h);
assert_eq("parses saturation correctly",  80, c1.s);
assert_eq("parses lightness correctly",   50, c1.l);

var c2 = hslToComponents("hsl(0, 0%, 100%)");
assert_eq("hue 0", 0, c2.h);
assert_eq("sat 0", 0, c2.s);
assert_eq("light 100", 100, c2.l);

// Case-insensitive prefix
var c3 = hslToComponents("HSL(120, 50%, 30%)");
assert_eq("case-insensitive prefix: hue 120", 120, c3.h);

// =============================================================================
// Section 3: componentsToHsl — HSL string formatting
// =============================================================================
console.log("\ncomponentsToHsl");

assert_eq("formats integer hue", "hsl(210, 80.0%, 50.0%)", componentsToHsl(210, 80, 50));
assert_eq("rounds fractional hue", "hsl(210, 80.0%, 50.0%)", componentsToHsl(210.4, 80, 50));
assert_eq("one decimal place on sat/light", "hsl(0, 0.0%, 100.0%)", componentsToHsl(0, 0, 100));

// =============================================================================
// Section 4: shadeColor — lightness adjustment
// =============================================================================
console.log("\nshadeColor");

assert_eq("darkens by 30",  "hsl(210, 80.0%, 20.0%)", shadeColor("hsl(210, 80%, 50%)", -30));
assert_eq("lightens by 30", "hsl(210, 80.0%, 80.0%)", shadeColor("hsl(210, 80%, 50%)", 30));
assert_eq("clamps to 0 at bottom", "hsl(210, 80.0%, 0.0%)", shadeColor("hsl(210, 80%, 5%)", -30));
assert_eq("clamps to 100 at top",  "hsl(210, 80.0%, 100.0%)", shadeColor("hsl(210, 80%, 95%)", 30));
assert_eq("zero amount preserves color", "hsl(210, 80.0%, 50.0%)", shadeColor("hsl(210, 80%, 50%)", 0));

// =============================================================================
// Section 5: getHue — palette lookup and hash fallback
// =============================================================================
console.log("\ngetHue");

assert_eq("palette .ts → 215",   215, getHue(".ts",  CONFIG.palette));
assert_eq("palette .js → 220",   220, getHue(".js",  CONFIG.palette));
assert_eq("palette .md → 275",   275, getHue(".md",  CONFIG.palette));
assert_eq("palette .json → 50",   50, getHue(".json", CONFIG.palette));
assert_eq("palette .png → 30",    30, getHue(".png",  CONFIG.palette));

// Hash fallback for unknown extensions
var hueXyz = getHue(".xyz", CONFIG.palette);
assert_true("hash fallback .xyz is in [0, 359]", hueXyz >= 0 && hueXyz <= 359);
assert_eq("hash fallback .xyz is deterministic (259)", 259, hueXyz);

// Same call twice → same result (determinism)
assert_eq("hash fallback is deterministic (same call twice)",
  getHue(".xyz", CONFIG.palette),
  getHue(".xyz", CONFIG.palette));

// Empty extension does not crash
var hueEmpty = getHue("", CONFIG.palette);
assert_true("empty extension returns number", typeof hueEmpty === "number");

// =============================================================================
// Section 6: getSaturation — linear interpolation by creation date
// =============================================================================
console.log("\ngetSaturation");

var satCfg = CONFIG.saturation;  // { min: 20, max: 100 }

// index.ts created 2024-01-10 = createdMin → t=0 → min saturation
assert_eq("oldest file gets min saturation (20)",
  20,
  getSaturation("2024-01-10T09:00:00Z", "2024-01-10T09:00:00Z", "2024-02-15T10:00:00Z", satCfg));

// utils.ts created 2024-02-15 = createdMax → t=1 → max saturation
assert_eq("newest file gets max saturation (100)",
  100,
  getSaturation("2024-02-15T10:00:00Z", "2024-01-10T09:00:00Z", "2024-02-15T10:00:00Z", satCfg));

// Null date fallback → 60
assert_eq("null date → 60 fallback", 60, getSaturation(null, "2024-01-10T09:00:00Z", "2024-02-15T10:00:00Z", satCfg));

// Degenerate range (min === max) → max saturation
assert_eq("degenerate range → max saturation (100)",
  100,
  getSaturation("2024-01-10T09:00:00Z", "2024-01-10T09:00:00Z", "2024-01-10T09:00:00Z", satCfg));

// =============================================================================
// Section 7: getLightness — linear interpolation by modified date
// =============================================================================
console.log("\ngetLightness");

var litCfg = CONFIG.lightness;  // { min: 25, max: 70 }

// index.ts modified 2024-03-22 = modifiedMax → t=1 → max lightness
assert_eq("most-recently modified gets max lightness (70)",
  70,
  getLightness("2024-03-22T14:30:00Z", "2024-01-10T09:00:00Z", "2024-03-22T14:30:00Z", litCfg));

// README.md modified 2024-01-10 = modifiedMin → t=0 → min lightness
assert_eq("longest-untouched gets min lightness (25)",
  25,
  getLightness("2024-01-10T09:00:00Z", "2024-01-10T09:00:00Z", "2024-03-22T14:30:00Z", litCfg));

// Null date fallback → 45
assert_eq("null date → 45 fallback", 45, getLightness(null, "2024-01-10T09:00:00Z", "2024-03-22T14:30:00Z", litCfg));

// Degenerate range → max
assert_eq("degenerate range → max lightness (70)",
  70,
  getLightness("2024-01-10T09:00:00Z", "2024-01-10T09:00:00Z", "2024-01-10T09:00:00Z", litCfg));

// =============================================================================
// Section 8: getBuildingColor — full pipeline
// =============================================================================
console.log("\ngetBuildingColor");

var dateRanges = getDateRanges(TEST_TREE);

// index.ts: .ts hue=215, created=oldest(sat=20), modified=newest(light=70)
var colorIndexTs = getBuildingColor(TEST_TREE.children[0], CONFIG.palette, dateRanges, CONFIG);
assert_eq("index.ts color has hue 215", "hsl(215, 20%, 70%)", colorIndexTs);

// README.md: .md hue=275, created=oldest(sat=20), modified=oldest(light=25)
var colorReadme = getBuildingColor(TEST_TREE.children[1], CONFIG.palette, dateRanges, CONFIG);
assert_eq("README.md color has hue 275", "hsl(275, 20%, 25%)", colorReadme);

// Color output is a valid HSL string pattern
assert_true("output matches hsl(...) pattern", /^hsl\(\d+, \d+%, \d+%\)$/.test(colorIndexTs));

// Unknown extension: hash fallback still produces a valid HSL string
var unknownFile = { name: "foo.xyz", type: "file", extension: ".xyz", size: 1000, lines: 10,
  git: { created: "2024-01-10T09:00:00Z", modified: "2024-03-22T14:30:00Z" } };
var colorUnknown = getBuildingColor(unknownFile, CONFIG.palette, dateRanges, CONFIG);
assert_true("unknown extension produces valid HSL", /^hsl\(/.test(colorUnknown));

// =============================================================================
// Section 9: getDateRanges — min/max extraction from tree
// =============================================================================
console.log("\ngetDateRanges");

var dr = getDateRanges(TEST_TREE);
assert_eq("createdMin is earliest git.created",  "2024-01-10T09:00:00Z", dr.createdMin);
assert_eq("createdMax is latest git.created",    "2024-02-15T10:00:00Z", dr.createdMax);
assert_eq("modifiedMin is earliest git.modified","2024-01-10T09:00:00Z", dr.modifiedMin);
assert_eq("modifiedMax is latest git.modified",  "2024-03-22T14:30:00Z", dr.modifiedMax);

// Single-file tree returns that file's dates as both min and max
var singleTree = {
  name: "root", type: "directory", path: ".",
  children: [
    { name: "only.ts", type: "file", extension: ".ts",
      created: "2024-06-01T00:00:00Z", modified: "2024-06-15T00:00:00Z",
      git: { created: "2024-06-01T00:00:00Z", modified: "2024-06-15T00:00:00Z" } }
  ]
};
var drSingle = getDateRanges(singleTree);
assert_eq("single file: createdMin equals createdMax",   drSingle.createdMin,  drSingle.createdMax);
assert_eq("single file: modifiedMin equals modifiedMax", drSingle.modifiedMin, drSingle.modifiedMax);

// Empty tree returns all nulls
var drEmpty = getDateRanges({ name: "root", type: "directory", children: [] });
assert_eq("empty tree: createdMin is null",  null, drEmpty.createdMin);
assert_eq("empty tree: modifiedMax is null", null, drEmpty.modifiedMax);

// =============================================================================
// Section 10: getStreetTier — threshold classification
// =============================================================================
console.log("\ngetStreetTier");

var tiers = CONFIG.street_tiers;  // [3, 8, 15, 30]

assert_eq("count 0 → tier 1",  1, getStreetTier(0,  tiers));
assert_eq("count 3 → tier 1",  1, getStreetTier(3,  tiers));
assert_eq("count 4 → tier 2",  2, getStreetTier(4,  tiers));
assert_eq("count 5 → tier 2",  2, getStreetTier(5,  tiers));
assert_eq("count 8 → tier 2",  2, getStreetTier(8,  tiers));
assert_eq("count 9 → tier 3",  3, getStreetTier(9,  tiers));
assert_eq("count 15 → tier 3", 3, getStreetTier(15, tiers));
assert_eq("count 16 → tier 4", 4, getStreetTier(16, tiers));
assert_eq("count 30 → tier 4", 4, getStreetTier(30, tiers));
assert_eq("count 31 → tier 5", 5, getStreetTier(31, tiers));
assert_eq("count 100 → tier 5", 5, getStreetTier(100, tiers));

// =============================================================================
// Section 11: getStreetWidth — tier to pixel width
// =============================================================================
console.log("\ngetStreetWidth");

assert_eq("tier 1 → 4px",  4,  getStreetWidth(1));
assert_eq("tier 2 → 8px",  8,  getStreetWidth(2));
assert_eq("tier 3 → 14px", 14, getStreetWidth(3));
assert_eq("tier 4 → 22px", 22, getStreetWidth(4));
assert_eq("tier 5 → 32px", 32, getStreetWidth(5));

// Clamps out-of-range inputs
assert_eq("tier 0 clamps to 1 → 4px",  4,  getStreetWidth(0));
assert_eq("tier 6 clamps to 5 → 32px", 32, getStreetWidth(6));

// =============================================================================
// Section 12: getBuildingDimensions — log scaling and clamping
// =============================================================================
console.log("\ngetBuildingDimensions");

// File with no data → minimum dimensions
var dimMin = getBuildingDimensions({ lines: null, size: null }, CONFIG);
assert_eq("null lines/size → min height (4)", 4, dimMin.height);
assert_eq("null lines/size → min width (6)",  6, dimMin.width);

// File with 80 lines and 2000 bytes
var dim80 = getBuildingDimensions({ lines: 80, size: 2000 }, CONFIG);
assert_true("80 lines → height > min (4)",        dim80.height > 4);
assert_true("80 lines → height < max (120)",       dim80.height < 120);
assert_true("2000 bytes → width > min (6)",        dim80.width  > 6);
assert_true("2000 bytes → width < max (40)",       dim80.width  < 40);
assert_eq("depth = (height + width) / 2 rounded",
  Math.round((dim80.height + dim80.width) / 2 * 10) / 10,
  dim80.depth);

// Maximum reference values → clamped to max dimensions
var dimMax = getBuildingDimensions({ lines: 100000, size: 10 * 1024 * 1024 }, CONFIG);
assert_eq("100k lines → max height (120)", 120, dimMax.height);
assert_eq("10MB → max width (40)",          40,  dimMax.width);
assert_eq("max depth = (120+40)/2 = 80",    80,  dimMax.depth);

// Zero lines treated as 1 (no -Infinity from log(0))
var dimZero = getBuildingDimensions({ lines: 0, size: 0 }, CONFIG);
assert_eq("zero lines → min height (4)", 4, dimZero.height);
assert_eq("zero size → min width (6)",   6, dimZero.width);

// =============================================================================
// Section 13: layoutCity — structure and correctness
// =============================================================================
console.log("\nlayoutCity");

var layout = layoutCity({ tree: TEST_TREE }, CONFIG);

assert_true("returns blocks array",    Array.isArray(layout.blocks));
assert_true("returns buildings array", Array.isArray(layout.buildings));
assert_true("has at least 1 block",    layout.blocks.length >= 1);
assert_eq("3 file buildings total",   3, layout.buildings.length);

// All buildings start with 'placeholder' color
assert_true("all buildings start as placeholder",
  layout.buildings.every(function(b) { return b.color === 'placeholder'; }));

// All buildings have required fields
assert_true("all buildings have cx",     layout.buildings.every(function(b) { return typeof b.cx === 'number'; }));
assert_true("all buildings have cy",     layout.buildings.every(function(b) { return typeof b.cy === 'number'; }));
assert_true("all buildings have width",  layout.buildings.every(function(b) { return typeof b.width === 'number'; }));
assert_true("all buildings have depth",  layout.buildings.every(function(b) { return typeof b.depth === 'number'; }));
assert_true("all buildings have height", layout.buildings.every(function(b) { return typeof b.height === 'number'; }));
assert_true("all buildings have file",   layout.buildings.every(function(b) { return !!b.file; }));
assert_true("all buildings have hitBox", layout.buildings.every(function(b) { return !!b.hitBox; }));

// hitBox has required geometry fields
assert_true("hitBox has x",      layout.buildings.every(function(b) { return typeof b.hitBox.x === 'number'; }));
assert_true("hitBox has y",      layout.buildings.every(function(b) { return typeof b.hitBox.y === 'number'; }));
assert_true("hitBox has width",  layout.buildings.every(function(b) { return b.hitBox.width > 0; }));
assert_true("hitBox has height", layout.buildings.every(function(b) { return b.hitBox.height > 0; }));

// All blocks have geometry fields
assert_true("all blocks have cx",         layout.blocks.every(function(b) { return typeof b.cx === 'number'; }));
assert_true("all blocks have blockWidth", layout.blocks.every(function(b) { return b.blockWidth > 0; }));
assert_true("all blocks have blockDepth", layout.blocks.every(function(b) { return b.blockDepth > 0; }));
assert_true("all blocks have dir",        layout.blocks.every(function(b) { return !!b.dir; }));

// =============================================================================
// Section 14: sortForRendering — painter's algorithm ordering
// =============================================================================
console.log("\nsortForRendering");

var unsorted = [
  { cx:  5, cy:  5, id: 'close' },  // sum = 10 (front, drawn last)
  { cx: 20, cy: 20, id: 'far'   },  // sum = 40 (back, drawn first)
  { cx: 10, cy: 10, id: 'mid'   },  // sum = 20
];
var sorted = sortForRendering(unsorted);

assert_eq("back-most building is first in sorted array", 'far',   sorted[0].id);
assert_eq("mid building is second",                      'mid',   sorted[1].id);
assert_eq("front-most building is last in sorted array", 'close', sorted[2].id);

// Input array must not be mutated
assert_eq("original array first element unchanged", 'close', unsorted[0].id);

// Single element
var single = sortForRendering([{ cx: 0, cy: 0 }]);
assert_eq("single element sort", 1, single.length);

// Empty array
var empty = sortForRendering([]);
assert_eq("empty array sort", 0, empty.length);

// =============================================================================
// Section 15: formatBytes — human-readable byte formatting (pure, from sidebar.js)
// =============================================================================
console.log("\nformatBytes");

assert_eq("0 bytes",       "0 B",   formatBytes(0));
assert_eq("512 bytes",     "512 B", formatBytes(512));
assert_eq("1023 bytes",    "1023 B", formatBytes(1023));
assert_eq("1024 bytes → KB", "1.0 KB", formatBytes(1024));
assert_eq("2048 bytes → KB", "2.0 KB", formatBytes(2048));
assert_eq("1 MB",          "1.0 MB", formatBytes(1048576));
assert_eq("2 MB",          "2.0 MB", formatBytes(2097152));

// =============================================================================
// Section 16: CRITICAL integration — color assignment loop
//
// This tests the critical integration point: that after layoutCity produces
// buildings with 'placeholder' colors, and after the color assignment loop
// from startRenderLoop runs, every building gets a valid HSL string and none
// remain as 'placeholder'.
// =============================================================================
console.log("\nCRITICAL integration: color assignment loop");

var intLayout    = layoutCity({ tree: TEST_TREE }, CONFIG);
var intBuildings = sortForRendering(intLayout.buildings);
var intRanges    = getDateRanges(TEST_TREE);
var intPalette   = CONFIG.palette || {};

// Replicate the color assignment loop from startRenderLoop in interactions.js
for (var ci = 0; ci < intBuildings.length; ci++) {
  var cb = intBuildings[ci];
  if (cb.file && cb.file.type === 'file') {
    cb.color = getBuildingColor(cb.file, intPalette, intRanges, CONFIG);
  } else {
    cb.color = 'hsl(220, 15%, 25%)';
  }
}

assert_true("no buildings have placeholder color after assignment loop",
  !intBuildings.some(function(b) { return b.color === 'placeholder'; }));

assert_true("all buildings have valid HSL color after assignment loop",
  intBuildings.every(function(b) { return /^hsl\(/.test(b.color); }));

// Verify specific expected colors
var tsBuildings = intBuildings.filter(function(b) { return b.file && b.file.extension === '.ts'; });
assert_true("all .ts buildings have hue 215 in color", tsBuildings.every(function(b) {
  return b.color.startsWith('hsl(215,');
}));

var mdBuildings = intBuildings.filter(function(b) { return b.file && b.file.extension === '.md'; });
assert_true("all .md buildings have hue 275 in color", mdBuildings.every(function(b) {
  return b.color.startsWith('hsl(275,');
}));

// =============================================================================
// Section 17: DOM-dependent functions — smoke test with minimal mocks
//
// These functions require DOM/canvas. We provide minimal mocks so they don't
// throw. We don't assert rendering correctness — just that they don't crash.
// =============================================================================
console.log("\nDOM-dependent functions (mock smoke tests)");

// Minimal canvas context mock
var mockCtx = {
  beginPath: function() {}, moveTo: function() {}, lineTo: function() {},
  closePath: function() {}, fill: function() {}, stroke: function() {},
  clearRect: function() {}, save: function() {}, restore: function() {},
  translate: function() {}, scale: function() {},
  fillStyle: '', strokeStyle: '', lineWidth: 1
};

// drawBuilding
var threw = false;
try {
  drawBuilding(mockCtx, 0, 0, 20, 20, 50, 'hsl(215, 80%, 50%)');
} catch(e) { threw = true; }
assert_eq("drawBuilding does not throw with mock ctx", false, threw);

// drawBuilding with tall building (triggers window drawing path)
threw = false;
try {
  drawBuilding(mockCtx, 0, 0, 30, 30, 80, 'hsl(215, 80%, 50%)');
} catch(e) { threw = true; }
assert_eq("drawBuilding (with windows) does not throw with mock ctx", false, threw);

// drawGround
threw = false;
try {
  drawGround(mockCtx, 0, 0, 40, 40, 'rgba(18,24,40,0.95)', 'rgba(60,80,120,0.4)');
} catch(e) { threw = true; }
assert_eq("drawGround does not throw with mock ctx", false, threw);

// drawGround with null fill/stroke
threw = false;
try {
  drawGround(mockCtx, 0, 0, 40, 40, null, null);
} catch(e) { threw = true; }
assert_eq("drawGround with null fill/stroke does not throw", false, threw);

// hitTest (pure logic, no DOM needed — uses hitBox from layout)
var mockBuildings = [
  { cx: 0, cy: 0, hitBox: { x: -50, y: -50, width: 100, height: 100 }, file: { name: 'foo.ts' } }
];
var hit = hitTest(0, 0, mockBuildings, 1, 0, 0, 100, 100);
assert_true("hitTest finds building at center", hit !== null);
assert_eq("hitTest returns correct building", 'foo.ts', hit.file.name);

var miss = hitTest(200, 200, mockBuildings, 1, 0, 0, 100, 100);
assert_eq("hitTest returns null for miss", null, miss);

// =============================================================================
// =============================================================================
// INTEGRATION TESTS — Cross-module interface contracts
// These test that module A's output is compatible with module B's input.
// Every bug found in E2E verification was a cross-module mismatch that unit
// tests missed because they tested functions in isolation.
// =============================================================================

console.log("\n18. Integration: layoutCity → interactions renderCity contract");

// layoutCity must produce buildings with screenX/screenY (not just cx/cy)
// because interactions.js renderCity reads bld.screenX / bld.screenY
var intLayout = layoutCity(TEST_TREE, CONFIG);
var intBuildings = intLayout.buildings;
var intBlocks = intLayout.blocks;

for (var ib = 0; ib < intBuildings.length; ib++) {
  var bld = intBuildings[ib];
  assert_eq(
    "building[" + ib + "] has screenX (not undefined)",
    true,
    typeof bld.screenX === 'number' && !isNaN(bld.screenX)
  );
  assert_eq(
    "building[" + ib + "] has screenY (not undefined)",
    true,
    typeof bld.screenY === 'number' && !isNaN(bld.screenY)
  );
}

for (var ig = 0; ig < intBlocks.length; ig++) {
  var blk = intBlocks[ig];
  assert_eq(
    "block[" + ig + "] has screenX (not undefined)",
    true,
    typeof blk.screenX === 'number' && !isNaN(blk.screenX)
  );
  assert_eq(
    "block[" + ig + "] has screenY (not undefined)",
    true,
    typeof blk.screenY === 'number' && !isNaN(blk.screenY)
  );
  assert_eq(
    "block[" + ig + "] has width (not undefined)",
    true,
    typeof blk.width === 'number' && blk.width > 0
  );
  assert_eq(
    "block[" + ig + "] has depth (not undefined)",
    true,
    typeof blk.depth === 'number' && blk.depth > 0
  );
}

console.log("\n19. Integration: layoutCity → getBuildingColor contract");

// After layoutCity, the color assignment loop (from interactions.js startRenderLoop)
// must produce valid HSL colors for every building — NOT 'placeholder'
var intDateRanges = getDateRanges(TEST_TREE);
var intPalette = CONFIG.palette || {};

for (var ic = 0; ic < intBuildings.length; ic++) {
  var cb = intBuildings[ic];
  if (cb.file && cb.file.type === 'file') {
    cb.color = getBuildingColor(cb.file, intPalette, intDateRanges, CONFIG);
  } else {
    cb.color = 'hsl(220, 15%, 25%)';
  }
  assert_eq(
    "building[" + ic + "] color is valid HSL (not placeholder)",
    true,
    typeof cb.color === 'string' && cb.color.indexOf('hsl(') === 0
  );
}

console.log("\n20. Integration: building.file has .type for click handling");

// interactions.js handleClick checks hit.file.type === 'directory' or 'file'
// Every building must have file.type set
for (var id = 0; id < intBuildings.length; id++) {
  var db = intBuildings[id];
  assert_eq(
    "building[" + id + "] has file.type",
    true,
    db.file && (db.file.type === 'file' || db.file.type === 'directory')
  );
}

console.log("\n21. Integration: sortForRendering preserves required properties");

var sorted = sortForRendering(intBuildings);
for (var is = 0; is < sorted.length; is++) {
  var sb = sorted[is];
  assert_eq("sorted[" + is + "] has screenX", true, typeof sb.screenX === 'number');
  assert_eq("sorted[" + is + "] has screenY", true, typeof sb.screenY === 'number');
  assert_eq("sorted[" + is + "] has color", true, typeof sb.color === 'string');
  assert_eq("sorted[" + is + "] has file", true, sb.file !== undefined);
}

console.log("\n22. Integration: HTML test files reference valid paths");

// This runs in bash below — see the path validation section after EOF

// Summary
// =============================================================================
console.log("\n" + "=".repeat(36));
var total = PASS + FAIL;
console.log("Results: " + PASS + "/" + total + " passed");
if (FAIL > 0) {
  console.log("FAIL: " + FAIL + " test(s) failed");
  process.exit(1);
} else {
  console.log("All tests passed.");
  process.exit(0);
}
EOF

# ── Run the Node tests ─────────────────────────────────────────────────────────
node "$TMPFILE"
NODE_EXIT=$?

# ── HTML path validation ──────────────────────────────────────────────────────
echo ""
echo "22. Integration: HTML test files reference valid paths"
HTML_PASS=0
HTML_FAIL=0

for html_file in "$SCRIPT_DIR"/test-city.html "$SCRIPT_DIR"/test-engine.html; do
  if [ ! -f "$html_file" ]; then continue; fi
  html_dir="$(dirname "$html_file")"
  html_name="$(basename "$html_file")"

  # Extract all src= and href= paths (relative only, skip http/https)
  refs=$(grep -oE '(src|href)="[^"]*"' "$html_file" | grep -v 'http' | sed 's/.*="\(.*\)"/\1/')

  for ref in $refs; do
    resolved="$html_dir/$ref"
    if [ -f "$resolved" ]; then
      echo "  ✓ $html_name: $ref exists"
      HTML_PASS=$((HTML_PASS + 1))
    else
      echo "  ✗ $html_name: $ref NOT FOUND (resolved to $resolved)"
      HTML_FAIL=$((HTML_FAIL + 1))
    fi
  done
done

echo ""
echo "HTML path results: $HTML_PASS passed, $HTML_FAIL failed"

if [ "$HTML_FAIL" -gt 0 ] || [ "$NODE_EXIT" -ne 0 ]; then
  exit 1
fi
