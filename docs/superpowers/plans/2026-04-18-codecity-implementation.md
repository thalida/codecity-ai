# CodeCity AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform AI skill that scans a local folder/repo and generates a self-contained isometric 2.5D code city HTML visualization.

**Architecture:** Skill-driven assembly — a portable shell scanner produces a JSON manifest, pre-built JS/CSS renderer modules handle visualization, and the SKILL.md orchestrates the agent to assemble everything into a single HTML file. Platform adapters at the repo root make the skill discoverable by Claude Code, Cursor, Codex, OpenCode, and Gemini.

**Tech Stack:** Shell (POSIX + OS detection), vanilla JavaScript (Canvas 2D), CSS, JSON config. Zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-04-18-codecity-design.md`

---

## File Map

| File | Responsibility |
|------|---------------|
| `src/scanner/scan.sh` | Portable shell script: walks filesystem, collects stats + git metadata, outputs JSON manifest |
| `src/renderer/engine.js` | Isometric projection math, building/ground drawing primitives |
| `src/renderer/colors.js` | HSL color system: hue from extension, saturation from age, lightness from modified date |
| `src/renderer/layout.js` | Grid layout algorithm: positions blocks, streets, buildings from manifest tree |
| `src/renderer/sidebar.js` | Click-to-select slide-out detail panel for files and directories |
| `src/renderer/interactions.js` | Pan, zoom, click hit-testing, hover cursor |
| `src/renderer/styles.css` | Dark theme, sidebar layout, typography, canvas sizing |
| `src/config/defaults.json` | Default palette, street tiers, building bounds, output path |
| `src/skills/codecity/SKILL.md` | Agent instructions: clarify → scan → read modules → assemble HTML → write output |
| `.claude-plugin/plugin.json` | Claude Code plugin metadata |
| `.cursor-plugin/plugin.json` | Cursor plugin metadata |
| `.opencode/plugins/codecity.js` | OpenCode bootstrap plugin |
| `gemini-extension.json` | Gemini extension config |
| `GEMINI.md` | Gemini context file referenced by gemini-extension.json |
| `docs/README.codex.md` | Codex install instructions |
| `.gitignore` | Ignore .superpowers/, node_modules, .codecity output |
| `tests/scanner/test-scan.sh` | Scanner integration tests against a fixture directory |
| `tests/fixtures/setup.sh` | Script that generates the sample-repo fixture (needed because fixture must be a git repo with deterministic commit history — you can't commit a .git dir inside another git repo) |
| `tests/fixtures/sample-repo/` | Generated (not committed) — known directory structure for testing scanner output |

---

### Task 1: Repo Scaffolding

**Files:**
- Create: `.gitignore`
- Create: `src/config/defaults.json`

- [ ] **Step 1: Create .gitignore**

```
# Output
.codecity/

# Brainstorm artifacts
.superpowers/

# OS
.DS_Store
Thumbs.db

