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

- `codecity.sh`   — single entry point; scans + builds in one call.
- `defaults.json` — default palette and building/saturation/lightness config.
- `template.html` — the prebuilt renderer (from `src/`, committed).
- `scripts/`     — internal helpers (`scan.sh`, `build.sh`) that `codecity.sh`
                   sources. You do not call these directly.

Your job is to collect args from the user, run `codecity.sh`, and report.

## Plugin directory

This SKILL.md lives at `<plugin-dir>/skills/codecity/SKILL.md`. Every path
below is relative to this file's directory.

---

## Phase 1: Clarify

Use `AskUserQuestion` for anything the invocation didn't supply. Skip
questions whose answer is already on the command line.

1. **What to scan?** — default: current working directory.
2. **How deep?** — default: unlimited.
3. **Filters?** — default: `.gitignore` on, no custom patterns.
4. **Where to save?** — default: `~/.codecity/`.
5. **Palette overrides?** — default: use `defaults.json` as-is.
   (If the user wants custom colors, edit `defaults.json` in the plugin
   directory. There is no CLI flag.)

---

## Phase 2: Generate

```bash
bash <skill-dir>/codecity.sh \
  --root   <absolute-path> \
  --output <output-dir>/codecity-<project-name>-<YYYY-MM-DD>.html \
  [--depth <n>] \
  [--no-gitignore] \
  [--include <pattern>] \
  [--exclude <pattern>]
```

`<output-dir>` comes from the per-run override, persistent preference, or
the default `~/.codecity/`. `codecity.sh` creates it if needed.

If the command exits non-zero, surface the exit code + stderr to the user.
Common causes: path doesn't exist, permission denied, `jq` not installed,
`template.html` missing (plugin installation needs `npm run build` once).

---

## Phase 3: Report

Tell the user:

- The full path to the generated file.
- How to open it (`open <path>` on macOS, equivalent elsewhere).
- A short summary: files and directories scanned (read these from the
  manifest's `tree.descendants_file_count` and `tree.descendants_dir_count`
  — you can grep them out of the output HTML's embedded JSON).

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

## Quick reference — codecity.sh

| Flag | Default | Description |
| --- | --- | --- |
| `--root <path>` | required | Directory to scan |
| `--output <path>` | required | Where to write the self-contained HTML |
| `--depth <n>` | unlimited | Max directory depth |
| `--gitignore` / `--no-gitignore` | on | Respect `.gitignore` or not |
| `--include <pat>` | — | Only matching filenames (glob) |
| `--exclude <pat>` | — | Skip matching filenames (glob) |
| `--dev` | — | Dev-only: scans + launches vite HMR instead of writing HTML |

The resulting HTML is self-contained apart from a single CDN fetch of
Three.js on first open. Works from `file://` with no server.
