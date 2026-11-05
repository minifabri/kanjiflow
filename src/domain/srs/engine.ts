/**
 * Motore SRS: funzioni pure, nessuna dipendenza da React o dal database.
 *
 * POLITICA DI REGRESSIONE (documentata e deterministica)
 * ------------------------------------------------------
 * Un ripasso è concluso solo quando tutte le dimensioni richieste (significato,
 * e lettura se il soggetto ne ha una) hanno ricevuto una risposta corretta.
 * Durante il ripasso si contano le risposte errate per dimensione.
 *
 *   errori      = erroriSignificato + erroriLettura
 *   se errori = 0:   nuovoStadio = stadio + 1           (9 = Bruciato)
 *   altrimenti:
 *     arretramento = ceil(errori / 2)
 *     fattore      = stadio >= Guru 1 ? guruPenaltyFactor (default 2) : 1
 *     nuovoStadio  = max(1, stadio - arretramento * fattore)
 *
 * Esempi (fattore 2): Apprendista 4 con 1 errore → Apprendista 3;
 * Guru 2 con 1 errore → Apprendista 4; Illuminato con 3 errori → Apprendista 4.
 * Un errore singolo non azzera mai un elemento maturo; gli errori ripetuti
 * pesano progressivamente. Lo stadio minimo è sempre Apprendista 1.
 */
import type { SrsConfig } from "./config";
import { DEFAULT_SRS_CONFIG } from "./config";
import {
  BURNED_STAGE,
  FIRST_REVIEW_STAGE,
  GURU_STAGE,
  LESSON_STAGE,
  assertSrsStage,
  isReviewable,
  type ReviewableStage,
  type SrsStage,
} from "./stages";

export interface ReviewOutcome {
  meaningIncorrect: number;
  readingIncorrect: number;
}

export interface Transition {
  previousStage: SrsStage;
  nextStage: SrsStage;
  /** null quando il soggetto è stato bruciato. */
  nextReviewAt: Date | null;
  burned: boolean;
  passed: boolean;
}

function nonNegInt(n: number, name: string): number {
  if (!Number.isInteger(n) || n < 0) throw new RangeError(`${name} deve essere un intero ≥ 0, ricevuto ${n}`);
  return n;
}

/** Calcola il nuovo stadio dopo un ripasso. Pura e totale sugli input validi. */
export function computeNextStage(
  current: SrsStage,
  outcome: ReviewOutcome,
  config: Pick<SrsConfig, "guruPenaltyFactor"> = DEFAULT_SRS_CONFIG,
): SrsStage {
  assertSrsStage(current);
  if (!isReviewable(current)) {
    throw new RangeError(`Lo stadio ${current} non è ripassabile (lezione o bruciato)`);
  }
  const errors =
    nonNegInt(outcome.meaningIncorrect, "meaningIncorrect") +
    nonNegInt(outcome.readingIncorrect, "readingIncorrect");

  if (errors === 0) return (current + 1) as SrsStage;

  const steps = Math.ceil(errors / 2);
  const factor = current >= GURU_STAGE ? config.guruPenaltyFactor : 1;
  return Math.max(FIRST_REVIEW_STAGE, current - steps * factor) as SrsStage;
}

/** Calcola la prossima scadenza per uno stadio raggiunto. */
export function computeNextReviewAt(stage: SrsStage, now: Date, config: SrsConfig = DEFAULT_SRS_CONFIG): Date | null {
  if (stage === BURNED_STAGE) return null;
  if (!isReviewable(stage)) throw new RangeError(`Nessun intervallo per lo stadio ${stage}`);
  const due = new Date(now.getTime() + config.intervalsMs[stage as ReviewableStage]);
  if (config.roundDownToHour) due.setUTCMinutes(0, 0, 0);
  return due;
}

/** Transizione completa a seguito di un ripasso concluso. */
export function applyReview(
  current: SrsStage,
  outcome: ReviewOutcome,
  now: Date,
  config: SrsConfig = DEFAULT_SRS_CONFIG,
): Transition {
  const nextStage = computeNextStage(current, outcome, config);
  return {
    previousStage: current,
    nextStage,
    nextReviewAt: computeNextReviewAt(nextStage, now, config),
    burned: nextStage === BURNED_STAGE,
    passed: nextStage > current,
  };
}

/** Completamento della lezione: stadio 0 → Apprendista 1. */
export function applyLessonCompletion(current: SrsStage, now: Date, config: SrsConfig = DEFAULT_SRS_CONFIG): Transition {
  if (current !== LESSON_STAGE) throw new RangeError(`Lezione già completata (stadio ${current})`);
  return {
    previousStage: current,
    nextStage: FIRST_REVIEW_STAGE,
    nextReviewAt: computeNextReviewAt(FIRST_REVIEW_STAGE, now, config),
    burned: false,
    passed: true,
  };
}

/** Ristudio di un elemento bruciato. */
export function applyResurrection(current: SrsStage, now: Date, config: SrsConfig = DEFAULT_SRS_CONFIG): Transition {
  if (current !== BURNED_STAGE) throw new RangeError(`Solo gli elementi bruciati possono essere ristudiati`);
  const nextStage = config.resurrectStage;
  return {
    previousStage: current,
    nextStage,
    nextReviewAt: computeNextReviewAt(nextStage, now, config),
    burned: false,
    passed: false,
  };
}

/**
 * Elemento segnato come "già conosciuto" (es. kanji N5/N4).
 * Le scadenze vengono distribuite in modo deterministico sull'intervallo dello
 * stadio scelto, per evitare che centinaia di ripassi arrivino lo stesso giorno.
 * `spreadKey` deve essere stabile (es. id del soggetto).
 */
export function applyMarkKnown(
  targetStage: SrsStage,
  spreadKey: string,
  now: Date,
  config: SrsConfig = DEFAULT_SRS_CONFIG,
): Pick<Transition, "nextStage" | "nextReviewAt" | "burned"> {
  if (targetStage === BURNED_STAGE) return { nextStage: BURNED_STAGE, nextReviewAt: null, burned: true };
  if (!isReviewable(targetStage) || targetStage < GURU_STAGE) {
    throw new RangeError("Un elemento conosciuto va almeno a Guru 1 oppure Bruciato");
  }
  const interval = config.intervalsMs[targetStage];
  const fraction = stableFraction(spreadKey);
  const minOffset = 6 * 60 * 60 * 1000; // non prima di 6 ore
  const offset = minOffset + Math.floor(fraction * Math.max(0, interval - minOffset));
  const due = new Date(now.getTime() + offset);
  if (config.roundDownToHour) due.setUTCMinutes(0, 0, 0);
  return { nextStage: targetStage, nextReviewAt: due, burned: false };
}

/** Hash FNV-1a → frazione in [0, 1). Deterministico, indipendente dalla piattaforma. */
export function stableFraction(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}
