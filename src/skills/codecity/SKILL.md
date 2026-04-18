---
name: codecity
description: >
  Use when the user asks to visualize a codebase, show a code city, render a city from a folder/repo,
  or invokes /codecity. Generates an isometric 2.5D city where directories are streets and files are buildings.
version: 1.0.0
argument-hint: "[path] [--depth n] [--output path] [--exclude pattern]"
allowed-tools: [Read, Glob, Grep, Write, Bash, AskUserQuestion]
---

# CodeCity Agent Instructions

You are generating an isometric 2.5D code city visualization. The output is a single self-contained HTML file the user can open in any browser. Follow all five phases in order.

---

## Determining the Plugin Directory

All file paths in these instructions are relative to the **plugin directory** — the directory containing this SKILL.md file. In Claude Code and most platforms, you can derive it from the path of this file itself:

- This file lives at: `<plugin-dir>/src/skills/codecity/SKILL.md`
- Therefore `<plugin-dir>` is three levels up from this file's location

Resolve `<plugin-dir>` before any other step. All subsequent relative paths (e.g. `src/scanner/scan.sh`) are relative to `<plugin-dir>`.

---

## Phase 1: Clarify

Use `AskUserQuestion` (or your platform's equivalent interactive prompt) to collect any information the user did not already supply in their invocation.

**Skip any question whose answer was already provided** — for example, if the user ran `/codecity ./src --depth 2`, skip questions 1 and 2.

Ask these questions (only the unanswered ones):

1. **What to scan?**
   What folder or repo should I visualize? *(default: current working directory)*

2. **How deep?**
   How many directory levels deep should I scan? *(default: unlimited — full scan)*

3. **Filters?**
   Any files or patterns to include or exclude? `.gitignore` is respected by default. You can also pass `--include <pattern>` or `--exclude <pattern>`. *(default: gitignore on, no custom filters)*

4. **Where to save?**
   Where should I write the output HTML file? *(default: `~/.codecity/`)*

5. **Color overrides?**
   Do you want to customize any building colors? The default palette maps file extensions to hues (e.g. TypeScript = blue, Python = orange). *(default: use built-in palette)*

Once you have answers to all five questions, proceed to Phase 2.

---

## Phase 2: Scan

Run the scanner to produce a JSON manifest of the target directory tree.

**Command:**

```
bash <plugin-dir>/src/scanner/scan.sh \
  --root <path> \
  [--depth <n>] \
  [--no-gitignore] \
  [--include <pattern>] \
  [--exclude <pattern>]
```

- Replace `<path>` with the resolved, absolute path of the directory to scan.
- Include `--depth <n>` only if the user specified a depth limit.
- Include `--no-gitignore` only if the user explicitly disabled gitignore filtering.
- Include `--include` / `--exclude` only if the user provided custom patterns.
- Do **not** pass `--output`; capture the JSON from stdout.

**Capture the output** into a variable you will reference in Phase 4 as `MANIFEST`.

**Error handling:** If the scan command exits with a non-zero status or produces no output, stop and report the error to the user. Common causes: path does not exist, permission denied, `jq` not installed. Do not proceed to Phase 3 with an empty or invalid manifest.

---

## Phase 3: Read Renderer Modules

Read all of these files from the plugin directory. You need their full contents to assemble the HTML in Phase 4.

```
<plugin-dir>/src/renderer/engine.js
<plugin-dir>/src/renderer/colors.js
<plugin-dir>/src/renderer/layout.js
<plugin-dir>/src/renderer/sidebar.js
<plugin-dir>/src/renderer/interactions.js
<plugin-dir>/src/renderer/styles.css
<plugin-dir>/src/config/defaults.json
```

Read all seven files before proceeding. Their contents will be inlined directly into the assembled HTML.

---

## Phase 4: Assemble

Build a single self-contained HTML file. Everything must be inline — no external scripts, no external stylesheets, no network requests. The file must work when opened from the local filesystem (`file://`).

**Determine the project name** from the scanned path (use the base directory name, e.g. scanning `/home/user/myproject` → project name is `myproject`).

**Determine today's date** in `YYYY-MM-DD` format for the filename.

**Merge the CONFIG object** by starting from the `defaults.json` content and applying any user-provided overrides (palette changes, depth, output dir). The result is the CONFIG constant embedded in the HTML.

Use this exact structure:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeCity — {project-name}</title>
  <style>
    {full contents of styles.css}
  </style>
</head>
<body>
  <canvas id="city"></canvas>
  <div id="sidebar"></div>
  <script>
    const MANIFEST = {scanner JSON output};
    const CONFIG = {merged defaults.json + user overrides as a JS object literal};
    {full contents of engine.js}
    {full contents of colors.js}
    {full contents of layout.js}
    {full contents of sidebar.js}
    {full contents of interactions.js}
    window.addEventListener('load', function() {
      startRenderLoop(document.getElementById('city'), MANIFEST, CONFIG);
    });
  </script>
</body>
</html>
```

**Assembly rules:**

- Replace `{project-name}` with the actual project name in the `<title>` tag.
- Replace `{full contents of styles.css}` with the raw text of `styles.css`.
- Replace `{scanner JSON output}` with the raw JSON captured from Phase 2. It must be valid JSON assigned to a `const`, so ensure the JSON is syntactically valid as a JS value (standard JSON is valid here).
- Replace `{merged defaults.json + user overrides as a JS object literal}` with a JS object literal derived from `defaults.json` merged with any user overrides. This is a JS assignment, not a JSON string — write it as a plain object literal.
- Concatenate the five JS files in the order shown: `engine.js`, `colors.js`, `layout.js`, `sidebar.js`, `interactions.js`. Place each file's full contents as-is, separated by a blank line.
- The `startRenderLoop` call at the end wires everything together. This function is defined in `interactions.js`.

---

## Phase 5: Write and Report

**Determine the output path:**

1. Per-run override — if the user passed an explicit output path for this invocation, use it.
2. Configured default — if the user has a persistent preference set, use it.
3. Fallback — `~/.codecity/`

**Construct the filename:**

```
codecity-{projectname}-{YYYY-MM-DD}.html
```

For example: `codecity-myproject-2026-04-18.html`

**Write the file:**

1. Run `mkdir -p <output-dir>` to ensure the directory exists.
2. Write the assembled HTML to `<output-dir>/codecity-{projectname}-{YYYY-MM-DD}.html`.

**Report to the user:**

Tell the user:
- The full path to the generated file.
- How to open it (e.g. "Open this file in any browser: `open ~/.codecity/codecity-myproject-2026-04-18.html`" on macOS, or the equivalent for their platform).
- A brief summary: how many files and directories were scanned.

---

## Building Properties Reference

Use this legend to explain the visualization to the user if they ask:

| Visual Property | Data Source | Meaning |
|----------------|-------------|---------|
| Height | Line count | Taller = more lines of code |
| Width | File size (bytes) | Wider = larger file |
| Depth | Blend of width and height | `lerp(width, height, 0.5)` |
| Hue | File extension | Language family (blue = JS/TS, orange = Python, green = CSS, etc.) |
| Saturation | File age (created date) | Vivid = newer file, faded/grey = older file |
| Lightness | Last modified date | Bright = recently changed, dim = long untouched |

**Street width** reflects directory size: narrow alleys for small directories, wide boulevards for directories with many children.

**Git data is preferred** over filesystem dates for saturation and lightness when the scanned directory is a git repository.

---

## Quick Reference: scan.sh Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--root <path>` | required | Directory to scan |
| `--depth <n>` | unlimited | Max directory depth |
| `--gitignore` | on | Respect .gitignore (default) |
| `--no-gitignore` | — | Disable .gitignore filtering |
| `--include <pattern>` | — | Only include matching filenames |
| `--exclude <pattern>` | — | Exclude matching filenames |

The scanner outputs JSON to stdout. Capture it directly — do not write to a temp file unless the output is too large to hold in memory (unusual for typical codebases).