# Editors
*.swp
*.swo
*~
.idea/
.vscode/
```

- [ ] **Step 2: Create defaults.json**

```json
{
  "output_dir": "~/.codecity",
  "depth": null,
  "gitignore": true,
  "street_tiers": [3, 8, 15, 30],
  "building": {
    "min_height": 4,
    "max_height": 120,
    "min_width": 6,
    "max_width": 40
  },
  "saturation": { "min": 20, "max": 100 },
  "lightness": { "min": 25, "max": 70 },
  "palette": {
    ".js": 220, ".ts": 215, ".jsx": 225, ".tsx": 210, ".mjs": 220,
    ".py": 15, ".pyx": 20, ".pyi": 10,
    ".css": 150, ".scss": 145, ".less": 155, ".sass": 148,
    ".html": 175, ".vue": 170, ".svelte": 180,
    ".json": 50, ".yaml": 55, ".toml": 45, ".ini": 52,
    ".md": 275, ".txt": 280, ".rst": 270,
    ".sh": 35, ".bash": 38, ".zsh": 32,
    ".go": 185, ".rs": 5
  }
}
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p src/skills/codecity src/scanner src/renderer src/config tests/scanner tests/fixtures/sample-repo
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore src/config/defaults.json
git commit -m "chore: scaffold repo structure and defaults config"
```

---

### Task 2: Test Fixtures

**Why a setup script instead of committed files:** The fixture must be a real git repo with deterministic commit history (specific dates, commit counts, contributors) so we can test the scanner's git metadata extraction. Git doesn't allow committing a `.git/` directory inside another git repo, so we generate the fixture via script. The `sample-repo/` directory is `.gitignore`d — only the setup script is committed.

**Files:**
- Create: `tests/fixtures/setup.sh` (committed — generates the fixture)
- Generated: `tests/fixtures/sample-repo/` (not committed — in .gitignore)

- [ ] **Step 1: Create `tests/fixtures/setup.sh`**

The script must:
- Wipe and recreate `sample-repo/` on each run (idempotent)
- Set git identity to `Test Fixture Bot <fixture-bot@codecity.test>`
- Create the directory structure below with **plain TypeScript** content (no frameworks — just simple functions, types, and exports so the fixture stays framework-agnostic)
- Generate a minimal valid 1x1 PNG for `logo.png` via `printf` with PNG header bytes
- Make 2 commits at fixed dates:
  - Commit 1 (`2024-01-10T09:00:00+00:00`): `.gitignore`, `package.json`, `docs/README.md`
  - Commit 2 (`2024-03-22T14:30:00+00:00`): all `src/` files, `tests/`, `logo.png`
- Print a summary of files with line counts and sizes for verification

Target structure:

```
tests/fixtures/sample-repo/
├── .git/                        (real git repo with 2 commits)
├── src/
│   ├── index.ts                 (50 lines — app entry point, plain TS)
│   ├── utils.ts                 (20 lines — simple utility functions)
│   └── components/
│       ├── Header.ts            (80 lines — plain TS component, no React)
│       └── Button.ts            (30 lines — plain TS component, no React)
├── tests/
│   └── index.test.ts            (40 lines — simple test assertions)
├── docs/
│   └── README.md                (15 lines)
├── package.json                 (10 lines)
├── logo.png                     (binary, ~67 bytes)
└── .gitignore                   (3 lines — ignores node_modules, dist, *.log)
```

**Content guidelines:** Files should contain realistic but simple TypeScript — functions, interfaces, exports. No framework imports. Line counts must be exact. Sizes are approximate.

- [ ] **Step 2: Add `tests/fixtures/sample-repo/` to root `.gitignore`**

- [ ] **Step 3: Run the setup script and verify**

```bash
bash tests/fixtures/setup.sh
```

Verify: correct file count, line counts match, git log shows 2 commits at expected dates, `logo.png` is detected as binary.

- [ ] **Step 4: Commit**

```bash
git add tests/fixtures/setup.sh .gitignore
git commit -m "test: add fixture setup script for deterministic sample-repo generation"
```

---

### Task 3: Scanner — Core Filesystem Walking

**Files:**
- Create: `src/scanner/scan.sh`
- Create: `tests/scanner/test-scan.sh`

- [ ] **Step 1: Write the scanner test**

Create `tests/scanner/test-scan.sh` — a shell test script that runs `scan.sh` against the fixture repo and validates JSON output using `jq`:

```bash
#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCAN="$SCRIPT_DIR/../../src/scanner/scan.sh"
FIXTURE="$SCRIPT_DIR/../fixtures/sample-repo"
PASS=0
FAIL=0

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $desc (expected: $expected, got: $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Scanner Tests ==="

# Test 1: Basic structure
echo "Test 1: Root node structure"
OUT=$(bash "$SCAN" --root "$FIXTURE")
ROOT_NAME=$(echo "$OUT" | jq -r '.tree.name')
ROOT_TYPE=$(echo "$OUT" | jq -r '.tree.type')
assert_eq "root name is sample-repo" "sample-repo" "$ROOT_NAME"
assert_eq "root type is directory" "directory" "$ROOT_TYPE"
assert_eq "root has fullPath" "$FIXTURE" "$(echo "$OUT" | jq -r '.tree.fullPath')"
assert_eq "scanned_at is present" "true" "$(echo "$OUT" | jq 'has("scanned_at")')"

# Test 2: File counts
echo "Test 2: Children counts"
assert_eq "root children_count" "6" "$(echo "$OUT" | jq '.tree.children_count')"
assert_eq "root children_file_count" "3" "$(echo "$OUT" | jq '.tree.children_file_count')"
assert_eq "root children_dir_count" "3" "$(echo "$OUT" | jq '.tree.children_dir_count')"

# Test 3: File metadata
echo "Test 3: File metadata"
INDEX_TS=$(echo "$OUT" | jq '.tree.children[] | select(.name=="src") | .children[] | select(.name=="index.ts")')
assert_eq "index.ts has lines" "true" "$(echo "$INDEX_TS" | jq 'has("lines")')"
assert_eq "index.ts has size" "true" "$(echo "$INDEX_TS" | jq 'has("size")')"
assert_eq "index.ts extension" ".ts" "$(echo "$INDEX_TS" | jq -r '.extension')"
assert_eq "index.ts binary is false" "false" "$(echo "$INDEX_TS" | jq '.binary')"

# Test 4: Binary detection
echo "Test 4: Binary detection"
LOGO=$(echo "$OUT" | jq '.tree.children[] | select(.name=="logo.png")')
assert_eq "logo.png binary is true" "true" "$(echo "$LOGO" | jq '.binary')"

# Test 5: Git metadata
echo "Test 5: Git metadata"
assert_eq "index.ts has git object" "true" "$(echo "$INDEX_TS" | jq 'has("git")')"
assert_eq "git has created" "true" "$(echo "$INDEX_TS" | jq '.git | has("created")')"
assert_eq "git has modified" "true" "$(echo "$INDEX_TS" | jq '.git | has("modified")')"
assert_eq "git has commits" "true" "$(echo "$INDEX_TS" | jq '.git | has("commits")')"
assert_eq "git has contributors" "true" "$(echo "$INDEX_TS" | jq '.git | has("contributors")')"

# Test 6: Depth limit
echo "Test 6: Depth limit"
DEPTH1=$(bash "$SCAN" --root "$FIXTURE" --depth 1)
HAS_NESTED=$(echo "$DEPTH1" | jq '[.tree.children[] | select(.type=="directory") | .children[]? | select(.type=="directory")] | length')
assert_eq "depth 1 has no nested dirs" "0" "$HAS_NESTED"

# Test 7: Descendants
echo "Test 7: Descendant counts"
assert_eq "root has descendants_count" "true" "$(echo "$OUT" | jq '.tree | has("descendants_count")')"
assert_eq "root has descendants_file_count" "true" "$(echo "$OUT" | jq '.tree | has("descendants_file_count")')"
assert_eq "root has descendants_dir_count" "true" "$(echo "$OUT" | jq '.tree | has("descendants_dir_count")')"
assert_eq "root has descendants_size" "true" "$(echo "$OUT" | jq '.tree | has("descendants_size")')"

# Test 8: Include/Exclude patterns
echo "Test 8: Include/Exclude patterns"
INCLUDE_OUT=$(bash "$SCAN" --root "$FIXTURE" --include "*.ts")
INCLUDE_FILES=$(echo "$INCLUDE_OUT" | jq '[.. | objects | select(.type=="file")] | length')
assert_eq "include *.ts filters to only .ts files" "true" "$([ "$INCLUDE_FILES" -gt 0 ] && echo true)"
NO_MD=$(echo "$INCLUDE_OUT" | jq '[.. | objects | select(.extension==".md")] | length')
assert_eq "include *.ts excludes .md files" "0" "$NO_MD"

EXCLUDE_OUT=$(bash "$SCAN" --root "$FIXTURE" --exclude "*.ts")
NO_TS=$(echo "$EXCLUDE_OUT" | jq '[.. | objects | select(.extension==".ts")] | length')
assert_eq "exclude *.ts removes .ts files" "0" "$NO_TS"

# Test 9: Gitignore filtering
echo "Test 9: Gitignore filtering"
NO_GIT=$(echo "$OUT" | jq '[.. | objects | select(.name==".git")] | length')
assert_eq ".git dir is excluded" "0" "$NO_GIT"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ] || exit 1
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
bash tests/scanner/test-scan.sh
```

Expected: FAIL — `scan.sh` doesn't exist yet.

- [ ] **Step 3: Implement scan.sh — OS detection and argument parsing**

Write the first section of `src/scanner/scan.sh`:
- Shebang, `set -euo pipefail`
- OS detection (`uname -s`) — sets variables for `stat` format strings (macOS vs Linux vs WSL)
- Argument parsing loop (`--root`, `--depth`, `--gitignore`, `--no-gitignore`, `--include`, `--exclude`, `--output`)
- Validation: error if `--root` not provided or path doesn't exist

- [ ] **Step 4: Implement scan.sh — file discovery and filtering**

- Build file list using `git ls-files` when gitignore is enabled (fallback to `find` for non-git dirs)
- Apply `--depth` limit via `find -maxdepth` or filtering `git ls-files` output
- Apply `--include` / `--exclude` patterns via `grep` / `grep -v`

- [ ] **Step 5: Implement scan.sh — file metadata collection**

For each file:
- `stat` for size, created date (birthtime), modified date (mtime) — OS-adaptive format strings
- `wc -l` for line count
- `file --mime-type` for binary detection (fallback to extension list)
- Extension extraction from filename

- [ ] **Step 6: Implement scan.sh — git metadata collection**

Single batch approach:
- `git log --format="%H %aI" --name-only --diff-filter=A` for first commit per file (created dates)
- `git log -1 --format="%aI" -- <file>` batched for modified dates
- `git log --format="%aN" --name-only` for contributor mapping
- `git rev-list --count HEAD -- <file>` batched for commit counts
- Map all results back to files. Set `git: null` for non-git repos.

- [ ] **Step 7: Implement scan.sh — directory stats and tree assembly**

- Compute per-directory: `children_count`, `children_file_count`, `children_dir_count`
- Compute descendants recursively: `descendants_count`, `descendants_file_count`, `descendants_dir_count`, `descendants_size`
- Assemble nested JSON tree structure using `jq` or manual JSON string building
- Include `fullPath` on every node
- Output to stdout (or `--output` file if specified)

- [ ] **Step 8: Run tests to verify they pass**

```bash
bash tests/scanner/test-scan.sh
```

Expected: All assertions PASS.

- [ ] **Step 9: Test scanner on a real repo**

```bash
bash src/scanner/scan.sh --root /Users/thalida/Documents/Repos/codecity-ai | jq . | head -60
```

Verify JSON is well-formed and metadata looks reasonable.

- [ ] **Step 10: Commit**

```bash
git add src/scanner/scan.sh tests/scanner/test-scan.sh
git commit -m "feat: add portable filesystem scanner with git metadata and tests"
```

---

### Task 4: Renderer — Isometric Engine (`engine.js`)

**Files:**
- Create: `src/renderer/engine.js`

- [ ] **Step 1: Implement isometric projection functions**

```javascript
// Isometric projection constants
const ISO_ANGLE = Math.PI / 6;
const COS_A = Math.cos(ISO_ANGLE);
const SIN_A = Math.sin(ISO_ANGLE);

