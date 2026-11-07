import { defineConfig } from '@playwright/test';

const baseURL = process.env.P6_E2E_BASE_URL || 'http://127.0.0.1:3086';
const target = new URL(baseURL);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname)) {
  throw new Error('These P6 tests are restricted to a local frontend preview.');
}

export default defineConfig({
  testDir: './tests/browser',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  outputDir: 'test-results/browser-artifacts',
  reporter: [['list'], ['json', { outputFile: 'test-results/playwright-summary.json' }]],
  use: {
    baseURL,
    browserName: 'chromium',
    channel: 'chrome',
    viewport: { width: 1440, height: 1000 },
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    // Login tokens, passwords and OTPs must not enter a trace/HAR/video.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [
    { name: 'smoke', testMatch: '**/*.smoke.spec.mjs' },
    { name: 'live-confirmation', testMatch: '**/*.live.spec.mjs', use: { headless: false } },
  ],
});
