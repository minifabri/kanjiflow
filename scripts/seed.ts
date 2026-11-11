/**
 * Importa il dataset versionato e i brani di lettura, e garantisce l'esistenza dell'utente unico.
 * Idempotente: può essere rieseguito a ogni aggiornamento del dataset.
 * Uso: npm run db:seed   (KANJIFLOW_FORCE_IMPORT=1 per reimportare anche la stessa versione)
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { createAdapter } from "../src/server/db-adapter";
import { importDataset } from "../src/server/content/import-dataset";
import { importReading } from "../src/server/content/import-reading";
import { ensureOwner } from "../src/server/user";

async function main() {
  // Import massivo: meglio la connessione diretta del pooler, se disponibile (Neon su Vercel).
  const direct = process.env.DATABASE_URL_UNPOOLED ?? process.env.POSTGRES_URL_NON_POOLING;
  if (direct && process.env.DATABASE_PROVIDER === "postgresql") process.env.DATABASE_URL = direct;
  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    const file = path.resolve(__dirname, "../data/dataset/kanjiflow-n5-n3.json");
    const started = Date.now();
    const report = await importDataset(prisma, JSON.parse(readFileSync(file, "utf8")), console.log);
    // I brani di lettura vanno importati dopo i soggetti: ogni parola viene collegata a kanji e vocaboli.
    const readingDir = path.resolve(__dirname, "../data/curated/reading");
    const readingFiles = readdirSync(readingDir)
      .filter((f) => f.endsWith(".json"))
      .sort()
      .map((f) => JSON.parse(readFileSync(path.join(readingDir, f), "utf8")));
    const reading = await importReading(prisma, readingFiles);
    const userId = await ensureOwner(prisma);
    console.log(
      `✓ dataset v${report.version}: ${report.created} creati, ${report.updated} aggiornati, ${report.unchanged} invariati (${((Date.now() - started) / 1000).toFixed(1)}s) · utente ${userId}`,
    );
    console.log(`✓ lettura: ${reading.total} brani, ${reading.created} creati, ${reading.updated} aggiornati, ${reading.unchanged} invariati`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
