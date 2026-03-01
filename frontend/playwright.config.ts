import { defineConfig } from "@playwright/test";

const isCI = Boolean(process.env.CI);
const frontendPort = Number(process.env.FRONTEND_PORT ?? 3100);
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:4000";
const frontendBaseUrl = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${frontendPort}`;

const backendStartCommand =
  process.platform === "win32"
    ? "npm.cmd --prefix .. run start"
    : "npm --prefix .. run start";
const frontendStartCommand =
  process.platform === "win32"
    ? `npm.cmd run dev -- --port ${frontendPort}`
    : `npm run dev -- --port ${frontendPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: isCI ? 1 : 0,
  workers: isCI ? 1 : undefined,
  reporter: isCI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: frontendBaseUrl,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: [
    {
      command: backendStartCommand,
      url: `${apiBaseUrl.replace(/\/$/, "")}/health`,
      timeout: 120_000,
      reuseExistingServer: true,
      env: {
        ...process.env,
        PORT: process.env.PORT ?? "4000",
        CORS_ORIGIN: frontendBaseUrl,
      },
    },
    {
      command: frontendStartCommand,
      url: `${frontendBaseUrl}/login`,
      timeout: 180_000,
      reuseExistingServer: !isCI,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_BASE_URL: apiBaseUrl,
      },
    },
  ],
});
