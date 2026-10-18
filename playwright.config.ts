import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

/**
 * End-to-end tests against a REAL local Supabase stack (`npx supabase start`)
 * and a production build of the app on port 3100 (built into .next-e2e so it
 * never clashes with `npm run dev`). Emails are read from the local Mailpit.
 *
 * Every run creates fresh, uniquely named test users and organizations; it
 * never deletes or changes existing data.
 */
loadEnvConfig(process.cwd());

const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE_URL,
    locale: "fr-FR",
    timezoneId: "Africa/Tunis",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: `npx next build && npx next start -p ${PORT}`,
    url: `${BASE_URL}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: {
      NEXT_DIST_DIR: ".next-e2e",
      // Integrations answer from offline fixtures (src/lib/integrations/fixtures.ts):
      // tests never depend on third-party services.
      SP_FAKE_INTEGRATIONS: "1",
      // Test-only fault page /app/test-fault (src/lib/server/test-hooks.ts).
      SP_TEST_FAULTS: "1",
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  },
});