function isoProject(x, y, z) {
  return {
    sx: (x - y) * COS_A,
    sy: (x + y) * SIN_A - z
  };
}
```

- [ ] **Step 2: Implement building drawing**

`drawBuilding(ctx, cx, cy, w, d, h, hslColor)`:
- Three faces: left (darkened), right (mid shade), top (base color)
- Window details on right and left faces (proportional to building size)
- Edge highlights (`rgba(255,255,255,0.06)`)
- Uses `shadeColor()` helper for face shading

- [ ] **Step 3: Implement ground drawing**

`drawGround(ctx, x, y, w, d, fill, stroke)`:
- Isometric projected rectangle for city blocks
- Fill + optional stroke border

- [ ] **Step 4: Implement DPR-aware canvas setup**

`setupCanvas(canvas)`:
- Gets `devicePixelRatio`
- Scales canvas buffer dimensions
- Returns scaled context

- [ ] **Step 5: Verify by creating a minimal test HTML**

Create a temporary `tests/renderer/test-engine.html` that includes engine.js and draws a few buildings on a canvas. Open in browser to visually verify the isometric rendering looks correct.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/engine.js tests/renderer/test-engine.html
git commit -m "feat: add isometric rendering engine with building and ground primitives"
```

---

### Task 5: Renderer — Color System (`colors.js`)

