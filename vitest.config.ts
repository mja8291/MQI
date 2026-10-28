import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 4,
    passWithNoTests: true,
    projects: [
      { extends: true, test: { name: 'shared', root: './packages/shared', include: ['src/**/*.test.ts'], environment: 'node' } },
      { extends: true, test: { name: 'gas', root: './apps/gas', include: ['src/**/*.test.ts'], environment: 'node' } },
      './tools/fixtures/vitest.config.ts',
      './apps/web/vitest.config.ts',
    ],
  },
});
