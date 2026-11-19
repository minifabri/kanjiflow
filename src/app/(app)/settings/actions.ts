"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/server/db";
import { getStudyContext } from "@/server/study/context";
import { settingsSchema } from "@/domain/settings";
import { REVIEWABLE_STAGES, srsConfigSchema } from "@/domain/srs";

export type SettingsState = { ok: boolean; message: string } | null;

export async function updateSettingsAction(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const ctx = await getStudyContext();
  const parsed = settingsSchema.safeParse({
    dailyLessonLimit: formData.get("dailyLessonLimit"),
    dailyGrammarLessons: formData.get("dailyGrammarLessons"),
    lessonBatchSize: formData.get("lessonBatchSize"),
    maxApprenticeItems: formData.get("maxApprenticeItems"),
    studyPath: formData.get("studyPath"),
    targetJlpt: formData.get("targetJlpt"),
    typoTolerance: formData.get("typoTolerance"),
    questionPriority: formData.get("questionPriority"),
    showFurigana: formData.get("showFurigana") === "on",
    showRomajiHints: formData.get("showRomajiHints") === "on",
    theme: formData.get("theme"),
    interfaceLanguage: formData.get("interfaceLanguage"),
    timezone: formData.get("timezone"),
  });
  if (!parsed.success) return { ok: false, message: "Valori non validi: controlla i campi numerici." };

  const intervalsHours: Record<string, number> = {};
  for (const s of REVIEWABLE_STAGES) {
    const v = Number(formData.get(`interval-${s}`));
    if (Number.isFinite(v) && v > 0) intervalsHours[String(s)] = v;
  }
  const srs = srsConfigSchema.safeParse({
    intervalsHours,
    roundDownToHour: formData.get("roundDownToHour") === "on",
    guruPenaltyFactor: Number(formData.get("guruPenaltyFactor") ?? 2),
  });
  if (!srs.success) return { ok: false, message: "Intervalli SRS non validi." };
  const ordered = REVIEWABLE_STAGES.map((s) => intervalsHours[String(s)] ?? 0);
  if (ordered.some((v, i) => i > 0 && v > 0 && ordered[i - 1]! > 0 && v < ordered[i - 1]!)) {
    return { ok: false, message: "Gli intervalli devono essere crescenti da uno stadio al successivo." };
  }

  try {
    Intl.DateTimeFormat("it-IT", { timeZone: parsed.data.timezone });
  } catch {
    return { ok: false, message: "Fuso orario non riconosciuto." };
  }

  const { interfaceLanguage, ...settings } = parsed.data;
  const notif = z.object({ reviewReminders: z.boolean() }).parse({ reviewReminders: formData.get("reviewReminders") === "on" });
  await prisma.$transaction([
    prisma.userSettings.update({
      where: { userId: ctx.userId },
      data: { ...settings, srsConfiguration: JSON.stringify(srs.data), notificationPreferences: JSON.stringify(notif) },
    }),
    prisma.user.update({ where: { id: ctx.userId }, data: { interfaceLanguage } }),
  ]);
  revalidatePath("/", "layout");
  return { ok: true, message: "Impostazioni salvate." };
}