**Files:**
- Create: `src/renderer/colors.js`

- [ ] **Step 1: Implement hue mapping**

```javascript
function getHue(extension, palette) {
  if (palette[extension] !== undefined) return palette[extension];
  // Deterministic hash for unknown extensions
  let hash = 0;
  for (let i = 0; i < extension.length; i++) {
    hash = extension.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash) % 360;
}
```

- [ ] **Step 2: Implement saturation mapping (file age)**

```javascript
function getSaturation(createdDate, minDate, maxDate, config) {
  if (!createdDate) return 60; // fallback mid-saturation
  const created = new Date(createdDate).getTime();
  const min = new Date(minDate).getTime();
  const max = new Date(maxDate).getTime();
  if (max === min) return config.max;
  const t = (created - min) / (max - min); // 0 = oldest, 1 = newest
  return config.min + t * (config.max - config.min);
}
```

- [ ] **Step 3: Implement lightness mapping (modified date)**

```javascript
function getLightness(modifiedDate, minDate, maxDate, config) {
  if (!modifiedDate) return 45; // fallback mid-lightness
  const modified = new Date(modifiedDate).getTime();
  const min = new Date(minDate).getTime();
  const max = new Date(maxDate).getTime();
  if (max === min) return config.max;
  const t = (modified - min) / (max - min); // 0 = oldest, 1 = newest
  return config.min + t * (config.max - config.min);
}
```

