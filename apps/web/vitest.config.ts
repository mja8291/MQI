import { defineProject } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineProject({
  resolve: { alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('./src/', import.meta.url)) }] },
  test: {
    name: 'web',
    root: import.meta.dirname,
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 4,
  },
});
