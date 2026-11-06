import type { PrismaClient } from "@/generated/prisma/client";
import { passwordHash } from "@/server/auth/session";

export const OWNER_USERNAME = "admin";

/**
 * Garantisce che esista l'utente proprietario (il primo creato), con ruolo admin.
 * Se non ha ancora una password nel database e APP_PASSWORD_HASH_B64 è configurato, la copia da lì
 * (passaggio dall'accesso a password singola agli account): i suoi progressi restano invariati.
 */
export async function ensureOwner(prisma: PrismaClient, displayName = "Studente", env: NodeJS.ProcessEnv = process.env) {
  let owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" }, include: { settings: true } });
  if (!owner) {
    owner = await prisma.user.create({
      data: { displayName, interfaceLanguage: "it", role: "admin", settings: { create: {} } },
      include: { settings: true },
    });
  }
  if (!owner.settings) await prisma.userSettings.create({ data: { userId: owner.id } });
  const bootstrap = passwordHash(env);
  const data: { role?: string; username?: string; passwordHash?: string } = {};
  if (owner.role !== "admin") data.role = "admin";
  if (!owner.username) {
    const taken = await prisma.user.findUnique({ where: { username: OWNER_USERNAME } });
    if (!taken) data.username = OWNER_USERNAME;
  }
  if (!owner.passwordHash && bootstrap) data.passwordHash = bootstrap;
  if (Object.keys(data).length) await prisma.user.update({ where: { id: owner.id }, data });
  return owner.id;
}
