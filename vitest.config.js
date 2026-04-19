import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Tests live next to the source they exercise — e.g. src/renderer/tests/.
    include: ['src/**/tests/**/*.test.js'],
    environment: 'jsdom',
  },
});
