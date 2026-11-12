/** Formato dei brani versionati (data/curated/reading/*.json), validato con Zod all'import. */
import { z } from "zod";

export const READING_LEVELS = ["N4", "N3"] as const;
export type ReadingLevel = (typeof READING_LEVELS)[number];
export const READING_FORMATS = ["short", "medium", "info"] as const;
export type ReadingFormat = (typeof READING_FORMATS)[number];

export const FORMAT_LABEL: Record<ReadingFormat, string> = {
  short: "Brano breve",
  medium: "Brano medio",
  info: "Ricerca di informazioni",
};

/** Tempo indicativo in modalità esame, in secondi. */
export const FORMAT_SECONDS: Record<ReadingFormat, number> = { short: 180, medium: 420, info: 300 };

export const readingQuestionSchema = z.object({
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).length(4),
  answer: z.number().int().min(0).max(3),
  explanation: z.string().min(1),
});

export const readingPassageSchema = z
  .object({
    slug: z.string().regex(/^n[34]-[a-z0-9-]+$/),
    level: z.enum(READING_LEVELS),
    format: z.enum(READING_FORMATS),
    title: z.string().min(1),
    titleIt: z.string().min(1),
    /** Un elemento per paragrafo; "\n" va a capo dentro il paragrafo (avvisi, tabelle). */
    body: z.array(z.string().min(1)).min(1),
    translation: z.array(z.string().min(1)).min(1),
    questions: z.array(readingQuestionSchema).min(1),
  })
  .refine((p) => p.body.length === p.translation.length, { message: "La traduzione deve avere un elemento per paragrafo" });

export const readingFileSchema = z.object({
  format: z.literal("kanjiflow-reading/1"),
  passages: z.array(readingPassageSchema),
});

export type ReadingPassageSource = z.infer<typeof readingPassageSchema>;
export type ReadingFile = z.infer<typeof readingFileSchema>;
