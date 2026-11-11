import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'server/**/*.test.ts', 'web/src/**/*.test.{ts,tsx}'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
