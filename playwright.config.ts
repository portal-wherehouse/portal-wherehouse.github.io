import { defineConfig } from '@playwright/test';
import { assertLocal } from './tests/firebase/guard.mjs';

// Reject live Firebase settings before building or opening a browser.
assertLocal(process.env, false);

// Runs against the production build served by `vite preview`.
// In sandboxes with a preinstalled Chromium, set PW_CHROMIUM=/path/to/chromium.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1280, height: 900 },
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'VITE_APP_MODE=demo npm run build && npx vite preview --port 4173 --strictPort',
    port: 4173,
    // Never reuse an unrelated local server that could have live configuration.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
