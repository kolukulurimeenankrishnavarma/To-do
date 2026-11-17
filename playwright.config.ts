import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const API_PORT = 8788;
const WEB_PORT = 4173;
const DB_FILE = path.resolve(process.cwd(), "test-results", "e2e-db.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      command: "node server/index.mjs",
      url: `http://127.0.0.1:${API_PORT}/api/health`,
      env: {
        TASKLY_TEST_MODE: "1",
        TASKLY_DB: DB_FILE,
        TASKLY_PORT: String(API_PORT),
        TASKLY_HOST: "127.0.0.1",
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `npm run dev:web -- --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      env: {
        VITE_API_TARGET: `http://127.0.0.1:${API_PORT}`,
      },
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
