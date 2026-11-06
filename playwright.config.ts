import { defineConfig, devices } from "@playwright/test";
import bcrypt from "bcryptjs";
import { E2E_PASSWORD, STORAGE_STATE } from "./e2e/constants";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const DB = process.env.E2E_DATABASE_URL ?? "file:./e2e.db";
// Autenticazione reale anche nei test: hash generato al volo, in base64 come in produzione.
const HASH_B64 = Buffer.from(bcrypt.hashSync(E2E_PASSWORD, 8)).toString("base64");

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "it-IT",
    timezoneId: "Europe/Rome",
    trace: "retain-on-failure",
    storageState: STORAGE_STATE,
    ...(process.env.E2E_CHANNEL ? { channel: process.env.E2E_CHANNEL } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, grep: /@mobile/ },
  ],
  webServer: {
    // Il database va preparato prima che il server lo apra.
    command: `npx tsx scripts/e2e-prepare.ts && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: DB,
      DATABASE_PROVIDER: DB.startsWith("postgres") ? "postgresql" : "",
      APP_PASSWORD_HASH_B64: HASH_B64,
      SESSION_SECRET: "e2e-session-secret-e2e-session-secret",
      E2E_SKIP_MIGRATE: process.env.E2E_SKIP_MIGRATE ?? "",
    },
  },
});
