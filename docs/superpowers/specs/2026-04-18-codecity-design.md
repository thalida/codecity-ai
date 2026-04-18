# CodeCity AI — Design Spec

## Context

CodeCity AI is an "AI app" — a plugin/skill that ships both instructions (SKILL.md) and code (scanner, renderer) so the agent can generate a complete code city visualization without the user installing anything else. The agent reads pre-built modules, scans the filesystem, assembles everything into a single self-contained HTML file, and writes it to disk.

The city represents a folder or cloned repo as an isometric 2.5D city where directories are streets/blocks and files are buildings. Visual properties encode real data: building height = line count, width = file size, color = file type + age + recency.

The plugin supports all major AI chat clients (Claude Code, Cursor, Codex, OpenCode, Gemini) via a single canonical skill with thin platform adapter configs.

---

## Repo Structure

```
codecity-ai/
├── .claude-plugin/
│   └── plugin.json
├── .cursor-plugin/
│   └── plugin.json
├── .opencode/
│   └── plugins/codecity.js
├── gemini-extension.json
├── docs/
│   └── README.codex.md
│
├── src/
│   ├── skills/
│   │   └── codecity/
│   │       └── SKILL.md
│   ├── scanner/
│   │   └── scan.sh
│   ├── renderer/
│   │   ├── engine.js
│   │   ├── layout.js
│   │   ├── colors.js
│   │   ├── sidebar.js
│   │   ├── interactions.js
│   │   └── styles.css
│   └── config/
│       └── defaults.json
│
├── LICENSE                    # AGPL-3.0
└── README.md
```

- **Platform adapters** at root level (discoverable by each client)
- **All core logic** under `src/`
- **Single canonical SKILL.md** — platform configs all point to the same skill
- **Versioning**: semver in plugin.json, git tags for releases

---

## Scanner (`src/scanner/scan.sh`)

A single portable shell script that detects OS (macOS/Linux/Windows via WSL) and adapts commands accordingly.

### Arguments

| Arg | Default | Description |
|-----|---------|-------------|
| `--root <path>` | required | Directory to scan |
| `--depth <n>` | unlimited | Max directory depth (no limit by default) |
| `--gitignore` | on | Respect .gitignore (default behavior) |
| `--no-gitignore` | — | Disable .gitignore filtering |
| `--include <pattern>` | — | Only include matching files |
| `--exclude <pattern>` | — | Exclude matching files |
| `--output <path>` | stdout | Where to write JSON |

### Behavior

1. Detects OS and adapts `stat`, `date`, and other commands
2. Walks directory tree using `find` with optional depth limit
3. When gitignore is enabled, filters via `git ls-files` (falls back to no filtering for non-git dirs)
4. Collects filesystem stats for every file and directory
5. Collects git metadata when available using a single batch `git log --name-only` pass (not per-file) for performance on large repos, then maps results to files. Falls back to filesystem dates for non-git repos.
6. Detects binary files using `file --mime-type` (falls back to extension heuristic: known binary extensions like `.png`, `.jpg`, `.woff`, `.zip`, etc.)
7. Outputs a single JSON manifest to stdout

### Manifest Schema

```json
{
  "root": "/absolute/path/to/project",
  "scanned_at": "2026-04-18T18:30:00Z",
  "depth": null,
  "tree": {
    "name": "project",
    "type": "directory",
    "path": ".",
    "fullPath": "/absolute/path/to/project",
    "children_count": 5,
    "children_file_count": 2,
    "children_dir_count": 3,
    "descendants_count": 87,
    "descendants_file_count": 72,
    "descendants_dir_count": 15,
    "descendants_size": 245000,
    "children": [
      {
        "name": "utils.ts",
        "type": "file",
        "path": "src/utils.ts",
        "fullPath": "/absolute/path/to/project/src/utils.ts",
        "extension": ".ts",
        "size": 3200,
        "lines": 120,
        "binary": false,
        "created": "2026-02-10T08:00:00Z",
        "modified": "2026-04-15T12:00:00Z",
        "git": {
          "created": "2026-02-12T10:00:00Z",
          "modified": "2026-04-15T14:30:00Z",
          "commits": 8,
          "contributors": ["alice", "bob"]
        }
      },
      {
        "name": "components",
        "type": "directory",
        "path": "src/components",
        "fullPath": "/absolute/path/to/project/src/components",
        "children_count": 8,
        "children_file_count": 6,
        "children_dir_count": 2,
        "descendants_count": 14,
        "descendants_file_count": 12,
        "descendants_dir_count": 2,
        "descendants_size": 48000,
        "children": []
      }
    ]
  }
}
```

