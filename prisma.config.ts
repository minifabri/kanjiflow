import "dotenv/config";
import { defineConfig } from "prisma/config";

// DATABASE_PROVIDER=postgresql usa lo schema generato in prisma/postgres/.
const isPg = process.env.DATABASE_PROVIDER === "postgresql";

export default defineConfig({
  schema: isPg ? "prisma/postgres/schema.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isPg ? "prisma/postgres/migrations" : "prisma/migrations",
    seed: "tsx scripts/seed.ts",
  },
  datasource: {
    // Le migrazioni usano la connessione diretta (non quella del pooler) quando disponibile, es. Neon su Vercel.
    url: process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING ?? process.env.DATABASE_URL ?? "file:./dev.db",
    // Usato solo da `prisma migrate diff/dev` su PostgreSQL (CI e sviluppo).
    ...(process.env.SHADOW_DATABASE_URL ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL } : {}),
  },
});
