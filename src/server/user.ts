import type { PrismaClient } from "@/generated/prisma/client";

/** Deploy single-user: esiste un solo utente. Tutti i dati restano comunque legati a un userId. */
export async function ensureSingleUser(prisma: PrismaClient, displayName = "Studente") {
  const existing = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, include: { settings: true } });
  if (existing) {
    if (!existing.settings) await prisma.userSettings.create({ data: { userId: existing.id } });
    return existing.id;
  }
  const user = await prisma.user.create({ data: { displayName, interfaceLanguage: "it", settings: { create: {} } } });
  return user.id;
}
