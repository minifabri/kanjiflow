/**
 * Dagli esercizi scritti dall'autore a quelli mostrati: frase con lo spazio vuoto, quattro risposte,
 * indice di quella corretta e frase completa da mostrare dopo la risposta. Puro.
 *
 * - choice (文法形式の判断): la frase ha un segnaposto e quattro alternative.
 * - order (文の組み立て): quattro pezzi da ordinare; come al JLPT si risponde solo con il pezzo che va alla ★.
 */
import { stableFraction } from "../srs/engine";
import { BLANK, type GrammarExerciseSource } from "./content";

export interface BuiltExercise {
  kind: "choice" | "order";
  /** Markup della frase mostrata. */
  prompt: string;
  /** Markup delle quattro risposte. */
  choices: string[];
  answerIndex: number;
  /** Markup della frase completa. */
  solution: string;
  translation: string;
  explanation: string;
}

export const SLOT = "＿＿";
export const STAR = "★";

/** Permutazione deterministica di 0..3: stabile tra import, diversa da esercizio a esercizio, mai l'identità. */
export function shuffleOrder(seed: string): number[] {
  const order = [0, 1, 2, 3];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(stableFraction(`${seed}:${i}`) * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  // Pezzi già nell'ordine giusto renderebbero l'esercizio banale.
  if (order.every((v, i) => v === i)) order.push(order.shift()!);
  return order;
}

export function buildExercise(source: GrammarExerciseSource, seed: string): BuiltExercise {
  if (source.kind === "choice") {
    const parts = source.prompt.split(BLANK);
    if (parts.length !== 2) throw new Error(`L'esercizio deve avere un solo segnaposto ${BLANK}: "${source.prompt}"`);
    return {
      kind: "choice",
      prompt: source.prompt,
      choices: source.choices,
      answerIndex: source.answer,
      solution: parts[0] + source.choices[source.answer]! + parts[1],
      translation: source.it,
      explanation: source.explanation,
    };
  }
  const order = shuffleOrder(seed);
  const slots = [0, 1, 2, 3].map((i) => (i === source.star ? STAR : SLOT)).join(" ");
  return {
    kind: "order",
    prompt: `${source.before} ${slots} ${source.after}`.trim(),
    choices: order.map((i) => source.pieces[i]!),
    answerIndex: order.indexOf(source.star),
    solution: source.before + source.pieces.join("") + source.after,
    translation: source.it,
    explanation: source.explanation,
  };
}
