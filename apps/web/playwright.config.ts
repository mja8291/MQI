import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build (service worker on) and the local fake API.
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { ...devices['Pixel 7'], baseURL: 'http://localhost:4173', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    { command: 'npm run dev:api', cwd: '../..', url: 'http://localhost:8787/health', reuseExistingServer: !process.env.CI, timeout: 60_000 },
    { command: 'npx vite build --mode e2e && npm run preview', url: 'http://localhost:4173', reuseExistingServer: !process.env.CI, timeout: 240_000 },
  ],
});