- [ ] **Step 4: Implement date range extraction from manifest**

`getDateRanges(manifest)`:
- Walks the manifest tree recursively
- Finds min/max created dates and min/max modified dates across all files
- Uses git dates when available, filesystem dates as fallback
- Returns `{ createdMin, createdMax, modifiedMin, modifiedMax }`

- [ ] **Step 5: Implement combined color function**

```javascript
function getBuildingColor(file, palette, dateRanges, config) {
  const h = getHue(file.extension, palette);
  const created = file.git?.created || file.created;
  const modified = file.git?.modified || file.modified;
  const s = getSaturation(created, dateRanges.createdMin, dateRanges.createdMax, config.saturation);
  const l = getLightness(modified, dateRanges.modifiedMin, dateRanges.modifiedMax, config.lightness);
  return `hsl(${h}, ${s}%, ${l}%)`;
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/colors.js
git commit -m "feat: add HSL color system with extension/age/recency mapping"
```

---

### Task 6: Renderer — Grid Layout (`layout.js`)

**Files:**
- Create: `src/renderer/layout.js`

- [ ] **Step 1: Implement street tier classification**

```javascript
function getStreetTier(childrenCount, tiers) {
  // tiers = [3, 8, 15, 30] from defaults.json
  for (let i = 0; i < tiers.length; i++) {
    if (childrenCount <= tiers[i]) return i + 1;
  }
  return 5;
}

function getStreetWidth(tier) {
  return [4, 8, 14, 22, 32][tier - 1];
}
```

- [ ] **Step 2: Implement building dimension calculation**

```javascript
function getBuildingDimensions(file, config) {
  const logScale = (val, min, max) => {
    const logVal = Math.log2(Math.max(1, val));
    return Math.min(max, Math.max(min, logVal * (max / 15)));
  };
  const h = logScale(file.lines || 1, config.building.min_height, config.building.max_height);
  const w = logScale(file.size || 1, config.building.min_width, config.building.max_width);
  const d = (h + w) / 2; // lerp(h, w, 0.5)
  return { width: w, depth: d, height: h };
}
```

- [ ] **Step 3: Implement block layout algorithm**

`layoutBlock(dirNode, config)`:
- Takes a directory node from the manifest tree
- Computes building dimensions for each child file
- Arranges buildings in a grid within the block (rows and columns)
- Computes block total width and depth from building arrangement
- Returns positioned buildings array + block bounds

- [ ] **Step 4: Implement city-level grid layout**

`layoutCity(manifest, config)`:
- Takes the full manifest tree
- Lays out top-level directory blocks on a grid with streets between them
- Recursively lays out sub-blocks for nested directories
- Computes street widths from directory child counts
- Returns complete layout: `{ blocks: [...], streets: [...], buildings: [...] }`

- [ ] **Step 5: Implement painter's algorithm sorting**

