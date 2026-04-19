import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'src/renderer/tests/e2e',
  // globalSetup builds test-city.html from the real pipeline (build.sh +
  // committed manifest fixture) before any spec runs, so e2e exercises the
  // same HTML the skill produces in production.
  globalSetup: './src/renderer/tests/e2e/global-setup.js',
  // The assembled HTML imports Three.js from jsdelivr. The first page.goto
  // per run can take a while on a cold cache, so the per-test timeout is
  // generous.
  timeout: 90_000,
  use: {
    browserName: 'chromium',
    headless: true,
    navigationTimeout: 60_000,
  },
});
