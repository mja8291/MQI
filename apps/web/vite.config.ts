import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const src = (p: string) => fileURLToPath(new URL(`./src/${p}`, import.meta.url));

/**
 * Digital Asset Links for the v2 Android TWA (android/README.md): served at
 * /.well-known/assetlinks.json only when both the package name and the signing SHA-256 are set
 * for this mode, so a placeholder can never be published.
 */
function assetLinks(mode: string): Plugin {
  const env = loadEnv(mode, 'env', 'TWA_');
  const pkg = env.TWA_PACKAGE_NAME?.trim();
  const fingerprints = (env.TWA_SHA256_FINGERPRINTS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return {
    name: 'mqi-assetlinks',
    apply: 'build',
    generateBundle() {
      if (!pkg || !fingerprints.length) return;
      const statement = [
        {
          relation: ['delegate_permission/common.handle_all_urls'],
          target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: fingerprints },
        },
      ];
      this.emitFile({ type: 'asset', fileName: '.well-known/assetlinks.json', source: JSON.stringify(statement, null, 2) + '\n' });
    },
  };
}

export default defineConfig(({ mode }) => ({
  envDir: 'env',
  // v1 screens are ported with their imports intact: @/ is src/, next/* are small shims.
  resolve: {
    alias: [
      { find: 'next/navigation', replacement: src('shims/next-navigation.ts') },
      { find: 'next/link', replacement: src('shims/next-link.tsx') },
      { find: 'next/image', replacement: src('shims/next-image.tsx') },
      { find: /^@\//, replacement: src('') },
    ],
  },
  plugins: [
    assetLinks(mode),
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      // Registered from src/app/pwa.ts: no inline script, so the CSP can stay script-src 'self'.
      injectRegister: false,
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
      manifest: {
        id: '/',
        name: 'TCF MQI Survey',
        short_name: 'MQI Survey',
        description: 'Maintenance Quality Index inspections for TCF school campuses — works offline, syncs when back online.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait-primary',
        background_color: '#f1f4ee',
        theme_color: '#0e5c4d',
        lang: 'en-PK',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  worker: { format: 'es' },
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1200 },
}));