`sortForRendering(buildings)`:
- Sorts all buildings back-to-front based on their isometric position
- Buildings with higher `(x + y)` values render first (they're "behind")
- Ensures correct overlap in the isometric view

- [ ] **Step 6: Implement hit-testing data**

As part of layout, store screen-space bounding boxes for each building so `interactions.js` can do click hit-testing. Each building in the layout result includes `{ hitBox: { x, y, width, height }, file: <manifest node> }`.

- [ ] **Step 7: Verify by extending test-engine.html**

Update `tests/renderer/test-engine.html` to import layout.js and colors.js, feed it a hardcoded small manifest, and render a complete mini city. Open in browser to verify grid layout, street widths, and colors look correct.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/layout.js tests/renderer/test-engine.html
git commit -m "feat: add grid layout algorithm with street tiers and painter's sort"
```

---

### Task 7: Renderer — Sidebar (`sidebar.js`)

**Files:**
- Create: `src/renderer/sidebar.js`

- [ ] **Step 1: Implement sidebar rendering for files**

`showFileSidebar(file)`:
- Creates/updates sidebar DOM content:
  - File name + extension badge (colored by hue)
  - Full path (with copy-to-clipboard button)
  - Size (formatted: bytes → KB/MB)
  - Line count
  - Created date (label: "git" or "filesystem")
  - Modified date (label: "git" or "filesystem")
  - Commit count (if git data present)
  - Contributors list (if git data present)
- Adds `open` class to sidebar element to trigger CSS slide-in

- [ ] **Step 2: Implement sidebar rendering for directories**

`showDirSidebar(dir)`:
- Directory name + full path (copyable)
- Children: total / files / dirs
- Descendants: total / files / dirs
- Total descendants size (formatted)

- [ ] **Step 3: Implement sidebar close**

`closeSidebar()`:
- Removes `open` class from sidebar element
- Clears selected building highlight

- [ ] **Step 4: Implement copy-to-clipboard**

`copyToClipboard(text)`:
- Uses `navigator.clipboard.writeText()` with fallback to `execCommand('copy')`
- Brief visual feedback on the copy button ("Copied!")

- [ ] **Step 5: Implement human-readable formatters**

```javascript
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}
```

- [ ] **Step 6: Commit**

```bash
git add src/renderer/sidebar.js
git commit -m "feat: add sidebar panel with file/directory metadata display"
```

---

### Task 8: Renderer — Interactions (`interactions.js`)

**Files:**
- Create: `src/renderer/interactions.js`

- [ ] **Step 1: Implement pan**

- Track mouse down/move/up on canvas
- On drag (when not clicking a building): translate the canvas context offset
- Store `panX`, `panY` state

- [ ] **Step 2: Implement zoom**

- Listen for `wheel` event on canvas
- Zoom centered on cursor position (not canvas center)
- Smooth zoom factor with min/max bounds (0.3x to 5x)
- Store `zoomLevel` state

- [ ] **Step 3: Implement click hit-testing**

`handleClick(screenX, screenY, buildings, zoomLevel, panX, panY)`:
- Transform screen coordinates back to world coordinates accounting for pan and zoom
- Check against building hitboxes from layout
- If hit: call `showFileSidebar()` or `showDirSidebar()`
- If miss: call `closeSidebar()`

- [ ] **Step 4: Implement hover cursor**

- On `mousemove`: check if cursor is over a building hitbox
- Set `cursor: pointer` when over a building, `cursor: grab` otherwise
- Set `cursor: grabbing` while panning

- [ ] **Step 5: Implement keyboard handler**

- `Escape` key → `closeSidebar()`

- [ ] **Step 6: Implement render loop**

`startRenderLoop(canvas, layout, config)`:
- Main function that ties everything together
- Sets up canvas, attaches all event listeners
- Calls `renderCity()` which draws ground blocks, streets, then buildings (sorted)
- Re-renders on pan/zoom changes

- [ ] **Step 7: Verify with test HTML**

Update `tests/renderer/test-engine.html` to include all modules (engine, colors, layout, sidebar, interactions). Feed a hardcoded manifest and verify the full interactive experience: pan, zoom, click buildings to see sidebar, escape to close.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/interactions.js tests/renderer/test-engine.html
git commit -m "feat: add pan, zoom, click-to-select, and hover interactions"
```

