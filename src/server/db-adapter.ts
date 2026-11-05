/**
 * Adapter Prisma in base al provider: SQLite in sviluppo, PostgreSQL in deploy.
 * Il client generato deve corrispondere al provider (vedi `npm run db:pg:generate`).
 */
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaPg } from "@prisma/adapter-pg";

export function createAdapter() {
  const url = process.env.DATABASE_URL ?? "file:./dev.db";
  if (process.env.DATABASE_PROVIDER === "postgresql") {
    return new PrismaPg({ connectionString: url });
  }
  return new PrismaBetterSqlite3({ url });
}
