import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'skills/codecity/tests/e2e',
  // globalSetup calls build.sh on the committed dist/ template + the fixture
  // manifest, producing test-city.html under tests/e2e/.generated/. Run
  // `npm run build` first (or use `npm run test:e2e` which does both).
  globalSetup: './skills/codecity/tests/e2e/global-setup.js',
  timeout: 30_000,
  use: {
    browserName: 'chromium',
    headless: true,
    navigationTimeout: 15_000,
  },
});
