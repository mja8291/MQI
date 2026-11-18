import { defineConfig, devices } from '@playwright/test';

// R&M Budget site: production build against the local fake API (desktop browser).
export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:4174', trace: 'retain-on-failure', acceptDownloads: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    { command: 'npm run dev:api', cwd: '../..', url: 'http://localhost:8787/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npx vite build --mode e2e && npm run preview', url: 'http://localhost:4174', reuseExistingServer: !process.env.CI, timeout: 240_000 },
  ],
});
