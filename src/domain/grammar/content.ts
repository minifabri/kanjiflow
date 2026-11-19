/** Formato dei punti grammaticali versionati (data/curated/grammar/*.json), validato con Zod all'import. */
import { z } from "zod";

export const GRAMMAR_LEVELS = ["N4", "N3"] as const;
export type GrammarLevel = (typeof GRAMMAR_LEVELS)[number];

/** Segnaposto della risposta in un esercizio a scelta: parentesi a tutta larghezza con uno spazio ideografico. */
export const BLANK = "（　）";

const choiceExerciseSchema = z.object({
  kind: z.literal("choice"),
  /** Frase con un solo segnaposto `（　）`. */
  prompt: z.string().min(1),
  choices: z.array(z.string().min(1)).length(4),
  answer: z.number().int().min(0).max(3),
  /** Traduzione italiana della frase completa. */
  it: z.string().min(1),
  explanation: z.string().min(1),
});

const orderExerciseSchema = z.object({
  kind: z.literal("order"),
  before: z.string(),
  /** I quattro pezzi nell'ordine corretto: l'import li mescola. */
  pieces: z.array(z.string().min(1)).length(4),
  /** Posizione della ★ (0–3): la risposta è il pezzo che va lì. */
  star: z.number().int().min(0).max(3),
  after: z.string(),
  it: z.string().min(1),
  explanation: z.string().min(1),
});

export const grammarExerciseSchema = z.discriminatedUnion("kind", [choiceExerciseSchema, orderExerciseSchema]);

export const grammarPointSchema = z.object({
  slug: z.string().regex(/^n[34]-[a-z0-9-]+$/),
  level: z.enum(GRAMMAR_LEVELS),
  /** Il costrutto, con markup se contiene kanji: 〜{間|あいだ}に */
  title: z.string().min(1),
  meaning: z.string().min(1),
  /** Come si forma, con markup. */
  structure: z.string().min(1),
  explanation: z.string().min(1),
  examples: z.array(z.object({ ja: z.string().min(1), it: z.string().min(1) })).min(1),
  exercises: z.array(grammarExerciseSchema).min(2),
});

export const grammarFileSchema = z.object({
  format: z.literal("kanjiflow-grammar/1"),
  points: z.array(grammarPointSchema),
});

export type GrammarExerciseSource = z.infer<typeof grammarExerciseSchema>;
export type GrammarPointSource = z.infer<typeof grammarPointSchema>;
