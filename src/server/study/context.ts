import "server-only";
import { prisma } from "@/server/db";
import { ensureSingleUser } from "@/server/user";
import { resolveSrsConfig, type SrsConfig } from "@/domain/srs";
import { parseJson } from "@/domain/settings";
import type { UserSettings } from "@/generated/prisma/client";

export interface StudyContext {
  userId: string;
  displayName: string;
  settings: UserSettings;
  srs: SrsConfig;
  timeZone: string;
}

/** Contesto dell'utente unico. L'accesso è già filtrato dal proxy di autenticazione. */
export async function getStudyContext(): Promise<StudyContext> {
  const userId = await ensureSingleUser(prisma);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { settings: true } });
  const settings = user.settings!;
  let srs: SrsConfig;
  try {
    srs = resolveSrsConfig(parseJson(settings.srsConfiguration));
  } catch {
    srs = resolveSrsConfig({});
  }
  return { userId, displayName: user.displayName, settings, srs, timeZone: settings.timezone || "Europe/Rome" };
}
