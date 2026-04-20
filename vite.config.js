import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync, copyFileSync, chmodSync, mkdirSync, renameSync, existsSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';

// Layout:
//   src/                         — vite root (renderer JS/HTML/CSS + bash sources)
//   src/scripts/*.sh             — bash sources (copied to skills/codecity/ by closeBundle)
//   skills/codecity/             — build artifact; template.html + copied bash scripts
//
// Dev mode (`npm run dev`, launched via `codecity.sh --dev`):
//   codecity.sh exports CODECITY_MANIFEST / CODECITY_CONFIG / CODECITY_PROJECT
//   pointing at files under .dev/. The dev-inject plugin reads those env vars at
//   transformIndexHtml time and fills the __MANIFEST__ / __CONFIG__ /
//   __PROJECT_NAME__ placeholders.
//
// Build mode (`npm run build`):
//   Produces skills/codecity/template.html with placeholders intact (build.sh
//   fills them at skill runtime). closeBundle hook copies src/scripts/*.sh into
//   the right spots in skills/codecity/.

const repoRoot = import.meta.dirname;
const skillDir = resolve(repoRoot, 'skills/codecity');

// Three.js is loaded from CDN via the importmap in index.html, so rollup
// treats it as external. Our own code + CSS still gets inlined into a single
// HTML by viteSingleFile.
const THREE_EXTERNAL = [/^three$/, /^three\/addons\//];

function devInjectPlugin() {
  return {
    name: 'codecity-dev-inject',
    apply: 'serve',
    transformIndexHtml(html) {
      const manifestPath = process.env.CODECITY_MANIFEST;
      const configPath   = process.env.CODECITY_CONFIG;
      const project      = process.env.CODECITY_PROJECT || 'dev';
      if (!manifestPath || !configPath) {
        throw new Error(
          'CODECITY_MANIFEST and CODECITY_CONFIG must be set for the dev server.\n' +
          'Run `npm run dev -- --root <path>` (that invokes codecity.sh --dev).'
        );
      }
      const manifest = readFileSync(manifestPath, 'utf8').trim();
      const config   = readFileSync(configPath,   'utf8').trim();
      return html
        .replaceAll('__PROJECT_NAME__', project)
        .replace('__MANIFEST__', manifest)
        .replace('__CONFIG__',   config);
    },
  };
}

// After the build, (a) rename the single HTML to skills/codecity/template.html,
// (b) copy bash modules + codecity.sh, (c) copy defaults.json. Vite writes to
// outDir (skills/codecity/) as index.html, then we rename.
function shipScriptsPlugin() {
  return {
    name: 'codecity-ship-scripts',
    apply: 'build',
    closeBundle() {
      const template = resolve(skillDir, 'template.html');
      const indexOut = resolve(skillDir, 'index.html');
      if (existsSync(indexOut)) {
        if (existsSync(template)) unlinkSync(template);
        renameSync(indexOut, template);
      }

      mkdirSync(resolve(skillDir, 'scripts'), { recursive: true });

      const copies = [
        // Plugin metadata + entry + data, flat at skills/codecity/
        { from: 'src/SKILL.md',             to: 'SKILL.md',             mode: 0o644 },
        { from: 'src/codecity.py',          to: 'codecity.py',          mode: 0o755 },
        { from: 'src/defaults.json',        to: 'defaults.json',        mode: 0o644 },
        // Python modules codecity.py imports
        { from: 'src/scripts/__init__.py',  to: 'scripts/__init__.py',  mode: 0o644 },
        { from: 'src/scripts/scan.py',      to: 'scripts/scan.py',      mode: 0o755 },
        { from: 'src/scripts/build.py',     to: 'scripts/build.py',     mode: 0o755 },
      ];
      for (const { from, to, mode } of copies) {
        const s = resolve(repoRoot, from);
        const d = resolve(skillDir, to);
        copyFileSync(s, d);
        chmodSync(d, mode);
      }
    },
  };
}

export default defineConfig({
  root: resolve(repoRoot, 'src'),
  base: './',
  build: {
    outDir: skillDir,
    emptyOutDir: false,       // don't wipe SKILL.md, defaults.json, scripts/
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      external: THREE_EXTERNAL,
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [
    devInjectPlugin(),
    viteSingleFile(),
    shipScriptsPlugin(),
  ],
});
