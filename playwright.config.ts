import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } } },
  ],
  webServer: [
    {
      command: `pnpm build && pnpm start -p ${PORT}`,
      url: `http://localhost:${PORT}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
    // World/VPN test: a second copy of the app (dev mode, its own build folder) with accounts on, reading a mock Supabase.
    { command: "node tests/e2e/support/mock-supabase.mjs", port: 3102, reuseExistingServer: !process.env.CI },
    {
      command: "pnpm exec next dev -p 3101",
      url: "http://localhost:3101/en",
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:3102",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key-0000000000",
        SUPABASE_SECRET_KEY: "e2e-secret-key-000000000000000",
      },
    },
  ],
});
