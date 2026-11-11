/**
 * Leggibilità di un brano rispetto ai progressi sui kanji, e regola del furigana adattivo.
 * "Conosciuto" ha lo stesso significato che nel resto dell'app: Guru o oltre, oppure segnato come noto.
 */
import { isPassedProgress, type ProgressInfo } from "../curriculum/lesson-queue";

export type KanjiState = "known" | "learning" | "new";
export type FuriganaMode = "adaptive" | "always" | "never";

export function kanjiState(p: ProgressInfo | undefined): KanjiState {
  if (!p) return "new";
  return isPassedProgress(p) ? "known" : "learning";
}

export interface Readability {
  total: number;
  known: number;
  learning: number;
  missing: number;
  /** Percentuale di kanji conosciuti, 100 se il brano non ha kanji del percorso. */
  percent: number;
}

export function readability(kanjiIds: readonly string[], progress: ReadonlyMap<string, ProgressInfo>): Readability {
  let known = 0;
  let learning = 0;
  for (const id of kanjiIds) {
    const state = kanjiState(progress.get(id));
    if (state === "known") known++;
    else if (state === "learning") learning++;
  }
  const total = kanjiIds.length;
  return { total, known, learning, missing: total - known - learning, percent: total === 0 ? 100 : Math.round((known / total) * 100) };
}

/**
 * Il furigana adattivo compare solo dove serve: su una parola che contiene almeno un kanji non ancora
 * conosciuto, o un kanji fuori dal percorso (`kanjiInWord` > stati disponibili).
 */
export function showFurigana(mode: FuriganaMode, states: readonly KanjiState[], kanjiInWord: number): boolean {
  if (mode === "always") return true;
  if (mode === "never") return false;
  return states.length < kanjiInWord || states.some((s) => s !== "known");
}
