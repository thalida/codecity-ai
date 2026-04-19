import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'src/tests/e2e',
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
