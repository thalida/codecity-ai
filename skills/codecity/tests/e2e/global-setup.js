// global-setup.js — Playwright globalSetup hook.
//
// Runs build.sh against the committed dist/city-template.html + the committed
// manifest fixture to produce .generated/test-city.html. Specs load it via
// file://. Assumes `npm run build` has already produced dist/ — `npm run
// test:e2e` chains them; CI should too.

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

module.exports = async () => {
  const here = __dirname;
  const skillRoot = path.resolve(here, '../..');
  const build = path.join(skillRoot, 'build.sh');
  const manifest = path.join(here, 'fixtures/manifest.json');
  const config = path.join(skillRoot, 'defaults.json');
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
