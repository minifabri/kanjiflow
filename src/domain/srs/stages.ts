/**
 * Modello a stati finiti dello SRS.
 *
 * Stadio 0 è "sbloccato ma non ancora studiato" (in coda lezioni): non è uno
 * stadio di ripasso. Gli stadi 1–8 sono stadi di apprendimento con un intervallo
 * associato; lo stadio 9 (Bruciato) è terminale e non genera ripassi.
 */
export const SRS_STAGES = [
  { id: 0, key: "lesson", group: "lesson", label: "Lezione" },
  { id: 1, key: "apprentice1", group: "apprentice", label: "Apprendista 1" },
  { id: 2, key: "apprentice2", group: "apprentice", label: "Apprendista 2" },
  { id: 3, key: "apprentice3", group: "apprentice", label: "Apprendista 3" },
  { id: 4, key: "apprentice4", group: "apprentice", label: "Apprendista 4" },
  { id: 5, key: "guru1", group: "guru", label: "Guru 1" },
  { id: 6, key: "guru2", group: "guru", label: "Guru 2" },
  { id: 7, key: "master", group: "master", label: "Maestro" },
  { id: 8, key: "enlightened", group: "enlightened", label: "Illuminato" },
  { id: 9, key: "burned", group: "burned", label: "Bruciato" },
] as const;

export type SrsStage = (typeof SRS_STAGES)[number]["id"];
export type SrsStageKey = (typeof SRS_STAGES)[number]["key"];
export type SrsGroup = (typeof SRS_STAGES)[number]["group"];

export const LESSON_STAGE = 0 as const;
export const FIRST_REVIEW_STAGE = 1 as const;
export const GURU_STAGE = 5 as const;
export const BURNED_STAGE = 9 as const;
export const MAX_STAGE = BURNED_STAGE;

/** Stadi che hanno un intervallo di ripasso (1–8). */
export const REVIEWABLE_STAGES = [1, 2, 3, 4, 5, 6, 7, 8] as const;
export type ReviewableStage = (typeof REVIEWABLE_STAGES)[number];

export function isSrsStage(n: number): n is SrsStage {
  return Number.isInteger(n) && n >= 0 && n <= MAX_STAGE;
}

export function assertSrsStage(n: number): SrsStage {
  if (!isSrsStage(n)) throw new RangeError(`Stadio SRS non valido: ${n}`);
  return n;
}

export function isReviewable(stage: SrsStage): stage is ReviewableStage {
  return stage >= FIRST_REVIEW_STAGE && stage < BURNED_STAGE;
}

export function stageGroup(stage: SrsStage): SrsGroup {
  return SRS_STAGES[stage].group;
}

export function stageLabel(stage: SrsStage): string {
  return SRS_STAGES[stage].label;
}

/** "Appreso" ai fini di sblocchi e statistiche: Guru o superiore. */
export function isPassed(stage: SrsStage): boolean {
  return stage >= GURU_STAGE;
}
