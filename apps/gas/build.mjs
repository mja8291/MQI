// Bundles the Apps Script project into dist/Code.js (clasp 3 does not transpile TypeScript).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

mkdirSync('dist', { recursive: true });

/**
 * Apps Script re-parses the whole bundle on every request, so size is latency.
 * Zod re-exports every locale (~60 languages); keep English only.
 */
const zodEnglishOnly = {
  name: 'zod-english-only',
  setup(b) {
    b.onLoad({ filter: /zod[\\/]v4[\\/]locales[\\/]index\.js$/ }, (args) => ({
      contents: 'export { default as en } from "./en.js";',
      loader: 'js',
      resolveDir: dirname(args.path),
    }));
  },
};

await build({
  plugins: [zodEnglishOnly],
  entryPoints: ['src/main.ts'],
  bundle: true,
  format: 'iife',
  globalName: '__mqi',
  target: 'es2020',
  platform: 'neutral',
  mainFields: ['module', 'main'],
  outfile: 'dist/Code.js',
  legalComments: 'none',
  minify: true,
  keepNames: true,
  logLevel: 'info',
});

// Apps Script only sees top-level function declarations.
const shim = `
function setup() { return __mqi.setup(); }
function benchmarkPasswordHash() { return __mqi.benchmarkPasswordHash(); }
function doPost(e) { return __mqi.doPost(e); }
function doGet(e) { return __mqi.doGet(e); }
`;
writeFileSync('dist/Code.js', readFileSync('dist/Code.js', 'utf8') + shim);
copyFileSync('appsscript.json', 'dist/appsscript.json');
console.log('Built dist/Code.js');
