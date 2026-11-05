/** Formato del dataset versionato (data/dataset/*.json), validato con Zod all'import. */
import { z } from "zod";

export const SUBJECT_TYPES = ["radical", "kanji", "vocabulary"] as const;
export type SubjectType = (typeof SUBJECT_TYPES)[number];

export const datasetMeaningSchema = z.object({
  language: z.enum(["it", "en"]),
  meaning: z.string().min(1),
  isPrimary: z.boolean(),
  origin: z.enum(["dictionary", "generated"]),
});

export const datasetReadingSchema = z.object({
  reading: z.string().min(1),
  readingType: z.enum(["onyomi", "kunyomi", "nanori", "vocabulary"]),
  isPrimary: z.boolean(),
  isAccepted: z.boolean(),
});

export const datasetExampleSchema = z.object({
  japaneseText: z.string().min(1),
  translatedText: z.string().min(1),
  translationLanguage: z.enum(["en", "it"]),
  sourceKey: z.string(),
  externalId: z.string().nullable(),
  verified: z.boolean(),
});

export const datasetClassificationSchema = z.object({
  system: z.string(),
  value: z.string(),
  sourceKey: z.string(),
  confidence: z.enum(["official", "community", "derived"]),
});

export const datasetSubjectSchema = z.object({
  slug: z.string().min(3),
  type: z.enum(SUBJECT_TYPES),
  characters: z.string().min(1),
  primaryMeaning: z.string().min(1),
  lessonOrder: z.number().int(),
  strokeCount: z.number().int().nullable(),
  frequencyRank: z.number().int().nullable(),
  partOfSpeech: z.array(z.string()).nullable(),
  sourceKey: z.string(),
  meanings: z.array(datasetMeaningSchema).min(1),
  readings: z.array(datasetReadingSchema),
  components: z.array(z.string()),
  classifications: z.array(datasetClassificationSchema),
  examples: z.array(datasetExampleSchema),
});

export const datasetSourceSchema = z.object({
  key: z.string(),
  name: z.string(),
  url: z.string().nullable(),
  license: z.string(),
  attribution: z.string(),
  version: z.string(),
});

export const datasetSchema = z.object({
  format: z.literal("kanjiflow-dataset/1"),
  version: z.string(),
  sources: z.array(datasetSourceSchema),
  subjects: z.array(datasetSubjectSchema),
});

export type Dataset = z.infer<typeof datasetSchema>;
export type DatasetSubject = z.infer<typeof datasetSubjectSchema>;