**Date priority**: `git.created` / `git.modified` when available, fallback to top-level `created` / `modified` (filesystem dates). Files in non-git repos or untracked files always have filesystem dates.

**Depth**: `null` in the manifest means no limit was applied (full scan).

---

## Renderer Modules (`src/renderer/`)

Six modules, each with one responsibility. The agent reads all six and assembles them into the final HTML.

### `engine.js` — Isometric Projection Core

- `isoProject(x, y, z)` → `{sx, sy}` screen coordinates
- `drawBuilding(ctx, cx, cy, width, depth, height, hslColor)` — complete isometric building with left face (dark), right face (mid), top face (light), window details, edge highlights
- `drawGround(ctx, x, y, w, d, fill, stroke)` — ground plane for city blocks
- DPR-aware rendering for retina displays

### `layout.js` — Grid Layout Algorithm

Takes the manifest tree and computes positions for every building, block, and street.

**Street width tiers** (based on `children_count`):

| Tier | children_count | Street Name | Visual Width |
|------|---------------|-------------|-------------|
| 1 | 1–3 | Alley | Thinnest |
| 2 | 4–8 | Side Street | Thin |
| 3 | 9–15 | Street | Medium |
| 4 | 16–30 | Avenue | Wide |
| 5 | 31+ | Boulevard | Widest |

