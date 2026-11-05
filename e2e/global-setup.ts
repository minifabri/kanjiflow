/**
 * Prepara un database pulito per i test end-to-end: migrazioni + import del dataset.
 * E2E_SKIP_MIGRATE=1 se le migrazioni sono già state applicate da un altro strumento.
 */
import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";

export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "file:./e2e.db";
  const env = { ...process.env, DATABASE_URL: url };
  if (!process.env.E2E_SKIP_MIGRATE) {
    if (url.startsWith("file:")) rmSync(path.resolve(url.slice(5)), { force: true });
    execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  }
  execSync("npx tsx scripts/seed.ts", { stdio: "inherit", env });
}