---

### Task 9: Renderer — Styles (`styles.css`)

**Files:**
- Create: `src/renderer/styles.css`

- [ ] **Step 1: Implement base styles**

```css
/* Reset and base */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0b10; color: #e0e0e0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
canvas { display: block; width: 100%; height: 100%; }
```

- [ ] **Step 2: Implement sidebar styles**

- Fixed position right panel, full height, 320px wide
- `transform: translateX(100%)` by default, `translateX(0)` when `.open`
- Transition: `transform 0.3s ease`
- Dark background (`#12131a`), subtle left border
- Internal layout: header, stats grid, contributors list
- Scrollable content area

- [ ] **Step 3: Implement component styles**

- Extension badge (small colored pill)
- Copy button (subtle, shows "Copied!" feedback)
- Stats grid (label + value pairs)
- Contributors list (comma-separated)
- Section dividers

- [ ] **Step 4: Implement scrollbar and selection styles**

- Custom scrollbar (thin, dark, matching theme)
- Selected building glow indicator (CSS class the JS toggles)

- [ ] **Step 5: Commit**

```bash
git add src/renderer/styles.css
git commit -m "feat: add dark theme styles for sidebar and canvas layout"
```

---

### Task 10: Integration — Test HTML Harness

**Files:**
- Create: `tests/renderer/test-city.html`

- [ ] **Step 1: Build a full integration test page**

Create `tests/renderer/test-city.html` that:
- Includes all 5 JS modules via `<script>` tags and styles.css via `<link>`
- Embeds a hardcoded manifest JSON (matching the fixture repo structure)
- Embeds the defaults.json config
- Has the HTML shell: `<canvas id="city">`, `<div id="sidebar">`
- Calls `startRenderLoop()` on load

This is the reference implementation of what the SKILL.md will tell the agent to assemble.

- [ ] **Step 2: Open in browser and verify end-to-end**

Verify:
- City renders with correct grid layout
- Buildings have different heights/widths based on file data
- Colors vary by extension, age, and recency
- Pan and zoom work smoothly
- Clicking a building opens sidebar with correct metadata
- Clicking empty space / Escape closes sidebar
- Directory blocks are clickable and show directory stats

- [ ] **Step 3: Fix any visual or interaction issues found**

Iterate on renderer modules based on what you see. This is the quality checkpoint — the city should look good and feel responsive.

- [ ] **Step 4: Commit**

```bash
git add tests/renderer/test-city.html
git commit -m "test: add full integration test harness for city rendering"
```

---

### Task 11: SKILL.md — Agent Instructions

**Files:**
- Create: `src/skills/codecity/SKILL.md`

- [ ] **Step 1: Write SKILL.md frontmatter**

```yaml
---
name: codecity
description: >
  Use when the user asks to visualize a codebase, show a code city, render a city from a folder/repo,
  or invokes /codecity. Generates an isometric 2.5D city where directories are streets and files are buildings.
version: 1.0.0
argument-hint: "[path] [--depth n] [--output path] [--exclude pattern]"
allowed-tools: [Read, Glob, Grep, Write, Bash, AskUserQuestion]
---
```

- [ ] **Step 2: Write Phase 1 — Clarify**

Instructions for the agent to ask the user (via AskUserQuestion) about:
1. Root path (default: cwd)
2. Depth limit (default: unlimited)
3. Filters (default: respect .gitignore)
4. Output path (default: `~/.codecity/`)
5. Color palette overrides (default: use defaults)

Include logic: skip questions for parameters already provided in the invocation.

- [ ] **Step 3: Write Phase 2 — Scan**

Instructions to run the scanner:
```
Run: bash <plugin-dir>/src/scanner/scan.sh --root <path> [--depth <n>] [filters]
Capture the JSON output.
```

Include error handling: if scan fails, report the error to the user.

- [ ] **Step 4: Write Phase 3-4 — Read & Assemble**

Instructions to:
1. Read all renderer files from `<plugin-dir>/src/renderer/`
2. Read `<plugin-dir>/src/config/defaults.json`
3. Assemble a single HTML file with this structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeCity — {project-name}</title>
  <style>{styles.css content}</style>
