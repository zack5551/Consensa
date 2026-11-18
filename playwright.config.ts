import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const LIVE_PORT = Number(process.env.E2E_LIVE_PORT ?? 3601);
const MOCK_PORT = Number(process.env.MOCK_SUPABASE_PORT ?? 3602);

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
    // World/VPN test: a second copy of the app (its own production build folder) with accounts on, reading a mock Supabase.
    { command: "node tests/e2e/support/mock-supabase.mjs", port: MOCK_PORT, reuseExistingServer: !process.env.CI, env: { MOCK_SUPABASE_PORT: String(MOCK_PORT) } },
    {
      command: `pnpm exec next build && pnpm exec next start -p ${LIVE_PORT}`,
      url: `http://localhost:${LIVE_PORT}/en`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        NEXT_DIST_DIR: ".next-e2e",
        NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${MOCK_PORT}`,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "e2e-publishable-key-0000000000",
        SUPABASE_SECRET_KEY: "e2e-secret-key-000000000000000",
      },
    },
  ],
});
