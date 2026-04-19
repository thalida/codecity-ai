import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'src/tests/e2e',
  use: {
    browserName: 'chromium',
    headless: true,
  },
});
