import { defineConfig } from '@playwright/test';
import { assertLocal } from './tests/firebase/guard.mjs';

// Reject live Firebase settings before building or opening a browser.
assertLocal(process.env, false);

// PW_PORT lets two checkouts run their browser tests side by side.
const port = Number(process.env.PW_PORT) || 4173;

// Runs against the production build served by `vite preview`.
// In sandboxes with a preinstalled Chromium, set PW_CHROMIUM=/path/to/chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${port}`,
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: `VITE_APP_MODE=demo npm run build && npx vite preview --port ${port} --strictPort`,
    port,
    // Never reuse an unrelated local server that could have live configuration.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
