# CodeCity AI

CodeCity AI is an AI plugin that visualizes codebases as isometric 2.5D cities. Give an agent a directory and it walks the tree, collects file metadata and git history, then assembles a single self-contained HTML file you can open in any browser. Directories become streets — wide boulevards for large directories, narrow alleys for small ones. Files become buildings whose shape and color encode information: how big the file is, how old it is, when it was last touched, and what language it is written in.

## Quick start

Install as a Claude Code plugin:

```sh
claude plugin add github:thalida/codecity-ai
```

Then either run the slash command or ask naturally:

```text
/codecity
/codecity ./src --depth 3
show me the city for this repo
```

The agent will ask a few clarifying questions (what to scan, how deep, where to save the output), generate the HTML file, and tell you where to open it.

## Building properties

Each file in the tree becomes a building. Visual properties map directly to file data:

| Property   | Data source           | Meaning                                                            |
| ---------- | --------------------- | ------------------------------------------------------------------ |
| Height     | Line count            | Taller = more lines of code                                        |
| Width      | File size (bytes)     | Wider = larger file on disk                                        |
| Depth      | Blend of height/width | `lerp(width, height, 0.5)`                                         |
| Hue        | File extension        | Language family (blue = JS/TS, orange = Python, green = CSS, etc.) |
| Saturation | File age (created)    | Vivid = newer file, faded = older file                             |
| Lightness  | Last modified date    | Bright = recently changed, dim = long untouched                    |

Git data is preferred over filesystem dates for saturation and lightness when the target directory is a git repository.

## Configuration

The agent accepts flags directly in the invocation:

```text
/codecity ./src --depth 2
/codecity --output ~/Desktop --exclude "*.test.*"
/codecity --no-gitignore --include "*.ts"
```

| Flag                  | Default        | Description                              |
| --------------------- | -------------- | ---------------------------------------- |
| `--depth <n>`         | unlimited      | Max directory levels to scan             |
| `--output <path>`     | `~/.codecity/` | Where to write the HTML file             |
| `--exclude <pattern>` | —              | Skip files matching this pattern         |
| `--include <pattern>` | —              | Only include files matching this pattern |
| `--no-gitignore`      | —              | Disable `.gitignore` filtering           |

Color overrides are also supported — ask the agent to change the hue for a specific file extension. The default palette is in `src/config/defaults.json`.

## Installation on other platforms

### Cursor

Copy or symlink the plugin directory into your Cursor rules folder, then reference the skill file from your project's `.cursor/rules`.

### Codex

```sh
ln -s /path/to/codecity-ai ~/.codex/plugins/codecity-ai
```

### OpenCode

Add the plugin path to your OpenCode configuration under the `plugins` key.

### Gemini

Place the plugin directory where Gemini can resolve it as a tool and reference `src/skills/codecity/SKILL.md` as the skill definition.

## Development

```text
src/
  config/defaults.json           # default palette and building size config
  scanner/
    scan.sh                      # walks a directory tree, outputs JSON manifest
    tests/
      test-scan.sh               # integration tests for scan.sh
      fixtures/
        setup.sh                 # creates a deterministic sample git repo
        sample-repo/             # generated, not committed
  renderer/
    engine.js                    # Three.js scene builder (buildings/streets/gem)
    colors.js                    # HSL color mapping from file metadata
    layout.js                    # street and building placement
    sidebar.js                   # file info panel
    tree.js                      # left tree sidebar
    interactions.js              # OrbitControls + raycaster + render loop
    styles.css                   # page and sidebar styles
    tests/
      *.test.js                  # vitest unit tests (colors, layout, tree)
      dev-harness.html           # open directly for fast renderer iteration
      e2e/
        city.spec.js             # Playwright tests over the real built HTML
        global-setup.js          # pre-builds test-city.html via build.sh
        fixtures/manifest.json   # committed scanner output used by e2e
  skills/codecity/
    SKILL.md                     # agent instructions (plugin entry point)
    template.html                # HTML shell with placeholders
    build.sh                     # fills template + writes self-contained HTML
```

**Run all tests:**

```bash
npm test                         # vitest unit + playwright e2e
```

**Run scanner tests directly:**

```bash
bash src/scanner/tests/fixtures/setup.sh
bash src/scanner/tests/test-scan.sh
```

**Iterate on the renderer in a browser:**

```bash
open src/renderer/tests/dev-harness.html   # inline sample, no build step
```

**Build an HTML manually:**

```bash
bash src/scanner/scan.sh --root <path> > manifest.json
bash src/skills/codecity/build.sh \
  --project NAME \
  --manifest manifest.json \
  --config src/config/defaults.json \
  --output out.html
```

## License

[AGPL-3.0](LICENSE)