</head>
<body>
  <canvas id="city"></canvas>
  <div id="sidebar"></div>
  <script>
    const MANIFEST = {scanner JSON output};
    const CONFIG = {merged defaults + user overrides};
    {engine.js}
    {colors.js}
    {layout.js}
    {sidebar.js}
    {interactions.js}
    // Initialize
    window.addEventListener('load', () => {
      const canvas = document.getElementById('city');
      startRenderLoop(canvas, MANIFEST, CONFIG);
    });
  </script>
</body>
</html>
```

- [ ] **Step 5: Write Phase 5 — Write & Report**

Instructions to:
1. Determine output path (per-run → configured → `~/.codecity/`)
2. Create directory with `mkdir -p`
3. Write the assembled HTML file
4. Report the path and suggest opening in browser

- [ ] **Step 6: Commit**

```bash
git add src/skills/codecity/SKILL.md
git commit -m "feat: add SKILL.md with agent orchestration instructions"
```

---

### Task 12: Platform Adapters

**Files:**
- Create: `.claude-plugin/plugin.json`
- Create: `.cursor-plugin/plugin.json`
- Create: `.opencode/plugins/codecity.js`
- Create: `gemini-extension.json`
- Create: `docs/README.codex.md`

- [ ] **Step 1: Create Claude Code plugin.json**

```json
{
  "name": "codecity-ai",
  "displayName": "CodeCity AI",
  "description": "Visualize any codebase as an isometric 2.5D city",
  "version": "1.0.0",
  "author": {
    "name": "Thalida Noel",
    "email": "thalida.c.noel@gmail.com"
  },
  "repository": "https://github.com/thalida/codecity-ai",
  "license": "AGPL-3.0",
  "skills": "src/skills"
}
```

- [ ] **Step 2: Create Cursor plugin.json**

Same structure in `.cursor-plugin/plugin.json`, adapted for Cursor's expected format.

- [ ] **Step 3: Create OpenCode bootstrap plugin**

Create `.opencode/plugins/codecity.js`:
- Registers skill paths from `src/skills/`
- Handles skill discovery for OpenCode

- [ ] **Step 4: Create Gemini extension config**

```json
{
  "name": "codecity-ai",
  "description": "Visualize any codebase as an isometric 2.5D city",
  "version": "1.0.0",
  "contextFileName": "GEMINI.md"
}
```

Create `GEMINI.md` that references the SKILL.md content for Gemini's context injection.

- [ ] **Step 5: Create Codex install docs**

Create `docs/README.codex.md` with instructions for symlinking skills to `~/.agents/skills/`.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/ .cursor-plugin/ .opencode/ gemini-extension.json docs/README.codex.md GEMINI.md
git commit -m "feat: add platform adapters for Claude Code, Cursor, OpenCode, Gemini, Codex"
```

---

### Task 13: End-to-End Verification

- [ ] **Step 1: Install as Claude Code plugin locally**

Test that the plugin is discoverable and the skill triggers on `/codecity` and natural language.

- [ ] **Step 2: Run against the codecity-ai repo itself**

```bash
/codecity /Users/thalida/Documents/Repos/codecity-ai
```

Verify the full pipeline: questions → scan → assemble → write → open in browser.

- [ ] **Step 3: Run against a large real-world repo**

Test on a bigger repo to verify performance and visual quality at scale.

- [ ] **Step 4: Test edge cases**

- Non-git directory (filesystem fallback)
- Empty directory
- Directory with only binary files
- Depth limit (`--depth 1`)
- Custom include/exclude patterns
- Custom output path

- [ ] **Step 5: Fix any issues found**

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "fix: address issues found during end-to-end testing"
```

---

### Task 14: README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write README**

Cover:
- What CodeCity AI is (one paragraph + screenshot once available)
- Quick start: install as Claude Code plugin, run `/codecity`
- Configuration: depth, output path, color palette, filters
- Building properties legend (height = lines, width = size, color = type/age/recency)
- Cross-platform install instructions (Claude Code, Cursor, Codex, OpenCode, Gemini)
- Development: how to run tests, repo structure
- License: AGPL-3.0

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with install, usage, and configuration guide"
```
