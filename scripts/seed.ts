/**
 * Importa il dataset versionato e garantisce l'esistenza dell'utente unico.
 * Idempotente: può essere rieseguito a ogni aggiornamento del dataset.
 * Uso: npm run db:seed   (KANJIFLOW_FORCE_IMPORT=1 per reimportare anche la stessa versione)
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client";
import { createAdapter } from "../src/server/db-adapter";
import { importDataset } from "../src/server/content/import-dataset";
import { ensureSingleUser } from "../src/server/user";

async function main() {
  const prisma = new PrismaClient({ adapter: createAdapter() });
  try {
    const file = path.resolve(__dirname, "../data/dataset/kanjiflow-n5-n3.json");
    const started = Date.now();
    const report = await importDataset(prisma, JSON.parse(readFileSync(file, "utf8")), console.log);
    const userId = await ensureSingleUser(prisma);
    console.log(
      `✓ dataset v${report.version}: ${report.created} creati, ${report.updated} aggiornati, ${report.unchanged} invariati (${((Date.now() - started) / 1000).toFixed(1)}s) · utente ${userId}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
