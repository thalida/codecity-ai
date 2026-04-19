import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['skills/codecity/tests/**/*.test.js'],
    environment: 'jsdom',
  },
});
