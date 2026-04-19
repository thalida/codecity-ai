---
name: codecity
description: >
  Use when the user asks to visualize a codebase, show a code city, render a
  city from a folder/repo, or invokes /codecity. Generates an interactive
  3D city where directories are streets and files are buildings, written as
  a single self-contained HTML file.
version: 3.0.0
argument-hint: "[path] [--depth n] [--output path] [--exclude pattern]"
allowed-tools: [Read, Bash, AskUserQuestion]
---

# CodeCity Skill

Everything you need lives next to this file:

- `scan.sh`       — walks a directory, emits a JSON manifest.
- `build.sh`      — fills the prebuilt HTML template with manifest + config.
- `defaults.json` — default palette and building/saturation/lightness config.
- `dist/index.html` — prebuilt renderer (committed; produced from `src/` via
  `npm run build` at dev time, so end users don't need Node).

Your job is just to wire them together. If you need to understand flags or
output shapes, run each script with `--help`.

## Plugin directory

This SKILL.md lives at `<plugin-dir>/skills/codecity/SKILL.md`. Every path
below is relative to this file's directory.

---

## Phase 1: Clarify

Use `AskUserQuestion` for anything the invocation didn't supply. Skip questions
whose answer is already on the command line.

1. **What to scan?** — default: current working directory.
2. **How deep?** — default: unlimited.
3. **Filters?** — default: `.gitignore` on, no custom patterns.
4. **Where to save?** — default: `~/.codecity/`.
5. **Palette overrides?** — default: use `defaults.json`.

---

## Phase 2: Scan

```bash
bash <skill-dir>/scan.sh \
  --root <absolute-path> \
  [--depth <n>] \
  [--no-gitignore] \
  [--include <pattern>] \
  [--exclude <pattern>] \
  > <tmp>/manifest.json
```

If the command exits non-zero or produces empty output, stop and surface the
error. Common causes: path doesn't exist, permission denied, `jq` not installed.

---

## Phase 3: Prepare the config

If the user didn't override anything, just use defaults:

```bash
cp <skill-dir>/defaults.json <tmp>/config.json
```

If they did provide overrides (e.g. `--palette '{"\.go": 185}'`), merge them:

```bash
# Write user overrides to <tmp>/overrides.json first, then:
jq -s '.[0] * .[1]' \
  <skill-dir>/defaults.json \
  <tmp>/overrides.json > <tmp>/config.json
```

---

## Phase 4: Build

```bash
bash <skill-dir>/build.sh \
  --project  <project-name> \
  --manifest <tmp>/manifest.json \
  --config   <tmp>/config.json \
  --output   <output-dir>/codecity-<project-name>-<YYYY-MM-DD>.html
```

`<project-name>` = base directory name of the scanned path (e.g. scanning
`/home/user/myproject` → `myproject`).

`<output-dir>` comes from the per-run override, persistent preference, or
the default `~/.codecity/`. `build.sh` creates the directory if needed.

---

## Phase 5: Report

Tell the user:

- The full path to the generated file.
- How to open it (`open <path>` on macOS, equivalent elsewhere).
- A short summary: files and directories scanned (read these from the
  manifest's `tree.descendants_file_count` and `tree.descendants_dir_count`).

---

## Building properties reference

Use this if the user asks how to read the city.

| Visual | Source | Meaning |
| --- | --- | --- |
| Height | Line count | Taller = more lines |
| Width | File size (bytes) | Wider = larger file |
| Depth | Blend of h & w | `lerp(width, height, 0.5)` |
| Hue | File extension | Language family |
| Saturation | Created date | Vivid = newer, faded = older |
| Lightness | Modified date | Bright = recently changed, dim = untouched |

Street width reflects directory size; git timestamps preferred over
filesystem timestamps when the scanned directory is a git repo.

---

## Quick reference

### scan.sh

| Flag | Default | Description |
| --- | --- | --- |
| `--root <path>` | required | Directory to scan |
| `--depth <n>` | unlimited | Max directory depth |
| `--gitignore` | on | Respect `.gitignore` |
| `--no-gitignore` | — | Disable `.gitignore` |
| `--include <pat>` | — | Only matching filenames |
| `--exclude <pat>` | — | Exclude matching filenames |

Outputs JSON to stdout.

### build.sh

| Flag | Description |
| --- | --- |
| `--project <name>` | Shown in the HTML `<title>` |
| `--manifest <path>` | Path to scan.sh output (or `-` for stdin) |
| `--config <path>` | Path to merged config JSON (or `-` for stdin) |
| `--output <path>` | Where to write the HTML |

The resulting HTML is fully self-contained (JS, CSS, Three.js all inlined).
Works from `file://` with no server.
