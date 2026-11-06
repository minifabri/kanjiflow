/**
 * Accesso diretto al database per i test end-to-end, sia SQLite sia PostgreSQL.
 * Le query usano segnaposto $1, $2…; per SQLite vengono convertiti in "?".
 */
import Database from "better-sqlite3";
import path from "node:path";
import { Client } from "pg";

export const E2E_DB_URL = process.env.E2E_DATABASE_URL ?? "file:./e2e.db";
const isPg = E2E_DB_URL.startsWith("postgres");

type Param = string | number | boolean | Date | null;

export async function query<T = Record<string, unknown>>(sql: string, params: Param[] = []): Promise<T[]> {
  if (isPg) {
    const c = new Client({ connectionString: E2E_DB_URL });
    await c.connect();
    try {
      // Prisma salva le date in UTC in colonne "timestamp" senza fuso: il driver pg userebbe il fuso locale.
      const args = params.map((p) => (p instanceof Date ? p.toISOString() : p));
      return (await c.query(sql, args)).rows as T[];
    } finally {
      await c.end();
    }
  }
  const db = new Database(path.resolve(E2E_DB_URL.slice("file:".length)));
  try {
    const stmt = db.prepare(sql.replace(/\$\d+/g, "?"));
    // Prisma su SQLite salva le date come millisecondi e i booleani come 0/1.
    const args = params.map((p) => (p instanceof Date ? p.getTime() : typeof p === "boolean" ? (p ? 1 : 0) : p));
    return (stmt.reader ? stmt.all(...args) : (stmt.run(...args), [])) as T[];
  } finally {
    db.close();
  }
}
