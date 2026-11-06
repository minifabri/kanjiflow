import "server-only";
import { prisma } from "@/server/db";
import { currentUser } from "@/server/auth/current-user";
import { resolveSrsConfig, type SrsConfig } from "@/domain/srs";
import { parseJson } from "@/domain/settings";
import type { UserSettings } from "@/generated/prisma/client";

export interface StudyContext {
  userId: string;
  username: string | null;
  role: string;
  displayName: string;
  settings: UserSettings;
  srs: SrsConfig;
  timeZone: string;
}

/** Contesto dell'utente della richiesta: ogni lettura e scrittura di progressi passa da qui. */
export async function getStudyContext(): Promise<StudyContext> {
  const me = await currentUser();
  const userId = me.id;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { settings: true } });
  const settings = user.settings ?? (await prisma.userSettings.create({ data: { userId } }));
  let srs: SrsConfig;
  try {
    srs = resolveSrsConfig(parseJson(settings.srsConfiguration));
  } catch {
    srs = resolveSrsConfig({});
  }
  return { userId, username: me.username, role: me.role, displayName: user.displayName, settings, srs, timeZone: settings.timezone || "Europe/Rome" };
}