- Directories become city blocks arranged on a regular grid
- Files become buildings placed within their parent block
- Blocks are separated by streets whose width reflects the directory's child count
- Nested directories create sub-blocks within parent blocks
- Buildings are sorted back-to-front for correct isometric overlap (painter's algorithm)

### `colors.js` — HSL Color System

**Hue** — file extension via configurable palette:

| Language Family | Default Hue Range | Extensions |
|----------------|-------------------|------------|
| JavaScript/TypeScript | Blue (~210-230) | .js, .ts, .jsx, .tsx, .mjs |
| Python | Red/Orange (~10-30) | .py, .pyx, .pyi |
| CSS/Styling | Green (~140-160) | .css, .scss, .less, .sass |
| HTML/Templates | Teal (~170-190) | .html, .vue, .svelte |
| Config | Yellow (~45-60) | .json, .yaml, .toml, .ini |
| Docs/Text | Purple (~270-290) | .md, .txt, .rst |
| Shell/Scripts | Orange (~30-45) | .sh, .bash, .zsh |
| Go | Cyan (~180-200) | .go |
| Rust | Warm Red (~0-10) | .rs |
| Other | Hash-based | Deterministic from extension string |

User-configurable — defaults can be overridden per-run or in persistent config.

**Saturation** — file age (created date):
- Git `created` date preferred, filesystem `created` as fallback
- Newest file in repo → 100% saturation
- Oldest file in repo → 20-30% saturation (still readable hue)
- Linear interpolation between repo min/max

**Lightness** — last modified date:
- Git `modified` date preferred, filesystem `modified` as fallback
- Recently modified → 60-70% lightness (bright)
- Long untouched → 25-35% lightness (dim)
- Linear interpolation between repo min/max

**No git, no filesystem dates**: mid-saturation (60%), mid-lightness (45%)

**Result**: a tall, bright, vivid blue building = large TypeScript file, recently created, recently modified. A short, dim, grayish-blue building = small TS file, old, untouched.

### `sidebar.js` — Detail Panel

Slide-out panel on the right side, triggered by clicking a building or block.

**File sidebar shows:**
- File name + extension badge
- Full path (copyable)
- Size (human-readable: "3.2 KB")
- Line count
- Created date (git or filesystem, labeled accordingly)
- Last modified date (git or filesystem)
- Commit count (if git)
- Contributors list (if git)

**Directory sidebar shows:**
- Directory name + full path
- Children: total, files, dirs
- Descendants: total, files, dirs
- Total descendants size

**Behavior:**
- Click building → sidebar slides in
- Click different building → sidebar content swaps
- Click same building or empty space → sidebar closes
- `Escape` key closes sidebar

### `interactions.js` — User Input

- **Pan**: click-drag on empty space
- **Zoom**: scroll wheel, centered on cursor position, smooth transitions, min/max bounds
- **Click**: hit-tests screen coordinates against building positions, triggers sidebar
- **Hover**: cursor changes to pointer over buildings

### `styles.css` — Base Styles

- Dark theme matching the city aesthetic
- Sidebar panel layout, transitions, typography
- Scrollbar styling
- Responsive canvas sizing

---

## Building Properties Summary

| Visual Property | Data Source | Scale |
|----------------|------------|-------|
| Height | Line count | Logarithmic, min/max bounded |
| Width | File size (bytes) | Logarithmic, min/max bounded |
| Depth | Blend of width & height | `lerp(width, height, 0.5)` |
| Hue | File extension | Configurable palette |
| Saturation | File age (created date) | Linear, git → filesystem fallback |
| Lightness | Last modified date | Linear, git → filesystem fallback |

---

## SKILL.md — Agent Workflow

### Phase 1: Clarify (Conversational)

The skill asks the user to clarify what they want, skipping questions the user already answered in their invocation:

1. **What to scan?** — folder/repo path (default: current working directory)
2. **How deep?** — depth limit (default: unlimited / full scan)
3. **Filters?** — gitignore is on by default; custom include/exclude patterns?
4. **Where to save?** — output path (default: `~/.codecity/`, configurable default, per-run override)
5. **Color overrides?** — custom palette or use defaults?

If the user provided everything (e.g. `/codecity ./src --depth 2`), skip straight to Phase 2.

### Phase 2: Scan

Run `bash src/scanner/scan.sh --root <path> [--depth <n>] [filters]` and capture JSON manifest from stdout.

### Phase 3: Read Modules

Read all renderer files:
- `src/renderer/engine.js`
- `src/renderer/layout.js`
- `src/renderer/colors.js`
- `src/renderer/sidebar.js`
- `src/renderer/interactions.js`
- `src/renderer/styles.css`
- `src/config/defaults.json`

### `defaults.json` Contents

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

### Phase 4: Assemble

Build a single self-contained HTML file:
- `<style>` block from styles.css
- `<script>` block containing:
  - `const MANIFEST = {...}` — the scan data
  - `const CONFIG = {...}` — merged defaults + user overrides
  - All JS modules concatenated
- Minimal HTML shell: `<canvas>`, sidebar `<div>`, page title

No external dependencies. Everything inline. One file.

### Phase 5: Write & Report

- Determine output path: per-run arg → configured default → `~/.codecity/`
- Create directory if needed
- Write file with descriptive name (e.g. `codecity-projectname-2026-04-18.html`)
- Tell user the path and suggest opening in browser

### Output Path Priority

1. Per-run override (user passes a path for this specific invocation)
2. Configured default (user has set a persistent preference)
3. `~/.codecity/` (global default)

---

## Invocation

**Slash command**: `/codecity [path] [--depth n] [--output path] [--exclude pattern]`

**Natural language**: Skill triggers on phrases like "show me the city", "visualize this codebase", "render a code city", "codecity for this repo"

---

## Cross-Platform Support

| Platform | Config File | Skill Discovery |
|----------|------------|-----------------|
| Claude Code | `.claude-plugin/plugin.json` | `skills/` directory reference |
| Cursor | `.cursor-plugin/plugin.json` | `skills/` directory reference |
| OpenCode | `.opencode/plugins/codecity.js` | Bootstrap plugin registers skill paths |
| Codex | `docs/README.codex.md` | Symlink to `~/.agents/skills/` |
| Gemini | `gemini-extension.json` | Context file injection |

All adapters point to the same `src/skills/codecity/SKILL.md` and code in `src/`.

---

## Verification

1. **Scanner**: Run `scan.sh` on a known repo, validate JSON output against schema, verify git metadata matches `git log`
2. **Renderer**: Open a generated HTML in browser, verify buildings render, pan/zoom works, click-to-select opens sidebar with correct metadata
3. **Cross-platform**: Install as plugin in Claude Code and at least one other client, verify skill triggers and generates output
4. **Edge cases**: Non-git directory (filesystem fallback), empty directory, binary files, very deep nesting, very large repos (1000+ files)
