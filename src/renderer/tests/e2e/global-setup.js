// global-setup.js — Playwright globalSetup hook.
//
// Runs once before any spec executes. Invokes build.sh against the committed
// manifest fixture + src/config/defaults.json to produce a fresh
// .generated/test-city.html. The spec files load that HTML via file://.
//
// Keeping the build step here instead of a hand-maintained harness means
// every e2e run exercises the real production pipeline (template.html +
// build.sh). A rename or new renderer source is picked up automatically.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
  const here = __dirname;
  const repoRoot = path.resolve(here, '../../../..');
  const build = path.join(repoRoot, 'src/skills/codecity/build.sh');
  const manifest = path.join(here, 'fixtures/manifest.json');
  const config = path.join(repoRoot, 'src/config/defaults.json');
  const outDir = path.join(here, '.generated');
  const output = path.join(outDir, 'test-city.html');

  fs.mkdirSync(outDir, { recursive: true });

  execFileSync('bash', [
    build,
    '--project',  'sample-repo',
    '--manifest', manifest,
    '--config',   config,
    '--output',   output,
  ], { stdio: 'inherit' });
};
