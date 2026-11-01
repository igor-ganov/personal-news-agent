import { defineConfig, devices } from "@playwright/test";

const API_PORT = 18787;
const APP_ORIGIN = "http://localhost:4321";
const MAX_WAIT_MS = Number(process.env.E2E_MAX_WAIT_MS ?? 10_000);

/**
 * The app as a user meets it: the real web build against a real Worker on a
 * freshly migrated local database. The browser holds a virtual authenticator,
 * so passkey sign-in runs the same WebAuthn code a phone runs.
 */
export default defineConfig({
  testDir: "./e2e",
  retries: 0,
  workers: process.env.CI ? 4 : undefined,
  reporter: "list",
  expect: { timeout: MAX_WAIT_MS },
  use: {
    baseURL: APP_ORIGIN,
    actionTimeout: MAX_WAIT_MS,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "node e2e/support/start-api.mjs",
      url: `http://127.0.0.1:${API_PORT}/health`,
      env: { E2E_API_PORT: String(API_PORT), E2E_APP_ORIGIN: APP_ORIGIN },
      reuseExistingServer: false,
      stdout: "pipe",
      timeout: 120_000,
    },
    {
      command: "pnpm --filter @pna/mobile exec astro dev",
      url: APP_ORIGIN,
      env: { PUBLIC_PNA_API_URL: `http://localhost:${API_PORT}`, PUBLIC_PNA_DIAGRAMS: "off" },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
