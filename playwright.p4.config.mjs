import { defineConfig } from '@playwright/test';

const external = process.env.P4_E2E_BASE_URL;
if (external && external !== 'http://127.0.0.1:3095') throw new Error('P4 checks require the dedicated local mock preview.');
export default defineConfig({
  testDir: './tests/browser',
  testMatch: 'p4-corridors.spec.mjs',
  workers: 1,
  timeout: 60_000,
  webServer: external ? undefined : {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 --port 3095',
    url: 'http://127.0.0.1:3095/rates/alerts',
    env: { P6_E2E_BUILD: '1', NEXT_PUBLIC_USE_MOCK_API: 'true' },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  use: { channel: 'chrome', headless: true, trace: 'off', screenshot: 'off', video: 'off' },
  reporter: 'list',
});
