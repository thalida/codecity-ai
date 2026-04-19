import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Project layout:
//   skills/codecity/src/        — vite root, ES module renderer sources
//   skills/codecity/dist/       — vite build output (committed)
//   skills/codecity/defaults.json, tests/e2e/fixtures/manifest.json — dev data
//
// Dev mode (`npm run dev`):
//   The `codecity-dev-inject` plugin fills the __MANIFEST__, __CONFIG__, and
//   __PROJECT_NAME__ tokens in index.html with real fixture content so the
//   dev server renders a real city. Override the sources via env vars:
//     CODECITY_MANIFEST=path  CODECITY_CONFIG=path  CODECITY_PROJECT=name
//
// Build mode (`npm run build`):
//   No substitution happens — the tokens are left in place so build.sh can
//   fill them on the user's machine at skill runtime. vite-plugin-singlefile
//   inlines all JS + CSS (including Three.js) into one HTML file.

const repoRoot = import.meta.dirname;
const skillRoot = resolve(repoRoot, 'skills/codecity');
const srcRoot = resolve(skillRoot, 'src');

const defaultManifest = resolve(skillRoot, 'tests/e2e/fixtures/manifest.json');
const defaultConfig   = resolve(skillRoot, 'defaults.json');

function devInjectPlugin() {
  return {
    name: 'codecity-dev-inject',
    apply: 'serve',
    transformIndexHtml(html) {
      const manifestPath = process.env.CODECITY_MANIFEST || defaultManifest;
      const configPath   = process.env.CODECITY_CONFIG   || defaultConfig;
      const project      = process.env.CODECITY_PROJECT  || 'dev';
      const manifest = readFileSync(manifestPath, 'utf8').trim();
      const config   = readFileSync(configPath,   'utf8').trim();
      return html
        .replace('__PROJECT_NAME__', project)
        .replace('__MANIFEST__', manifest)
        .replace('__CONFIG__', config);
    },
  };
}

export default defineConfig({
  root: srcRoot,
  base: './',
  build: {
    outDir: resolve(skillRoot, 'dist'),
    emptyOutDir: true,
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
  plugins: [
    devInjectPlugin(),
    viteSingleFile(),
  ],
});
