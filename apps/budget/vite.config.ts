import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * R&M Budget site (Build 1, 2026-11-18): a separate site from the survey PWA, so nothing of it is
 * downloaded or cached on surveyors' phones. No service worker, no offline cache.
 */
export default defineConfig({
  envDir: 'env',
  plugins: [react(), tailwindcss()],
  server: { port: 5174, strictPort: true },
  preview: { port: 4174, strictPort: true },
  build: { chunkSizeWarningLimit: 2000 },
});
