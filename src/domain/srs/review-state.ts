/**
 * Stato di un singolo soggetto durante una sessione di ripasso.
 * Puro: ricostruibile dai tentativi salvati, quindi sessioni interrotte
 * riprendono esattamente dal punto in cui erano rimaste.
 */
export type QuestionType = "meaning" | "reading";

export interface AttemptLike {
  questionType: QuestionType;
  isCorrect: boolean;
}

export interface ItemReviewState {
  required: readonly QuestionType[];
  meaningDone: boolean;
  readingDone: boolean;
  meaningIncorrect: number;
  readingIncorrect: number;
}

export function requiredQuestions(subjectType: "radical" | "kanji" | "vocabulary", hasReadings: boolean): QuestionType[] {
  // I radicali sono sempre solo-significato. Kanji e vocaboli chiedono la lettura
  // solo se ne hanno almeno una accettata.
  if (subjectType === "radical" || !hasReadings) return ["meaning"];
  return ["meaning", "reading"];
}

export function initialItemState(required: readonly QuestionType[]): ItemReviewState {
  if (required.length === 0) throw new Error("Almeno una dimensione è richiesta");
  return { required, meaningDone: false, readingDone: false, meaningIncorrect: 0, readingIncorrect: 0 };
}

export function recordAttempt(state: ItemReviewState, attempt: AttemptLike): ItemReviewState {
  if (!state.required.includes(attempt.questionType)) {
    throw new Error(`Domanda di tipo ${attempt.questionType} non richiesta per questo soggetto`);
  }
  const done = attempt.questionType === "meaning" ? state.meaningDone : state.readingDone;
  if (done) return state; // tentativi oltre la risposta corretta sono ignorati (idempotenza)
  if (attempt.questionType === "meaning") {
    return attempt.isCorrect
      ? { ...state, meaningDone: true }
      : { ...state, meaningIncorrect: state.meaningIncorrect + 1 };
  }
  return attempt.isCorrect
    ? { ...state, readingDone: true }
    : { ...state, readingIncorrect: state.readingIncorrect + 1 };
}

export function replayAttempts(required: readonly QuestionType[], attempts: readonly AttemptLike[]): ItemReviewState {
  return attempts.reduce(recordAttempt, initialItemState(required));
}

export function isItemComplete(state: ItemReviewState): boolean {
  return state.required.every((q) => (q === "meaning" ? state.meaningDone : state.readingDone));
}

export function pendingQuestions(state: ItemReviewState): QuestionType[] {
  return state.required.filter((q) => (q === "meaning" ? !state.meaningDone : !state.readingDone));
}
