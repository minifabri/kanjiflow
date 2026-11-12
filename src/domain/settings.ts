/** Impostazioni utente: schema Zod condiviso tra form, server action e import/export. */
import { z } from "zod";

export const settingsSchema = z.object({
  dailyLessonLimit: z.coerce.number().int().min(0).max(200),
  dailyGrammarLessons: z.coerce.number().int().min(0).max(20),
  lessonBatchSize: z.coerce.number().int().min(1).max(20),
  maxApprenticeItems: z.coerce.number().int().min(10).max(1000),
  studyPath: z.enum(["guided", "jlpt", "custom"]),
  targetJlpt: z.enum(["N5", "N4", "N3", "N2", "N1"]),
  typoTolerance: z.enum(["off", "conservative", "lenient"]),
  questionPriority: z.enum(["balanced", "meaning_first", "reading_first"]),
  showFurigana: z.boolean(),
  showRomajiHints: z.boolean(),
  theme: z.enum(["dark", "light", "system"]),
  interfaceLanguage: z.enum(["it", "en"]),
  timezone: z.string().min(1).max(64),
});

export type SettingsInput = z.infer<typeof settingsSchema>;

export const notificationPrefsSchema = z
  .object({ reviewReminders: z.boolean().default(false), minReviewsForReminder: z.number().int().min(1).max(500).default(10) })
  .default({ reviewReminders: false, minReviewsForReminder: 10 });

export function parseJson(raw: string | null | undefined): unknown {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
