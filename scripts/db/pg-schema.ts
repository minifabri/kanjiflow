/**
 * Genera prisma/postgres/schema.prisma dallo schema SQLite (unica fonte di verità).
 * Uso: npm run db:pg:schema
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const src = readFileSync(path.join(root, "prisma/schema.prisma"), "utf8");
const out = src
  .replace('provider = "sqlite"', 'provider = "postgresql"')
  .replace('output   = "../src/generated/prisma"', 'output   = "../../src/generated/prisma"')
  .replace(/^\/\/ KanjiFlow — schema relazionale\./m, "// FILE GENERATO da scripts/db/pg-schema.ts — non modificare a mano.\n// KanjiFlow — schema relazionale.");
if (out === src) throw new Error("Sostituzione del provider non riuscita");
mkdirSync(path.join(root, "prisma/postgres"), { recursive: true });
writeFileSync(path.join(root, "prisma/postgres/schema.prisma"), out);
console.log("✓ prisma/postgres/schema.prisma");
