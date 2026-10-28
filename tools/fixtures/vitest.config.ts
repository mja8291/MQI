import { defineProject } from 'vitest/config';
import type { Plugin } from 'vite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const V1 = resolve(ROOT, 'reference/src');
const V2_WEB = resolve(ROOT, 'apps/web/src');
const EMPTY = resolve(ROOT, 'tools/fixtures/src/v1-stubs/empty.ts');

/**
 * The parity suite loads v1's real code (reference/, read-only) next to v2's. Both use "@/…"
 * imports, so "@/" resolves to whichever tree the importing file lives in.
 */
function twoTreeAlias(): Plugin {
  return {
    name: 'mqi-two-tree-alias',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (source === 'server-only') return EMPTY;
      if (!source.startsWith('@/')) return null;
      const tree = importer && resolve(importer).startsWith(V1) ? V1 : V2_WEB;
      return this.resolve(resolve(tree, source.slice(2)), importer, { skipSelf: true });
    },
  };
}

export default defineProject({
  plugins: [twoTreeAlias()],
  test: {
    name: 'fixtures',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    hookTimeout: 30_000,
    maxWorkers: 4,
    env: { MQI_V1_PRESENT: existsSync(V1) ? '1' : '' },
  },
});
